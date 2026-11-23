import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { GET as liveness } from "@/app/health/live/route";
import { readinessResponse } from "@/app/health/ready/route";
import { POST as submitEncounter } from "@/app/api/encounters/route";
import { acquireOperationLease, releaseOperationLease, withOperationLease } from "@/lib/operations/lease";
import { backupPrivateMedia, restorePrivateMediaObject } from "@/lib/storage/backup";
import type { PrivateObjectStorage, StoredObjectInfo } from "@/lib/storage/types";
import { prisma } from "@/lib/prisma";
import { enqueueTransactionalEmail, processEmailOutbox } from "@/lib/email/outbox";
import type { EmailProvider } from "@/lib/email/types";

const marker = randomUUID();

class MemoryStorage implements PrivateObjectStorage {
  objects = new Map<string, Buffer>();
  async put(key: string, data: Buffer) { this.objects.set(key, Buffer.from(data)); return { key, byteSize: data.byteLength }; }
  async get(key: string) { const data = this.objects.get(key); if (!data) throw new Error("MISSING"); return Buffer.from(data); }
  async delete(key: string) { this.objects.delete(key); }
  async exists(key: string) { return this.objects.has(key); }
  async list(prefix: string) { return [...this.objects].filter(([key]) => key.startsWith(prefix)).map(([key, data]) => ({ key, byteSize: data.byteLength } satisfies StoredObjectInfo)); }
}

describe("Phase 4D operational readiness", { concurrency: false }, () => {
  after(async () => {
    await prisma.emailOutbox.deleteMany({ where: { idempotencyKey: { startsWith: `phase4d/${marker}` } } });
    await prisma.operationalLease.deleteMany({ where: { name: { contains: marker } } });
    await prisma.$disconnect();
  });

  it("reports liveness without private detail and readiness with correct outage status", async () => {
    const live = await liveness(); assert.equal(live.status, 200); assert.deepEqual(await live.json(), { status: "ok" });
    const ready = await readinessResponse(async () => true, marker); assert.equal(ready.status, 200); assert.deepEqual(await ready.json(), { status: "ready" });
    const unavailable = await readinessResponse(async () => { throw new Error("postgresql://secret@example.invalid/private"); }, marker);
    assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { status: "not_ready" });
    assert.equal(unavailable.headers.get("retry-after"), "5");
  });

  it("prevents concurrent maintenance and permits recovery after a stale lease", async () => {
    const name = `phase4d-${marker}-lease`;
    const first = await acquireOperationLease(name, 60, "first"); assert.ok(first);
    assert.equal(await acquireOperationLease(name, 60, "second"), null);
    await prisma.operationalLease.update({ where: { name }, data: { expiresAt: new Date(0) } });
    const recovered = await acquireOperationLease(name, 60, "second"); assert.equal(recovered?.holder, "second");
    await releaseOperationLease(recovered!);
    const wrapped = await withOperationLease(name, async () => "complete"); assert.deepEqual(wrapped, { acquired: true, value: "complete" });
  });

  it("backs up private objects, verifies hashes and restores only on explicit apply", async () => {
    const source = new MemoryStorage(); const backup = new MemoryStorage();
    await source.put(`encounters/${marker}/one.webp`, Buffer.from("private-evidence"));
    const dry = await backupPrivateMedia(source, backup); assert.equal(dry.dryRun, true); assert.equal(backup.objects.size, 0);
    const applied = await backupPrivateMedia(source, backup, { dryRun: false }); assert.equal(applied.copied, 1); assert.match(applied.entries[0]!.sha256, /^[a-f0-9]{64}$/);
    await source.delete(applied.entries[0]!.key);
    const preview = await restorePrivateMediaObject(applied.entries[0]!.key, source, backup); assert.equal(preview.restored, false);
    const restored = await restorePrivateMediaObject(applied.entries[0]!.key, source, backup, { dryRun: false }); assert.equal(restored.restored, true);
    assert.equal((await source.get(applied.entries[0]!.key)).toString(), "private-evidence");
  });

  it("recovers an interrupted email claim on the next worker pass without duplicate ownership", async () => {
    const row = await enqueueTransactionalEmail({ kind: "ACCOUNT_SECURITY", to: `phase4d-${marker}@example.test`, idempotencyKey: `phase4d/${marker}/restart`, payload: { summary: "Synthetic worker restart drill." } });
    await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "PROCESSING", lockedAt: new Date(Date.now() - 11 * 60 * 1_000), lockedBy: "interrupted-worker" } });
    let sends = 0;
    const provider: EmailProvider = { async send(message) { sends += 1; return { providerMessageId: `phase4d-provider-${message.id}` }; } };
    const result = await processEmailOutbox({ ids: [row.id], provider, workerId: "restarted-worker" });
    assert.equal(result.accepted, 1); assert.equal(sends, 1);
    assert.equal((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "ACCEPTED");
  });

  it("fails the emergency submission switch before parsing request content", async () => {
    const previous = process.env.PUBLIC_SUBMISSIONS_ENABLED; process.env.PUBLIC_SUBMISSIONS_ENABLED = "false";
    try {
      const response = await submitEncounter(new Request("http://localhost:3000/api/encounters", { method: "POST", headers: { origin: "http://localhost:3000" } }));
      assert.equal(response.status, 503); assert.equal(response.headers.get("retry-after"), "3600");
    } finally { if (previous === undefined) delete process.env.PUBLIC_SUBMISSIONS_ENABLED; else process.env.PUBLIC_SUBMISSIONS_ENABLED = previous; }
  });
});
