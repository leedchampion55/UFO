import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { Webhook } from "standardwebhooks";
import { POST as submitEncounter } from "@/app/api/encounters/route";
import DevelopmentMailbox from "@/app/dev/mail/page";
import { deleteDevelopmentEmailsForRecipient, listDevelopmentEmails } from "@/lib/dev-mail";
import { cleanupEmailOutbox, enqueueTransactionalEmail, processEmailOutbox, recipientHash } from "@/lib/email/outbox";
import { ResendEmailProvider } from "@/lib/email/provider";
import { EmailProviderError, type EmailProvider, type OutboundEmail } from "@/lib/email/types";
import { processResendWebhook, verifyResendWebhook } from "@/lib/email/webhooks";
import { validateRuntimeEnvironment } from "@/lib/env";
import { deleteMediaObject, reconcileMediaStorage, uploadMediaObject } from "@/lib/media-lifecycle";
import { prisma } from "@/lib/prisma";
import { R2PrivateStorage } from "@/lib/storage/r2";
import type { PrivateObjectStorage, StoredObjectInfo } from "@/lib/storage/types";

const marker = randomUUID();
const notificationEmail = `phase4c-admin-${marker}@example.test`;
const recipients = [`phase4c-a-${marker}@example.test`, `phase4c-b-${marker}@example.test`, `phase4c-c-${marker}@example.test`];
const providerEventIds: string[] = [];
let categoryId = "";

class MemoryStorage implements PrivateObjectStorage {
  objects = new Map<string, Buffer>();
  failPut = false;
  failDelete = false;
  async put(key: string, data: Buffer) { if (this.failPut) throw new Error("TEST_PUT_FAILURE"); this.objects.set(key, Buffer.from(data)); return { key, byteSize: data.byteLength, etag: `etag-${key}` }; }
  async get(key: string) { const value = this.objects.get(key); if (!value) throw new Error("NOT_FOUND"); return Buffer.from(value); }
  async delete(key: string) { if (this.failDelete) throw new Error("TEST_DELETE_FAILURE"); this.objects.delete(key); }
  async exists(key: string) { return this.objects.has(key); }
  async list(prefix: string) { return [...this.objects].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, byteSize: value.byteLength } satisfies StoredObjectInfo)); }
}

class ControlledProvider implements EmailProvider {
  sends = 0;
  constructor(private failures = 0) {}
  async send(message: OutboundEmail) { this.sends++; if (this.sends <= this.failures) throw new EmailProviderError("CONTROLLED_TRANSIENT", true); return { providerMessageId: `provider-${message.id}` }; }
}

class FakeS3 {
  objects = new Map<string, Uint8Array>();
  failPut = false;
  async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
    const key = String(command.input.Key ?? "");
    switch (command.constructor.name) {
      case "PutObjectCommand": if (this.failPut) throw new Error("R2_DOWN"); this.objects.set(key, new Uint8Array(command.input.Body as Uint8Array)); return { ETag: `etag-${key}` };
      case "GetObjectCommand": { const body = this.objects.get(key); if (!body) throw Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }); return { Body: body }; }
      case "DeleteObjectCommand": this.objects.delete(key); return {};
      case "HeadObjectCommand": if (!this.objects.has(key)) throw Object.assign(new Error("missing"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }); return {};
      case "ListObjectsV2Command": return { Contents: [...this.objects].filter(([objectKey]) => objectKey.startsWith(String(command.input.Prefix ?? ""))).map(([Key, value]) => ({ Key, Size: value.byteLength })), IsTruncated: false };
      default: throw new Error("UNEXPECTED_COMMAND");
    }
  }
}

function submissionForm() {
  const form = new FormData();
  form.set("categoryId", categoryId);
  form.set("title", `[phase4c-${marker}] Notification encounter`);
  form.set("description", "A fictional Phase 4C encounter report long enough to pass validation while testing the durable administrator notification outbox.");
  form.set("approximateDate", "A quiet test evening");
  form.set("privateEmail", `private-${marker}@example.test`);
  form.set("publicationConsent", "true");
  return form;
}

