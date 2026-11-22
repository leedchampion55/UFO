import { createHmac } from "node:crypto";
import { prisma } from "./prisma";
import { trustedApplicationOrigins } from "./env";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let lastCleanupAt = 0;
let cleanupPromise: Promise<unknown> | null = null;

export function assertMutationRequest(request: Request) {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") throw new Error("INVALID_ORIGIN");

  if (origin) {
    if (!trustedApplicationOrigins().includes(origin)) throw new Error("INVALID_ORIGIN");
    return;
  }

  // Modern browsers send Origin on mutation requests. Same-origin Fetch
  // Metadata is an acceptable fallback; non-browser callers must opt in with a
  // header that HTML forms cannot forge cross-origin.
  if (fetchSite === "same-origin" || request.headers.get("x-ufo-request") === "same-origin") return;
  throw new Error("INVALID_ORIGIN");
}

export const assertSameOrigin = assertMutationRequest;

function requestFingerprint(request: Request) {
  const proxyMode = process.env.TRUSTED_PROXY_MODE ?? (process.env.NODE_ENV === "production" ? "none" : "local");
  const raw = proxyMode === "railway" || proxyMode === "local" ? request.headers.get("x-real-ip") ?? "proxy-unknown" : "untrusted-proxy";
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
  void maybeCleanupRateLimits();
  if (record.requestCount > limit) throw new Error("RATE_LIMITED");
}

export async function cleanupExpiredRateLimits(retentionHours = 48) {
  const before = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  return prisma.requestRateLimit.deleteMany({ where: { windowStart: { lt: before } } });
}

function maybeCleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanupAt < 60 * 60 * 1000 || cleanupPromise) return cleanupPromise;
  lastCleanupAt = now;
  cleanupPromise = cleanupExpiredRateLimits().catch(() => undefined).finally(() => { cleanupPromise = null; });
  return cleanupPromise;
}

export function safeErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (code === "RATE_LIMITED") return Response.json({ error: "Too many transmissions. Please wait and try again." }, { status: 429 });
  if (code === "INVALID_ORIGIN") return Response.json({ error: "This request could not be verified." }, { status: 403 });
  if (code === "UPLOAD_BUSY") return Response.json({ error: "Image processing is busy. Please wait and try again." }, { status: 503, headers: { "Retry-After": "30" } });
  if (code === "UPLOAD_TOTAL_SIZE") return Response.json({ error: "The complete upload must be 50 MB or smaller." }, { status: 413 });
  console.error("Request failed", { code });
  return Response.json({ error: "Something interrupted the transmission. Please try again." }, { status: 500 });
}
