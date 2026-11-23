import { processResendWebhook, verifyResendWebhook } from "@/lib/email/webhooks";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
  const payload = await request.text();
  if (Buffer.byteLength(payload) > MAX_WEBHOOK_BYTES) return new Response("Payload too large", { status: 413 });
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response("Invalid webhook", { status: 400 });
  try {
    const event = verifyResendWebhook(payload, { id, timestamp, signature });
    const result = await processResendWebhook(id, event);
    return Response.json({ ok: true, duplicate: result.duplicate }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("Invalid webhook", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