describe("Phase 4C email and private storage", { concurrency: false }, () => {
  before(async () => { categoryId = (await prisma.category.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id; });

  after(async () => {
    await prisma.encounter.deleteMany({ where: { title: { contains: marker } } });
    await prisma.emailWebhookEvent.deleteMany({ where: { providerEventId: { in: providerEventIds } } });
    await prisma.emailOutbox.deleteMany({ where: { recipient: { in: [...recipients, notificationEmail] } } });
    await prisma.emailSuppression.deleteMany({ where: { recipientHash: { in: recipients.map((email) => recipientHash(email)) } } });
    await deleteDevelopmentEmailsForRecipient(notificationEmail);
    await prisma.$disconnect();
  });

  it("accepts complete production Resend and R2 configuration and rejects local providers", () => {
    const base = { ...process.env, NODE_ENV: "production", APP_RUNTIME_MODE: "production", BETTER_AUTH_URL: "https://ufo.test", NEXT_PUBLIC_APP_URL: "https://ufo.test", DATABASE_URL: "postgresql://ufo@ep-ufo-pooler.eu-west-2.aws.neon.tech/ufo?sslmode=require", DIRECT_URL: "postgresql://ufo@ep-ufo.eu-west-2.aws.neon.tech/ufo?sslmode=require", TRUSTED_PROXY_MODE: "railway", EMAIL_DRIVER: "resend", STORAGE_DRIVER: "r2", RESEND_API_KEY: `re_${"a".repeat(32)}`, RESEND_FROM: "What the UFO?! <no-reply@notify.ufo.test>", RESEND_SENDING_DOMAIN: "notify.ufo.test", RESEND_WEBHOOK_SECRET: `whsec_${"b".repeat(32)}`, ADMIN_NOTIFICATION_EMAIL: "operator@ufo.test", R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com", R2_BUCKET: "ufo-private-evidence", R2_ACCESS_KEY_ID: "a1b2c3d4e5f6", R2_SECRET_ACCESS_KEY: "c".repeat(40), R2_REGION: "auto", R2_FORCE_PATH_STYLE: "false" } satisfies NodeJS.ProcessEnv;
    assert.equal(validateRuntimeEnvironment(base).STORAGE_DRIVER, "r2");
    assert.throws(() => validateRuntimeEnvironment({ ...base, STORAGE_DRIVER: "local" }), /production requires/);
    assert.throws(() => validateRuntimeEnvironment({ ...base, EMAIL_DRIVER: "development" }), /production requires/);
  });

  it("keeps the development mailbox inaccessible when Next.js runs in production", async () => {
    const mutableEnvironment = process.env as Record<string, string | undefined>;
    const previous = process.env.NODE_ENV; mutableEnvironment.NODE_ENV = "production";
    try { await assert.rejects(() => DevelopmentMailbox(), /404/); }
    finally { mutableEnvironment.NODE_ENV = previous; }
  });

  it("uses the Resend adapter with an idempotency key and controlled responses", async () => {
    let receivedKey = "";
    const client = { emails: { send: async (_message: unknown, options: { idempotencyKey: string }) => { receivedKey = options.idempotencyKey; return { data: { id: "resend-message" }, error: null }; } } };
    const provider = new ResendEmailProvider(client, "What the UFO?! <no-reply@notify.ufo.test>");
    const result = await provider.send({ id: marker, kind: "ACCOUNT_SECURITY", to: recipients[0], from: "unused", subject: "Security", text: "Security notice", html: "<p>Security notice</p>", idempotencyKey: `test/${marker}` });
    assert.equal(result.providerMessageId, "resend-message"); assert.equal(receivedKey, `test/${marker}`);
  });

  it("retries transient outbox failures and prevents concurrent duplicate sends", async () => {
    const first = await enqueueTransactionalEmail({ kind: "ACCOUNT_SECURITY", to: recipients[0], payload: { summary: "Controlled security test" } });
    const provider = new ControlledProvider(1);
    const start = new Date();
    assert.equal((await processEmailOutbox({ ids: [first.id], provider, now: start })).failed, 1);
    assert.equal((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: first.id } })).status, "FAILED");
    assert.equal((await processEmailOutbox({ ids: [first.id], provider, now: new Date(start.getTime() + 2 * 60 * 1000) })).accepted, 1);
    const second = await enqueueTransactionalEmail({ kind: "ACCOUNT_SECURITY", to: recipients[1], payload: { summary: "Concurrent claim test" } });
    const concurrent = new ControlledProvider();
    await Promise.all([processEmailOutbox({ ids: [second.id], provider: concurrent }), processEmailOutbox({ ids: [second.id], provider: concurrent })]);
    assert.equal(concurrent.sends, 1);
  });

  it("keeps outbox retention cleanup dry-run by default", async () => {
    const row = await enqueueTransactionalEmail({ kind: "ACCOUNT_SECURITY", to: recipients[1], payload: { summary: "Retention dry-run test" } });
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "DELIVERED", deliveredAt: new Date(0), updatedAt: new Date(0) } });
    const preview = await cleanupEmailOutbox({ now: new Date("2026-11-23T00:00:00.000Z") });
    assert.equal(preview.dryRun, true); assert.ok(preview.count >= 1); assert.ok(await prisma.emailOutbox.findUnique({ where: { id: row.id } }));
    await cleanupEmailOutbox({ dryRun: false, now: new Date("2026-11-23T00:00:00.000Z") });
    assert.equal(await prisma.emailOutbox.count({ where: { id: row.id } }), 0);
  });

  it("verifies Resend-compatible signatures, handles duplicate events and suppresses hard bounces", async () => {
    const row = await enqueueTransactionalEmail({ kind: "ACCOUNT_SECURITY", to: recipients[2], payload: { summary: "Webhook test" } });
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "ACCEPTED", providerMessageId: `resend-${marker}`, acceptedAt: new Date() } });
    const event = { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: `resend-${marker}`, message_id: marker, from: "no-reply@notify.ufo.test", to: [recipients[2]], subject: "Webhook test", created_at: new Date().toISOString() } };
    const payload = JSON.stringify(event); const id = `event-${marker}`; providerEventIds.push(id);
    const secret = `whsec_${randomBytes(32).toString("base64")}`; const timestamp = new Date(); const signature = new Webhook(secret).sign(id, timestamp, payload);
    const webhookEnvironment = { ...process.env, RESEND_API_KEY: `re_${"a".repeat(30)}`, RESEND_WEBHOOK_SECRET: secret };
    const verified = verifyResendWebhook(payload, { id, timestamp: String(Math.floor(timestamp.getTime() / 1000)), signature }, webhookEnvironment);
    assert.equal(verified.type, "email.bounced");
    assert.throws(() => verifyResendWebhook(payload, { id, timestamp: String(Math.floor(timestamp.getTime() / 1000)), signature: "v1,forged" }, webhookEnvironment));
    assert.deepEqual(await processResendWebhook(id, verified), { duplicate: false, matched: true });
    assert.equal((await processResendWebhook(id, verified)).duplicate, true);
    assert.equal((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "DEAD_LETTER");
    assert.ok(await prisma.emailSuppression.findUnique({ where: { recipientHash: recipientHash(recipients[2]) } }));
  });

  it("queues a privacy-minimised administrator notification after encounter persistence", async () => {
    const previous = process.env.ADMIN_NOTIFICATION_EMAIL; process.env.ADMIN_NOTIFICATION_EMAIL = notificationEmail;
    try {
      const response = await submitEncounter(new Request("http://localhost:3000/api/encounters", { method: "POST", headers: { origin: "http://localhost:3000", "x-real-ip": randomUUID() }, body: submissionForm() }));
      assert.equal(response.status, 201);
      const outbox = await prisma.emailOutbox.findFirstOrThrow({ where: { recipient: notificationEmail, kind: "ENCOUNTER_SUBMITTED" }, orderBy: { createdAt: "desc" } });
      assert.equal(outbox.status, "ACCEPTED");
      assert.doesNotMatch(JSON.stringify(outbox.payload), /private-.*@example\.test|fictional Phase 4C encounter report/i);
      const captured = (await listDevelopmentEmails()).find((message) => message.to === notificationEmail && message.kind === "ENCOUNTER_SUBMITTED");
      assert.ok(captured?.text?.includes("Case:")); assert.doesNotMatch(captured?.text ?? "", /private-.*@example\.test/i);
    } finally { if (previous === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL; else process.env.ADMIN_NOTIFICATION_EMAIL = previous; }
  });

  it("performs private R2-compatible put, get, list and delete operations without public URLs", async () => {
    const fake = new FakeS3(); const storage = new R2PrivateStorage(fake as never, "private-bucket");
    await storage.put("encounters/aa/test.webp", Buffer.from("private"), { contentType: "image/webp" });
    assert.equal((await storage.get("encounters/aa/test.webp")).toString(), "private");
    assert.deepEqual((await storage.list("encounters")).map((item) => item.key), ["encounters/aa/test.webp"]);
    await storage.delete("encounters/aa/test.webp"); assert.equal(await storage.exists("encounters/aa/test.webp"), false);
    fake.failPut = true; await assert.rejects(() => storage.put("encounters/aa/fail.webp", Buffer.from("x")));
  });

  it("recovers lifecycle state, preserves dry runs and removes only confirmed orphan objects", async () => {
    const storage = new MemoryStorage();
    const encounter = await prisma.encounter.create({ data: { caseReference: `WTU-4C-${randomUUID()}`, slug: `phase4c-${randomUUID()}`, title: `[phase4c-${marker}] lifecycle`, categoryId, originalStoryContent: "Lifecycle test testimony retained only for this automated test.", storyContent: "Lifecycle test testimony retained only for this automated test.", publicationConsent: true, status: "PENDING" } });
    const readyId = randomUUID(); const abandonedId = randomUUID(); const interruptedId = randomUUID();
    await prisma.encounterMedia.createMany({ data: [
      { id: readyId, encounterId: encounter.id, storageKey: `encounters/${marker}/ready.webp`, mimeType: "image/webp", byteSize: 3, width: 1, height: 1, storageStatus: "PENDING_UPLOAD" },
      { id: abandonedId, encounterId: encounter.id, storageKey: `encounters/${marker}/abandoned.webp`, mimeType: "image/webp", byteSize: 3, width: 1, height: 1, storageStatus: "PENDING_UPLOAD", storageUpdatedAt: new Date(0) },
      { id: interruptedId, encounterId: encounter.id, storageKey: `encounters/${marker}/interrupted.webp`, mimeType: "image/webp", byteSize: 3, width: 1, height: 1, storageStatus: "PENDING_UPLOAD" },
    ] });
    await uploadMediaObject(readyId, Buffer.from("yes"), "image/webp", storage);
    assert.equal((await prisma.encounterMedia.findUniqueOrThrow({ where: { id: readyId } })).storageStatus, "READY");
    storage.failPut = true; await assert.rejects(() => uploadMediaObject(interruptedId, Buffer.from("no"), "image/webp", storage)); storage.failPut = false;
    assert.equal((await prisma.encounterMedia.findUniqueOrThrow({ where: { id: interruptedId } })).storageStatus, "FAILED");
    await uploadMediaObject(interruptedId, Buffer.from("yes"), "image/webp", storage);
    storage.failDelete = true; await assert.rejects(() => deleteMediaObject(readyId, storage)); storage.failDelete = false;
    assert.equal((await prisma.encounterMedia.findUniqueOrThrow({ where: { id: readyId } })).storageStatus, "DELETING");
    storage.objects.set(`encounters/${marker}/orphan.webp`, Buffer.from("orphan"));
    const dryRun = await reconcileMediaStorage({ dryRun: true, storage, staleMinutes: 0 });
    assert.ok(dryRun.actions.some((action) => action.action === "DELETE_ORPHAN_OBJECT")); assert.ok(storage.objects.has(`encounters/${marker}/orphan.webp`));
    await reconcileMediaStorage({ dryRun: false, storage, staleMinutes: 0 });
    assert.equal(storage.objects.has(`encounters/${marker}/orphan.webp`), false);
    assert.equal((await prisma.encounterMedia.findUniqueOrThrow({ where: { id: abandonedId } })).storageStatus, "FAILED");
    assert.equal((await prisma.encounterMedia.findUniqueOrThrow({ where: { id: readyId } })).storageStatus, "REMOVED");
  });
});
