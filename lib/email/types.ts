import type { EmailKind } from "@/generated/prisma/client";

export type EmailPayload = Record<string, string | number | boolean | null>;

export type OutboundEmail = {
  id: string;
  kind: EmailKind;
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  actionUrl?: string;
};

export type EmailSendResult = { providerMessageId: string };

export interface EmailProvider {
  send(message: OutboundEmail): Promise<EmailSendResult>;
}

export class EmailProviderError extends Error {
  constructor(public readonly code: string, public readonly transient: boolean) {
    super(code);
    this.name = "EmailProviderError";
  }
}
