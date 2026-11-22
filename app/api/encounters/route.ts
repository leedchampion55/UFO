import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin, enforceRateLimit, safeErrorResponse } from "@/lib/security";
import { createCaseReference, createStableSlug, parseVideoLinks, submissionSchema } from "@/lib/encounters";
import { prepareImages, uploadErrorMessage } from "@/lib/media";
import { privateStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let encounterId: string | undefined;
  const storedKeys: string[] = [];
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "public-submission", 4, 60 * 60);
    const formData = await request.formData();
    const parsed = submissionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the highlighted details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    let videoLinks: string[];
    try { videoLinks = parseVideoLinks(parsed.data.videoLinks); }
    catch { return NextResponse.json({ error: "Video links must be HTTPS YouTube or Vimeo URLs." }, { status: 400 }); }

    const category = await prisma.category.findFirst({ where: { id: parsed.data.categoryId, active: true }, select: { id: true } });
    if (!category) return NextResponse.json({ error: "Choose a valid encounter category." }, { status: 400 });

    const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    let prepared;
    try { prepared = await prepareImages(files); }
    catch (error) { return NextResponse.json({ error: uploadErrorMessage(error) ?? "A photograph could not be processed safely." }, { status: 400 }); }

    const removalToken = randomBytes(24).toString("hex");
    const encounter = await prisma.encounter.create({
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
        contact: {
          create: {
            email: parsed.data.privateEmail || null,
            privateName: parsed.data.displayName || null,
            removalTokenHash: createHash("sha256").update(removalToken).digest("hex"),
          },
        },
        moderationHistory: { create: { action: "SUBMITTED", updatedStatus: "PENDING" } },
      },
    });
    encounterId = encounter.id;

    for (const image of prepared) {
      const storageKey = `encounters/${encounter.id}/${image.id}.webp`;
      await privateStorage.put(storageKey, image.buffer);
      storedKeys.push(storageKey);
      await prisma.encounterMedia.create({
        data: {
          id: image.id,
          encounterId: encounter.id,
          storageKey,
          originalFileName: image.originalFileName,
          mimeType: image.mimeType,
          byteSize: image.buffer.byteLength,
          width: image.width,
          height: image.height,
          alternativeText: "Contributor-supplied image pending editorial review",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      caseReference: encounter.caseReference,
      removalToken,
      message: "Transmission received. Matt will take a look before we release it to the Earthlings.",
    }, { status: 201 });
  } catch (error) {
    await Promise.all(storedKeys.map((key) => privateStorage.delete(key).catch(() => undefined)));
    if (encounterId) await prisma.encounter.delete({ where: { id: encounterId } }).catch(() => undefined);
    return safeErrorResponse(error);
  }
}
