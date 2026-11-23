import { Resend } from "resend";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recipientHash } from "./outbox";

const eventSchema = z.object({
  type: z.string().max(80),
  data: z.object({ email_id: z.string().min(1).max(200), to: z.array(z.string().email()).max(20).default([]) }).passthrough(),
}).passthrough();

export type ResendWebhookEvent = z.infer<typeof eventSchema>;

export function verifyResendWebhook(payload: string, headers: { id: string; timestamp: string; signature: string }, environment: NodeJS.ProcessEnv = process.env) {
  if (!environment.RESEND_API_KEY || !environment.RESEND_WEBHOOK_SECRET) throw new Error("RESEND_WEBHOOK_CONFIGURATION_MISSING");
  const result = new Resend(environment.RESEND_API_KEY).webhooks.verify({ payload, headers, webhookSecret: environment.RESEND_WEBHOOK_SECRET });
  return eventSchema.parse(result);
}

export async function processResendWebhook(providerEventId: string, event: ResendWebhookEvent) {
  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.emailWebhookEvent.create({ data: { providerEventId, providerMessageId: event.data.email_id, eventType: event.type } });
      const outbox = await transaction.emailOutbox.findUnique({ where: { providerMessageId: event.data.email_id }, select: { id: true } });
      if (!outbox) return { duplicate: false, matched: false };
      if (event.type === "email.delivered") {
        await transaction.emailOutbox.update({ where: { id: outbox.id }, data: { status: "DELIVERED", deliveredAt: new Date(), lastErrorCode: null } });
      } else if (["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
        await transaction.emailOutbox.update({ where: { id: outbox.id }, data: { status: "DEAD_LETTER", failedAt: new Date(), lastErrorCode: event.type.toUpperCase().replaceAll(".", "_") } });
        for (const recipient of event.data.to) {
          await transaction.emailSuppression.upsert({ where: { recipientHash: recipientHash(recipient) }, create: { recipientHash: recipientHash(recipient), reason: event.type, providerMessageId: event.data.email_id }, update: { reason: event.type, providerMessageId: event.data.email_id } });
        }
      } else if (event.type === "email.failed") {
        await transaction.emailOutbox.update({ where: { id: outbox.id }, data: { status: "DEAD_LETTER", failedAt: new Date(), lastErrorCode: "EMAIL_FAILED" } });
      } else if (event.type === "email.delivery_delayed") {
        await transaction.emailOutbox.update({ where: { id: outbox.id }, data: { lastErrorCode: "DELIVERY_DELAYED" } });
      }
      return { duplicate: false, matched: true };
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return { duplicate: true, matched: true };
    throw error;
  }
}
