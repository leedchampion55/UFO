import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { enforceRateLimit, safeErrorResponse } from "@/lib/security";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

export async function POST(request: Request) {
  try {
    if (new URL(request.url).pathname.endsWith("/sign-in/email")) {
      await enforceRateLimit(request, "admin-login", 5, 15 * 60);
    }
    return handlers.POST(request);
  } catch (error) {
    return safeErrorResponse(error);
  }
}
