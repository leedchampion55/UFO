import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerMemberAccount } from "@/lib/member-registration";
import { assertSameOrigin, enforceRateLimit, safeErrorResponse } from "@/lib/security";

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/, "Use letters, numbers and underscores only."),
  password: z.string().min(12).max(128),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "member-registration", 5, 60 * 60);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Check your email, username and password.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const canonical = parsed.data.username.toLowerCase();
    if (await prisma.memberProfile.findUnique({ where: { usernameCanonical: canonical } })) return Response.json({ error: "That username is not available." }, { status: 409 });

    await registerMemberAccount({ email: parsed.data.email, username: parsed.data.username, password: parsed.data.password }, request.headers);
    return Response.json({ ok: true, message: "Account created. Check your verification message before signing in." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already exists") || message.includes("USER_ALREADY_EXISTS")) return Response.json({ ok: true, message: "If that address can register, a verification message has been created." }, { status: 201 });
    if (message.includes("Unique constraint") || message.includes("P2002")) return Response.json({ error: "That username is not available." }, { status: 409 });
    return safeErrorResponse(error);
  }
}
