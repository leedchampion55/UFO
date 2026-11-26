import { createHash } from "node:crypto";
import path from "node:path";
import { LocalPrivateStorage } from "./storage/local";
import { R2PrivateStorage } from "./storage/r2";
import type { PrivateObjectStorage } from "./storage/types";

const BACKUP_KEY = /^database\/what-the-ufo-(\d{8}T\d{6}Z)\.dump\.enc$/;

function checksum(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function assertBackupKey(key: string) {
  if (!BACKUP_KEY.test(key)) throw new Error("INVALID_DATABASE_BACKUP_KEY");
}

function checksumPayload(key: string, digest: string) {
  return Buffer.from(`${digest}  ${path.posix.basename(key)}\n`, "utf8");
}

function parseChecksum(data: Buffer) {
  const match = data.toString("utf8").match(/^([a-f0-9]{64})\s{2}[^\r\n]+\r?\n$/);
  if (!match) throw new Error("DATABASE_BACKUP_CHECKSUM_INVALID");
  return match[1];
}

export function databaseBackupStorageFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const driver = environment.DATABASE_BACKUP_DRIVER ?? "local";
  const hosted = environment.NODE_ENV === "production" && environment.APP_RUNTIME_MODE !== "local";
  if (hosted && driver !== "r2") throw new Error("DATABASE_BACKUP_DURABLE_DESTINATION_REQUIRED");
  if (driver === "local") return new LocalPrivateStorage(environment.DATABASE_BACKUP_ROOT ?? ".data/database-backup-objects");
  if (environment.DATABASE_BACKUP_DRIVER !== "r2") throw new Error("DATABASE_BACKUP_DRIVER_INVALID");
  try {
    const endpoint = new URL(environment.DATABASE_BACKUP_R2_ENDPOINT ?? "");
    if (hosted && (endpoint.protocol !== "https:" || endpoint.pathname !== "/" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com") || environment.DATABASE_BACKUP_R2_FORCE_PATH_STYLE === "true")) throw new Error("DATABASE_BACKUP_R2_CONFIGURATION_INVALID");
  } catch {
    throw new Error("DATABASE_BACKUP_R2_CONFIGURATION_INVALID");
  }
  return R2PrivateStorage.fromEnvironment({
    ...environment,
    R2_ENDPOINT: environment.DATABASE_BACKUP_R2_ENDPOINT,
    R2_BUCKET: environment.DATABASE_BACKUP_R2_BUCKET,
    R2_ACCESS_KEY_ID: environment.DATABASE_BACKUP_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: environment.DATABASE_BACKUP_R2_SECRET_ACCESS_KEY,
    R2_REGION: environment.DATABASE_BACKUP_R2_REGION ?? "auto",
    R2_FORCE_PATH_STYLE: environment.DATABASE_BACKUP_R2_FORCE_PATH_STYLE ?? "false",
  });
}

export async function storeEncryptedDatabaseBackup(storage: PrivateObjectStorage, key: string, archive: Buffer) {
  assertBackupKey(key);
  if (!archive.length) throw new Error("DATABASE_BACKUP_ARCHIVE_EMPTY");
  const digest = checksum(archive);
  try {
    await storage.put(key, archive, { contentType: "application/octet-stream" });
    await storage.put(`${key}.sha256`, checksumPayload(key, digest), { contentType: "text/plain" });
    const verified = await retrieveEncryptedDatabaseBackup(storage, key);
    if (verified.digest !== digest) throw new Error("DATABASE_BACKUP_CHECKSUM_MISMATCH");
    return { key, byteSize: archive.byteLength, digest };
  } catch {
    await storage.delete(`${key}.sha256`).catch(() => undefined);
    await storage.delete(key).catch(() => undefined);
    throw new Error("DATABASE_BACKUP_UPLOAD_FAILED");
  }
}

export async function retrieveEncryptedDatabaseBackup(storage: PrivateObjectStorage, key: string) {
  assertBackupKey(key);
  let archive: Buffer;
  let expected: string;
  try {
    [archive, expected] = await Promise.all([
      storage.get(key),
      storage.get(`${key}.sha256`).then(parseChecksum),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_BACKUP_CHECKSUM_INVALID") throw error;
    throw new Error("DATABASE_BACKUP_INCOMPLETE");
  }
  const digest = checksum(archive);
  if (digest !== expected) throw new Error("DATABASE_BACKUP_CHECKSUM_MISMATCH");
  return { key, archive, digest };
}

export async function cleanupEncryptedDatabaseBackups(storage: PrivateObjectStorage, options: { before: Date; dryRun?: boolean }) {
  const dryRun = options.dryRun ?? true;
  const objects = await storage.list("database");
  const keys = new Set(objects.map((object) => object.key));
  const candidates = objects
    .filter((object) => BACKUP_KEY.test(object.key) && keys.has(`${object.key}.sha256`))
    .filter((object) => {
      const timestamp = BACKUP_KEY.exec(object.key)?.[1];
      if (!timestamp) return false;
      const date = new Date(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`);
      return date < options.before;
    })
    .map((object) => object.key)
    .sort();
  if (!dryRun) {
    for (const key of candidates) {
      await storage.delete(`${key}.sha256`);
      await storage.delete(key);
    }
  }
  return { dryRun, count: candidates.length, keys: candidates };
}
