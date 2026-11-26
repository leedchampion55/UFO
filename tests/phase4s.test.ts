import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { cleanupEncryptedDatabaseBackups, databaseBackupStorageFromEnvironment, retrieveEncryptedDatabaseBackup, storeEncryptedDatabaseBackup } from "@/lib/database-backup";
import { validateServiceEnvironment } from "@/lib/env";
import type { PrivateObjectStorage, StoredObjectInfo } from "@/lib/storage/types";
import { proxy } from "@/proxy";

const gatewayKeys = ["APP_ENVIRONMENT", "STAGING_ACCESS_ENABLED", "STAGING_ACCESS_USERNAME", "STAGING_ACCESS_PASSWORD"] as const;

async function withGatewayEnvironment(values: Record<string, string | undefined>, callback: () => Promise<void> | void) {
  const previous = Object.fromEntries(gatewayKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of gatewayKeys) {
      const value = values[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await callback();
  } finally {
    for (const key of gatewayKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

class MemoryBackupStorage implements PrivateObjectStorage {
  objects = new Map<string, Buffer>();
  failChecksumPut = false;
  async put(key: string, data: Buffer) {
    if (this.failChecksumPut && key.endsWith(".sha256")) throw new Error("CONTROLLED_UPLOAD_FAILURE");
    this.objects.set(key, Buffer.from(data));
    return { key, byteSize: data.byteLength };
  }
  async get(key: string) { const data = this.objects.get(key); if (!data) throw new Error("NOT_FOUND"); return Buffer.from(data); }
  async delete(key: string) { this.objects.delete(key); }
  async exists(key: string) { return this.objects.has(key); }
  async list(prefix: string) { return [...this.objects].filter(([key]) => key.startsWith(prefix)).map(([key, data]) => ({ key, byteSize: data.byteLength } satisfies StoredObjectInfo)); }
}

const pooledUrl = "postgresql://runtime@ep-ufo-pooler.eu-west-2.aws.neon.tech/ufo?sslmode=require";
const directUrl = "postgresql://migration@ep-ufo.eu-west-2.aws.neon.tech/ufo?sslmode=require";
const production = { NODE_ENV: "production", APP_RUNTIME_MODE: "production" } satisfies NodeJS.ProcessEnv;

describe("Phase 4S.1 staging hardening", { concurrency: false }, () => {
  it("blocks unauthenticated staging traffic and permits valid independent gateway credentials", async () => {
    await withGatewayEnvironment({ APP_ENVIRONMENT: "staging", STAGING_ACCESS_ENABLED: "true", STAGING_ACCESS_USERNAME: "operator", STAGING_ACCESS_PASSWORD: "a-unique-staging-password-that-is-long" }, () => {
      const denied = proxy(new NextRequest("https://staging.ufo.test/register"));
      assert.equal(denied.status, 401);
      assert.match(denied.headers.get("www-authenticate") ?? "", /^Basic /);
      assert.equal(denied.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
      const invalid = proxy(new NextRequest("https://staging.ufo.test/api/encounters", { method: "POST", headers: { authorization: `Basic ${Buffer.from("operator:wrong").toString("base64")}` } }));
      assert.equal(invalid.status, 401);
      const authorization = `Basic ${Buffer.from("operator:a-unique-staging-password-that-is-long").toString("base64")}`;
      const allowed = proxy(new NextRequest("https://staging.ufo.test/admin", { headers: { authorization } }));
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    });
  });

  it("allows only exact health GETs and the exact signed-webhook route through the gateway", async () => {
    await withGatewayEnvironment({ APP_ENVIRONMENT: "staging", STAGING_ACCESS_ENABLED: "true", STAGING_ACCESS_USERNAME: "operator", STAGING_ACCESS_PASSWORD: "a-unique-staging-password-that-is-long" }, () => {
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/health/live")).status, 200);
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/health/ready")).status, 200);
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/health/live", { method: "POST" })).status, 401);
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/api/webhooks/resend", { method: "POST" })).status, 200);
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/api/webhooks/resend", { method: "GET" })).status, 401);
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/api/auth/sign-in", { method: "POST" })).status, 401);
    });
  });

  it("fails closed for incomplete staging configuration without restricting normal local or production traffic", async () => {
    await withGatewayEnvironment({ APP_ENVIRONMENT: "staging", STAGING_ACCESS_ENABLED: "true", STAGING_ACCESS_USERNAME: undefined, STAGING_ACCESS_PASSWORD: undefined }, () => {
      assert.equal(proxy(new NextRequest("https://staging.ufo.test/")).status, 503);
    });
    await withGatewayEnvironment({ APP_ENVIRONMENT: "local", STAGING_ACCESS_ENABLED: "false", STAGING_ACCESS_USERNAME: undefined, STAGING_ACCESS_PASSWORD: undefined }, () => {
      assert.equal(proxy(new NextRequest("http://localhost:3000/")).status, 200);
    });
    await withGatewayEnvironment({ APP_ENVIRONMENT: "production", STAGING_ACCESS_ENABLED: "false", STAGING_ACCESS_USERNAME: undefined, STAGING_ACCESS_PASSWORD: undefined }, () => {
      assert.equal(proxy(new NextRequest("https://ufo.test/")).status, 200);
    });
  });

  it("validates least-privilege web, worker, migration, maintenance and backup environments", () => {
    const liveR2 = { STORAGE_DRIVER: "r2", R2_ENDPOINT: "https://account.eu.r2.cloudflarestorage.com", R2_BUCKET: "staging-evidence", R2_ACCESS_KEY_ID: "runtimekey", R2_SECRET_ACCESS_KEY: "r".repeat(32), R2_REGION: "auto", R2_FORCE_PATH_STYLE: "false" };
    const web = { ...production, APP_ENVIRONMENT: "staging", STAGING_ACCESS_ENABLED: "true", STAGING_ACCESS_USERNAME: "operator", STAGING_ACCESS_PASSWORD: "s".repeat(40), DATABASE_URL: pooledUrl, BETTER_AUTH_SECRET: "a".repeat(40), RATE_LIMIT_SECRET: "b".repeat(40), BETTER_AUTH_URL: "https://staging.ufo.test", NEXT_PUBLIC_APP_URL: "https://staging.ufo.test", TRUSTED_PROXY_MODE: "railway", EMAIL_DRIVER: "resend", RESEND_WEBHOOK_SECRET: `whsec_${"w".repeat(32)}`, ADMIN_NOTIFICATION_EMAIL: "operator@ufo.test", ...liveR2 } satisfies NodeJS.ProcessEnv;
    assert.equal(validateServiceEnvironment("web", web).DATABASE_URL, pooledUrl);
    assert.throws(() => validateServiceEnvironment("web", { ...web, DIRECT_URL: directUrl }), /privileged variables/);

    const worker = { ...production, DATABASE_URL: pooledUrl, RATE_LIMIT_SECRET: "b".repeat(40), EMAIL_DRIVER: "resend", RESEND_API_KEY: `re_${"k".repeat(32)}`, RESEND_FROM: "What the UFO?! <no-reply@notify.ufo.test>", RESEND_SENDING_DOMAIN: "notify.ufo.test" } satisfies NodeJS.ProcessEnv;
    assert.equal(validateServiceEnvironment("email-worker", worker).EMAIL_DRIVER, "resend");
    assert.throws(() => validateServiceEnvironment("email-worker", { ...worker, R2_SECRET_ACCESS_KEY: "r".repeat(32) }), /privileged variables/);
    assert.throws(() => validateServiceEnvironment("email-worker", { ...worker, RESEND_API_KEY: undefined }), /Resend configuration/);

    assert.equal(validateServiceEnvironment("migration", { ...production, DIRECT_URL: directUrl }).DIRECT_URL, directUrl);
    assert.throws(() => validateServiceEnvironment("migration", { ...production, DIRECT_URL: directUrl, DATABASE_URL: pooledUrl }), /privileged variables/);
    assert.equal(validateServiceEnvironment("media-maintenance", { ...production, DATABASE_URL: pooledUrl, ...liveR2 }).STORAGE_DRIVER, "r2");

    const databaseBackup = { ...production, BACKUP_DATABASE_URL: directUrl, BACKUP_ENCRYPTION_PASSPHRASE: "p".repeat(32), DATABASE_BACKUP_DRIVER: "r2", DATABASE_BACKUP_R2_ENDPOINT: "https://account.eu.r2.cloudflarestorage.com", DATABASE_BACKUP_R2_BUCKET: "staging-database-backups", DATABASE_BACKUP_R2_ACCESS_KEY_ID: "backupkey", DATABASE_BACKUP_R2_SECRET_ACCESS_KEY: "q".repeat(32), DATABASE_BACKUP_R2_REGION: "auto", DATABASE_BACKUP_R2_FORCE_PATH_STYLE: "false" } satisfies NodeJS.ProcessEnv;
    assert.equal(validateServiceEnvironment("database-backup", databaseBackup).DATABASE_BACKUP_DRIVER, "r2");
    assert.throws(() => validateServiceEnvironment("database-backup", { ...databaseBackup, DATABASE_URL: pooledUrl }), /privileged variables/);
    assert.throws(() => databaseBackupStorageFromEnvironment({ ...production, DATABASE_BACKUP_DRIVER: "local" }), /DURABLE_DESTINATION_REQUIRED/);
  });

  it("stores, verifies, retrieves and dry-run cleans encrypted backup objects", async () => {
    const storage = new MemoryBackupStorage();
    const oldKey = "database/what-the-ufo-20200101T000000Z.dump.enc";
    const currentKey = "database/what-the-ufo-20261126T000000Z.dump.enc";
    await storeEncryptedDatabaseBackup(storage, oldKey, Buffer.from("encrypted-old-archive"));
    await storeEncryptedDatabaseBackup(storage, currentKey, Buffer.from("encrypted-current-archive"));
    assert.equal((await retrieveEncryptedDatabaseBackup(storage, currentKey)).archive.toString(), "encrypted-current-archive");
    const preview = await cleanupEncryptedDatabaseBackups(storage, { before: new Date("2021-01-01T00:00:00Z") });
    assert.deepEqual(preview.keys, [oldKey]);
    assert.equal(await storage.exists(oldKey), true);
    await cleanupEncryptedDatabaseBackups(storage, { before: new Date("2021-01-01T00:00:00Z"), dryRun: false });
    assert.equal(await storage.exists(oldKey), false);
    assert.equal(await storage.exists(currentKey), true);
  });

  it("rejects failed, incomplete and corrupted backup transfers without leaking provider errors", async () => {
    const failed = new MemoryBackupStorage();
    failed.failChecksumPut = true;
    const key = "database/what-the-ufo-20261126T010000Z.dump.enc";
    await assert.rejects(() => storeEncryptedDatabaseBackup(failed, key, Buffer.from("encrypted")), /DATABASE_BACKUP_UPLOAD_FAILED/);
    assert.equal(failed.objects.size, 0);

    const incomplete = new MemoryBackupStorage();
    incomplete.objects.set(key, Buffer.from("encrypted"));
    await assert.rejects(() => retrieveEncryptedDatabaseBackup(incomplete, key), /DATABASE_BACKUP_INCOMPLETE/);
    incomplete.objects.set(`${key}.sha256`, Buffer.from(`${"0".repeat(64)}  ${key.split("/").at(-1)}\n`));
    await assert.rejects(() => retrieveEncryptedDatabaseBackup(incomplete, key), /DATABASE_BACKUP_CHECKSUM_MISMATCH/);
  });
});
