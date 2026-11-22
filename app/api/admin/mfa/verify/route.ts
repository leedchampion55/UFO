import { z } from "zod";
import { auth, getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertMutationRequest, enforceRateLimit, safeErrorResponse } from "@/lib/security";

export const runtime = "nodejs";

const schema = z.object({
  method: z.enum(["totp", "recovery"]),
  code: z.string().trim().min(6).max(64),
});

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    await enforceRateLimit(request, "administrator-mfa", 8, 15 * 60);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Enter a valid authentication code." }, { status: 400 });
    const existingAdmin = await getAdminSession(request.headers);

    const authPath = parsed.data.method === "totp" ? "/api/auth/two-factor/verify-totp" : "/api/auth/two-factor/verify-backup-code";
    const delegated = new Request(new URL(authPath, request.url), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ code: parsed.data.code, trustDevice: false }),
    });
    const response = await auth.handler(delegated);
    if (!response.ok) return response;

    const payload = await response.clone().json() as { token?: string };
    if (!payload.token) return Response.json({ error: "The authentication challenge could not be completed." }, { status: 401 });
    // Enrolment rotates the active session but Better Auth's enrolment response
    // reports the pre-rotation token. Fall back only to the already-authenticated
    // administrator's newest session; sign-in challenges must match the token.
    const session = await prisma.session.findUnique({ where: { token: payload.token }, include: { user: { select: { role: true } } } })
      ?? (existingAdmin ? await prisma.session.findFirst({ where: { userId: existingAdmin.session.user.id }, include: { user: { select: { role: true } } }, orderBy: { createdAt: "desc" } }) : null);
    if (!session || session.user.role !== "admin") {
      if (session) await prisma.session.delete({ where: { id: session.id } });
      return Response.json({ error: "Administrator clearance is required." }, { status: 403 });
    }
    await prisma.session.update({ where: { id: session.id }, data: { strongAuthAt: new Date() } });
    return response;
  } catch (error) {
    return safeErrorResponse(error);
  }
}
