import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, enforceRateLimit, safeErrorResponse } from "@/lib/security";
import { createCaseReference, createStableSlug, parseVideoLinks, submissionSchema } from "@/lib/encounters";
import { assertUploadRequestSize, prepareImages, uploadErrorMessage } from "@/lib/media";
import { uploadMediaObject } from "@/lib/media-lifecycle";
import { enqueueTransactionalEmail, processEmailOutbox } from "@/lib/email/outbox";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (process.env.PUBLIC_SUBMISSIONS_ENABLED === "false") return NextResponse.json({ error: "Encounter submissions are temporarily paused. Please try again later." }, { status: 503, headers: { "retry-after": "3600" } });
    assertSameOrigin(request);
    await enforceRateLimit(request, "public-submission", 4, 60 * 60);
    assertUploadRequestSize(request);
    const formData = await request.formData();
    const parsed = submissionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the highlighted details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    let videoLinks: string[];
    try { videoLinks = parseVideoLinks(parsed.data.videoLinks); }
    catch { return NextResponse.json({ error: "Video links must be HTTPS YouTube or Vimeo URLs." }, { status: 400 }); }

    const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, active: true }, select: { id: true, name: true } });
    if (!category) return NextResponse.json({ error: "Choose a valid encounter category." }, { status: 400 });

    const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    let prepared;
    try { prepared = await prepareImages(files); }
    catch (error) {
      await enforceRateLimit(request, "invalid-public-upload", 8, 60 * 60);
      return NextResponse.json({ error: uploadErrorMessage(error) ?? "A photograph could not be processed safely." }, { status: error instanceof Error && error.message === "UPLOAD_BUSY" ? 503 : 400 });
    }

    const removalToken = randomBytes(24).toString("hex");
    const { encounter, notificationId } = await prisma.$transaction(async (transaction) => {
      const created = await transaction.encounter.create({
        data: {
          caseReference: createCaseReference(),
          slug: createStableSlug(parsed.data.title),
          title: parsed.data.title,
          categoryId: category.id,
          originalStoryContent: parsed.data.description,
          storyContent: parsed.data.description,
          approximateDate: parsed.data.approximateDate || null,
          approximateTime: parsed.data.approximateTime || null,
          approximateLocation: parsed.data.approximateLocation || null,
          region: parsed.data.region || null,
          witnessCount: typeof parsed.data.witnessCount === "number" ? parsed.data.witnessCount : null,
          publicDisplayName: parsed.data.displayName || null,
          publishAnonymously: parsed.data.publishAnonymously,
          publicationConsent: true,
          videoLinks,
          status: "PENDING",
          contact: { create: { email: parsed.data.privateEmail || null, privateName: parsed.data.displayName || null, removalTokenHash: createHash("sha256").update(removalToken).digest("hex") } },
          moderationHistory: { create: { action: "SUBMITTED", updatedStatus: "PENDING" } },
          media: { create: prepared.map((image) => ({ id: image.id, storageKey: `encounters/${image.id.slice(0, 2)}/${image.id}.webp`, originalFileName: image.originalFileName, mimeType: image.mimeType, byteSize: image.buffer.byteLength, width: image.width, height: image.height, alternativeText: "Contributor-supplied image pending editorial review", storageStatus: "PENDING_UPLOAD" })) },
        },
      });
      const administratorEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
      const notification = administratorEmail ? await enqueueTransactionalEmail({
        kind: "ENCOUNTER_SUBMITTED",
        to: administratorEmail,
        idempotencyKey: `encounter-submitted/${created.id}`,
        payload: { caseReference: created.caseReference, category: category.name, submittedAt: created.submittedAt.toISOString(), actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/admin/encounters/${created.id}` },
      }, transaction) : null;
      return { encounter: created, notificationId: notification?.id };
    });

    let failedUploads = 0;
    for (const image of prepared) {
      try { await uploadMediaObject(image.id, image.buffer, image.mimeType); }
      catch { failedUploads++; }
    }
    if (notificationId && (process.env.EMAIL_DRIVER ?? "development") === "development") {
      await processEmailOutbox({ ids: [notificationId], limit: 1 }).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      caseReference: encounter.caseReference,
      removalToken,
      message: failedUploads
        ? "Transmission received. Your story is safe, but one or more photographs could not be stored and will need review."
        : "Transmission received. Matt will take a look before we release it to the Earthlings.",
    }, { status: 201 });
  } catch (error) {
    return safeErrorResponse(error);
  }
}
