import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { enforceRateLimit, safeErrorResponse } from "@/lib/security";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  try {
    const pathname = new URL(request.url).pathname;
    // Public registration must pass through our username/profile transaction.
    if (pathname.endsWith("/sign-up/email")) return Response.json({ error: "Use the member registration route." }, { status: 404 });
    if (pathname.endsWith("/sign-in/email")) await enforceRateLimit(request, "credential-login", 8, 15 * 60);
    if (pathname.endsWith("/request-password-reset") || pathname.endsWith("/send-verification-email")) await enforceRateLimit(request, "account-email", 5, 60 * 60);
    return handlers.POST(request);
  } catch (error) {
    return safeErrorResponse(error);
  }
}
