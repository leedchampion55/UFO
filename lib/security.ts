import { createHmac } from "node:crypto";
import { prisma } from "./prisma";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new Error("INVALID_ORIGIN");
}

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? forwarded ?? "local-unknown";
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret) throw new Error("RATE_LIMIT_SECRET is not set");
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export async function enforceRateLimit(request: Request, purpose: string, limit: number, windowSeconds: number) {
  const keyHash = requestFingerprint(request);
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const record = await prisma.requestRateLimit.upsert({
    where: { purpose_keyHash_windowStart: { purpose, keyHash, windowStart } },
    create: { purpose, keyHash, windowStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
    select: { requestCount: true },
  });
  if (record.requestCount > limit) throw new Error("RATE_LIMITED");
}

export function safeErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "RATE_LIMITED") return Response.json({ error: "Too many transmissions. Please wait and try again." }, { status: 429 });
  if (code === "INVALID_ORIGIN") return Response.json({ error: "This request could not be verified." }, { status: 403 });
  console.error("Request failed", { code });
  return Response.json({ error: "Something interrupted the transmission. Please try again." }, { status: 500 });
}
