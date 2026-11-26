export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { validateServiceEnvironment } = await import("./lib/env");
  validateServiceEnvironment("web");
}

export async function onRequestError(_error: unknown, _request: { path: string }, context: { routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportOperationalError } = await import("./lib/operations/monitoring");
  await reportOperationalError({ errorId: "UNHANDLED_REQUEST_ERROR", routeClass: context.routeType, routePath: context.routePath || "unknown" });
}
