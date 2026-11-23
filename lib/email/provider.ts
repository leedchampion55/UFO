import { Resend } from "resend";
import { deliverDevelopmentEmail } from "@/lib/dev-mail";
import type { EmailProvider, EmailSendResult, OutboundEmail } from "./types";
import { EmailProviderError } from "./types";

type ResendClient = {
  emails: {
    send(message: { from: string; to: string[]; subject: string; text: string; html: string }, options: { idempotencyKey: string }): Promise<{ data: { id: string } | null; error: { name?: string; statusCode?: number } | null }>;
  };
};

export class DevelopmentEmailProvider implements EmailProvider {
  async send(message: OutboundEmail): Promise<EmailSendResult> {
    await deliverDevelopmentEmail({ to: message.to, subject: message.subject, kind: message.kind, actionUrl: message.actionUrl, text: message.text });
    return { providerMessageId: `development:${message.id}` };
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly client: ResendClient,
    private readonly sender: string,
  ) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
    if (!environment.RESEND_API_KEY || !environment.RESEND_FROM) throw new Error("RESEND_CONFIGURATION_MISSING");
    return new ResendEmailProvider(new Resend(environment.RESEND_API_KEY) as ResendClient, environment.RESEND_FROM);
  }

  async send(message: OutboundEmail) {
    const result = await this.client.emails.send({ from: this.sender, to: [message.to], subject: message.subject, text: message.text, html: message.html }, { idempotencyKey: message.idempotencyKey });
    if (result.error || !result.data?.id) {
      const status = result.error?.statusCode ?? 0;
      const code = result.error?.name ? `RESEND_${result.error.name.toUpperCase()}` : "RESEND_REJECTED";
      throw new EmailProviderError(code, status === 0 || status === 408 || status === 409 || status === 429 || status >= 500);
    }
    return { providerMessageId: result.data.id };
  }
}

export function emailProviderFromEnvironment(environment: NodeJS.ProcessEnv = process.env): EmailProvider {
  return environment.EMAIL_DRIVER === "resend" ? ResendEmailProvider.fromEnvironment(environment) : new DevelopmentEmailProvider();
}
