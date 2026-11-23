import { createHmac, randomUUID } from "node:crypto";
import type { EmailKind, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { emailProviderFromEnvironment } from "./provider";
import { renderTransactionalEmail } from "./templates";
import { EmailProviderError, type EmailPayload, type EmailProvider } from "./types";

type OutboxDatabase = Pick<Prisma.TransactionClient, "emailOutbox" | "emailSuppression">;

export type QueueEmailInput = { kind: EmailKind; to: string; payload: EmailPayload; idempotencyKey?: string; maxAttempts?: number };

function canonicalEmail(value: string) {
  return value.trim().toLowerCase();
}

export function recipientHash(value: string, environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.RATE_LIMIT_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET_REQUIRED");
  return createHmac("sha256", secret).update(canonicalEmail(value)).digest("hex");
}

export async function enqueueTransactionalEmail(input: QueueEmailInput, database: OutboxDatabase = prisma) {
  const recipient = canonicalEmail(input.to);
  const suppressed = await database.emailSuppression.findUnique({ where: { recipientHash: recipientHash(recipient) }, select: { id: true } });
  const rendered = renderTransactionalEmail(input.kind, input.payload);
  return database.emailOutbox.create({
    data: {
      kind: input.kind,
      recipient,
      subject: rendered.subject,
      payload: input.payload as Prisma.InputJsonValue,
      status: suppressed ? "SUPPRESSED" : "QUEUED",
      idempotencyKey: input.idempotencyKey ?? `email/${randomUUID()}`,
      maxAttempts: input.maxAttempts ?? 5,
    },
  });
}

export async function enqueueAndDeliverLocally(input: QueueEmailInput) {
  const message = await enqueueTransactionalEmail(input);
  if ((process.env.EMAIL_DRIVER ?? "development") === "development" && message.status === "QUEUED") {
    await processEmailOutbox({ ids: [message.id], limit: 1 });
  }
  return message;
}

function retryDelay(attempt: number) {
  return Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attempt - 1));
}

function safeFailureCode(error: unknown) {
  return error instanceof EmailProviderError ? error.code.slice(0, 120) : "EMAIL_PROVIDER_FAILURE";
}

export async function processEmailOutbox(options: { limit?: number; ids?: string[]; provider?: EmailProvider; workerId?: string; now?: Date } = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const workerId = options.workerId ?? `worker:${randomUUID()}`;
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  await prisma.emailOutbox.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleBefore } },
    data: { status: "FAILED", lockedAt: null, lockedBy: null, nextAttemptAt: now, lastErrorCode: "STALE_PROCESSING_LOCK" },
  });
  const candidates = await prisma.emailOutbox.findMany({
    where: { id: options.ids ? { in: options.ids } : undefined, status: { in: ["QUEUED", "FAILED"] }, nextAttemptAt: { lte: now }, lockedAt: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const provider = options.provider ?? emailProviderFromEnvironment();
  let accepted = 0;
  let failed = 0;
  let deadLetter = 0;
  for (const candidate of candidates) {
    const claimed = await prisma.emailOutbox.updateMany({
      where: { id: candidate.id, status: { in: ["QUEUED", "FAILED"] }, nextAttemptAt: { lte: now }, lockedAt: null },
      data: { status: "PROCESSING", lockedAt: now, lockedBy: workerId, attemptCount: { increment: 1 } },
    });
    if (!claimed.count) continue;
    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: candidate.id } });
    const suppressed = await prisma.emailSuppression.findUnique({ where: { recipientHash: recipientHash(row.recipient) }, select: { id: true } });
    if (suppressed) {
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "SUPPRESSED", lockedAt: null, lockedBy: null, lastErrorCode: "RECIPIENT_SUPPRESSED" } });
      continue;
    }
    try {
      const payload = row.payload as EmailPayload;
      const rendered = renderTransactionalEmail(row.kind, payload);
      const result = await provider.send({ id: row.id, kind: row.kind, to: row.recipient, from: process.env.RESEND_FROM ?? "development@local.invalid", subject: row.subject, text: rendered.text, html: rendered.html, idempotencyKey: row.idempotencyKey, actionUrl: "actionUrl" in rendered ? rendered.actionUrl : undefined });
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: "ACCEPTED", providerMessageId: result.providerMessageId, acceptedAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null } });
      accepted++;
    } catch (error) {
      const transient = !(error instanceof EmailProviderError) || error.transient;
      const terminal = !transient || row.attemptCount >= row.maxAttempts;
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: terminal ? "DEAD_LETTER" : "FAILED", failedAt: terminal ? new Date() : null, nextAttemptAt: terminal ? row.nextAttemptAt : new Date(now.getTime() + retryDelay(row.attemptCount)), lockedAt: null, lockedBy: null, lastErrorCode: safeFailureCode(error) },
      });
      if (terminal) deadLetter++; else failed++;
    }
  }
  return { considered: candidates.length, accepted, failed, deadLetter };
}

export async function cleanupEmailOutbox(options: { dryRun?: boolean; now?: Date } = {}) {
  const dryRun = options.dryRun ?? true;
  const now = options.now ?? new Date();
  const deliveredBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const failedBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const where: Prisma.EmailOutboxWhereInput = { OR: [{ status: { in: ["DELIVERED", "SUPPRESSED"] }, updatedAt: { lt: deliveredBefore } }, { status: "DEAD_LETTER", updatedAt: { lt: failedBefore } }] };
  const count = await prisma.emailOutbox.count({ where });
  if (!dryRun && count) await prisma.emailOutbox.deleteMany({ where });
  return { count, dryRun };
}
