import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, enforceRateLimit, safeErrorResponse } from "@/lib/security";

export const runtime = "nodejs";

const requestSchema = z.object({
  caseReference: z.string().trim().min(8).max(40).transform((value) => value.toUpperCase()),
  removalToken: z.string().trim().length(48),
  action: z.enum(["remove", "anonymise"]),
});

function tokenMatches(provided: string, storedHash: string) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  return providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "contributor-removal", 6, 60 * 60);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the case reference, recovery token and request type." }, { status: 400 });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { caseReference: parsed.data.caseReference },
      include: { contact: true },
    });
    if (!encounter?.contact?.removalTokenHash || !tokenMatches(parsed.data.removalToken, encounter.contact.removalTokenHash)) {
      return NextResponse.json({ error: "Those recovery details do not match an encounter." }, { status: 404 });
    }

    if (parsed.data.action === "anonymise") {
      await prisma.$transaction([
        prisma.encounter.update({
          where: { id: encounter.id },
          data: { publishAnonymously: true, publicDisplayName: null },
        }),
        prisma.submissionContact.update({ where: { id: encounter.contact.id }, data: { privateName: null } }),
        prisma.encounterModeration.create({
          data: {
            encounterId: encounter.id,
            action: "UPDATED",
            previousStatus: encounter.status,
            updatedStatus: encounter.status,
            reason: "Verified contributor anonymisation request",
          },
        }),
      ]);
      return NextResponse.json({ ok: true, message: "Your public attribution has been removed." });
    }

    const nextStatus = encounter.status === "DELETED" ? "DELETED" : "UNPUBLISHED";
    await prisma.$transaction([
      prisma.encounter.update({
        where: { id: encounter.id },
        data: {
          status: nextStatus,
          publishedAt: null,
          publishAnonymously: true,
          publicDisplayName: null,
        },
      }),
      prisma.submissionContact.update({
        where: { id: encounter.contact.id },
        data: { email: null, privateName: null, removalTokenHash: null },
      }),
      prisma.encounterModeration.create({
        data: {
          encounterId: encounter.id,
          action: "UNPUBLISHED",
          previousStatus: encounter.status,
          updatedStatus: nextStatus,
          reason: "Verified contributor removal request; private contact data erased",
        },
      }),
    ]);
    return NextResponse.json({ ok: true, message: "The encounter has been removed from public view and your contact details erased." });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
