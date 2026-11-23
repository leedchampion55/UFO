import { operationalLog } from "./logger";

export async function reportOperationalError(input: { errorId: string; routeClass?: string; routePath?: string }) {
  operationalLog("error", "application.error", input);
  const endpoint = process.env.ERROR_MONITORING_ENDPOINT;
  if (process.env.NODE_ENV !== "production" || !endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.ERROR_MONITORING_TOKEN ? { authorization: `Bearer ${process.env.ERROR_MONITORING_TOKEN}` } : {}) },
      body: JSON.stringify({ timestamp: new Date().toISOString(), release: process.env.RELEASE_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA, ...input }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    operationalLog("warn", "monitoring.delivery_failed", { errorId: "MONITORING_UNAVAILABLE" });
  }
}
