import type { EmailKind } from "@/generated/prisma/client";
import type { EmailPayload } from "./types";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function required(payload: EmailPayload, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value) throw new Error(`INVALID_EMAIL_PAYLOAD_${key.toUpperCase()}`);
  return value;
}

function actionMessage(title: string, copy: string, actionLabel: string, actionUrl: string) {
  const safeUrl = escapeHtml(actionUrl);
  return {
    text: `${title}\n\n${copy}\n\n${actionLabel}: ${actionUrl}\n\nIf you did not request this, you can ignore this message.`,
    html: `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p><p><a href="${safeUrl}">${escapeHtml(actionLabel)}</a></p><p>If you did not request this, you can ignore this message.</p>`,
    actionUrl,
  };
}

export function renderTransactionalEmail(kind: EmailKind, payload: EmailPayload) {
  switch (kind) {
    case "EMAIL_VERIFICATION": {
      const body = actionMessage("Verify your membership", "Confirm your email address before joining community conversations.", "Verify email", required(payload, "actionUrl"));
      return { subject: "Verify your What the UFO?! membership", ...body };
    }
    case "PASSWORD_RESET": {
      const body = actionMessage("Reset your password", "Use this secure, time-limited link to choose a new password.", "Reset password", required(payload, "actionUrl"));
      return { subject: "Reset your What the UFO?! password", ...body };
    }
    case "PASSWORD_RESET_SECURITY": {
      const occurredAt = required(payload, "occurredAt");
      return {
        subject: "Your What the UFO?! password was changed",
        text: `Your password was reset at ${occurredAt}. Existing sessions were revoked. If this was not you, contact the site operator immediately.`,
        html: `<h1>Password changed</h1><p>Your password was reset at ${escapeHtml(occurredAt)}. Existing sessions were revoked.</p><p>If this was not you, contact the site operator immediately.</p>`,
      };
    }
    case "ACCOUNT_SECURITY": {
      const summary = required(payload, "summary");
      return { subject: "What the UFO?! account security notice", text: summary, html: `<h1>Account security notice</h1><p>${escapeHtml(summary)}</p>` };
    }
    case "ENCOUNTER_SUBMITTED": {
      const reference = required(payload, "caseReference");
      const category = required(payload, "category");
      const submittedAt = required(payload, "submittedAt");
      const actionUrl = required(payload, "actionUrl");
      return {
        subject: `New encounter awaiting review: ${reference}`,
        text: `A new encounter entered Mission Control.\n\nCase: ${reference}\nCategory: ${category}\nSubmitted: ${submittedAt}\n\nReview securely: ${actionUrl}`,
        html: `<h1>New encounter awaiting review</h1><p><strong>Case:</strong> ${escapeHtml(reference)}</p><p><strong>Category:</strong> ${escapeHtml(category)}</p><p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p><p><a href="${escapeHtml(actionUrl)}">Open Mission Control</a></p>`,
        actionUrl,
      };
    }
    case "COMMUNITY_REPORT": {
      const reason = required(payload, "reason");
      const reportedAt = required(payload, "reportedAt");
      const actionUrl = required(payload, "actionUrl");
      return {
        subject: "Community content report awaiting review",
        text: `A community report was submitted.\n\nReason: ${reason}\nReported: ${reportedAt}\n\nReview securely: ${actionUrl}`,
        html: `<h1>Community report</h1><p><strong>Reason:</strong> ${escapeHtml(reason)}</p><p><strong>Reported:</strong> ${escapeHtml(reportedAt)}</p><p><a href="${escapeHtml(actionUrl)}">Open moderation queue</a></p>`,
        actionUrl,
      };
    }
  }
}
