import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { correlationId, operationalLog } from "@/lib/operations/logger";

export const dynamic = "force-dynamic";

export async function readinessResponse(check: () => Promise<unknown>, requestId: string) {
  const started = performance.now();
  try {
    await Promise.race([check(), new Promise((_, reject) => setTimeout(() => reject(new Error("READINESS_TIMEOUT")), 2_000))]);
    operationalLog("info", "health.ready", { requestId, routeClass: "health", status: 200, durationMs: Math.round(performance.now() - started) });
    return NextResponse.json({ status: "ready" }, { status: 200, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch {
    operationalLog("warn", "health.not_ready", { requestId, routeClass: "health", status: 503, durationMs: Math.round(performance.now() - started), errorId: "DATABASE_UNAVAILABLE" });
    return NextResponse.json({ status: "not_ready" }, { status: 503, headers: { "cache-control": "no-store", "retry-after": "5", "x-request-id": requestId } });
  }
}

export async function GET(request: Request) {
  return readinessResponse(() => prisma.$queryRaw`SELECT 1`, correlationId(request.headers));
}
