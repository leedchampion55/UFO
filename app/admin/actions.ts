"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireStrongAdmin } from "@/lib/auth";
import { createCaseReference, createStableSlug, parseVideoLinks } from "@/lib/encounters";
import { prepareImages } from "@/lib/media";
import { deleteMediaObject, uploadMediaObject } from "@/lib/media-lifecycle";
import { prisma } from "@/lib/prisma";

const editSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(5).max(140),
  categoryId: z.string().uuid(),
  storyContent: z.string().trim().min(20).max(30000),
  summary: z.string().trim().max(500).optional(),
  approximateDate: z.string().trim().max(120).optional(),
  encounterDate: z.string().date().optional().or(z.literal("")),
  approximateLocation: z.string().trim().max(200).optional(),
  region: z.string().trim().max(120).optional(),
  publicDisplayName: z.string().trim().max(100).optional(),
  witnessCount: z.coerce.number().int().min(1).max(1000).optional().or(z.literal("")),
  videoLinks: z.string().trim().max(2000).optional(),
});

export async function updateEncounter(formData: FormData) {
  await requireAdmin();
  const parsed = editSchema.parse(Object.fromEntries(formData.entries()));
  await prisma.encounter.update({
    where: { id: parsed.id },
    data: {
      title: parsed.title,
      categoryId: parsed.categoryId,
      storyContent: parsed.storyContent,
      summary: parsed.summary || null,
      approximateDate: parsed.approximateDate || null,
      encounterDate: parsed.encounterDate === undefined ? undefined : parsed.encounterDate ? new Date(`${parsed.encounterDate}T12:00:00.000Z`) : null,
      approximateLocation: parsed.approximateLocation || null,
      region: parsed.region || null,
      publicDisplayName: parsed.publicDisplayName || null,
      witnessCount: typeof parsed.witnessCount === "number" ? parsed.witnessCount : null,
      videoLinks: parseVideoLinks(parsed.videoLinks),
      featured: formData.get("featured") === "on",
      publishAnonymously: formData.get("publishAnonymously") === "on",
      moderationHistory: { create: { action: "UPDATED" } },
    },
  });
  revalidatePath("/");
  revalidatePath("/encounters");
  revalidatePath(`/admin/encounters/${parsed.id}`);
}

export async function moderateEncounter(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { administrator } = await requireStrongAdmin(`/admin/encounters/${id}`);
  const intent = z.enum(["publish", "reject", "needs-info", "unpublish", "restore-draft"]).parse(formData.get("intent"));
  const reason = z.string().trim().max(1000).optional().parse(formData.get("reason") || undefined);
  const existing = await prisma.encounter.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const map = {
    publish: { status: "PUBLISHED", action: "PUBLISHED" },
    reject: { status: "REJECTED", action: "REJECTED" },
    "needs-info": { status: "NEEDS_INFORMATION", action: "REQUESTED_INFORMATION" },
    unpublish: { status: "UNPUBLISHED", action: "UNPUBLISHED" },
    "restore-draft": { status: "DRAFT", action: "UPDATED" },
  } as const;
  const next = map[intent];
  await prisma.$transaction([
    prisma.encounter.update({ where: { id }, data: { status: next.status, publishedAt: intent === "publish" ? new Date() : intent === "unpublish" ? null : undefined } }),
    prisma.encounterModeration.create({ data: { encounterId: id, administratorId: administrator.id, action: next.action, previousStatus: existing.status, updatedStatus: next.status, reason } }),
    ...(intent === "publish" ? [prisma.encounterMedia.updateMany({ where: { encounterId: id, removedAt: null, storageStatus: "READY" }, data: { approvedAt: new Date(), approvedByAdminId: administrator.id } })] : []),
  ]);
  revalidatePath("/");
  revalidatePath("/encounters");
  revalidatePath("/matts-files");
  revalidatePath(`/admin/encounters/${id}`);
}

export async function createFounderFile(formData: FormData) {
  const { administrator } = await requireStrongAdmin("/admin/new");
  const data = z.object({
    title: z.string().trim().min(5).max(140),
    categoryId: z.string().uuid(),
    storyContent: z.string().trim().min(20).max(30000),
    approximateDate: z.string().trim().max(120).optional(),
    encounterDate: z.string().date().optional().or(z.literal("")),
    approximateLocation: z.string().trim().max(200).optional(),
    intent: z.enum(["draft", "publish"]),
  }).parse(Object.fromEntries(formData.entries()));
  const publish = data.intent === "publish";
  const encounter = await prisma.encounter.create({
    data: {
      caseReference: createCaseReference(), slug: createStableSlug(data.title), title: data.title, categoryId: data.categoryId,
      originalStoryContent: data.storyContent, storyContent: data.storyContent, approximateDate: data.approximateDate || null,
      encounterDate: data.encounterDate ? new Date(`${data.encounterDate}T12:00:00.000Z`) : null,
      approximateLocation: data.approximateLocation || null, publicDisplayName: administrator.displayName, publishAnonymously: false,
      publicationConsent: true, founderFile: true, featured: formData.get("featured") === "on", createdByAdminId: administrator.id,
      status: publish ? "PUBLISHED" : "DRAFT", publishedAt: publish ? new Date() : null,
      moderationHistory: { create: { administratorId: administrator.id, action: publish ? "PUBLISHED" : "CREATED", updatedStatus: publish ? "PUBLISHED" : "DRAFT" } },
    },
  });
  redirect(`/admin/encounters/${encounter.id}`);
}

export async function uploadAdminMedia(formData: FormData) {
  const encounterId = z.string().uuid().parse(formData.get("id"));
  const { administrator } = await requireStrongAdmin(`/admin/encounters/${encounterId}`);
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  const prepared = await prepareImages(files);
  for (const image of prepared) {
    const storageKey = `encounters/${image.id.slice(0, 2)}/${image.id}.webp`;
    await prisma.encounterMedia.create({ data: { id: image.id, encounterId, storageKey, originalFileName: image.originalFileName, mimeType: image.mimeType, byteSize: image.buffer.byteLength, width: image.width, height: image.height, storageStatus: "PENDING_UPLOAD", alternativeText: "Encounter evidence image" } });
    await uploadMediaObject(image.id, image.buffer, image.mimeType);
    await prisma.encounterMedia.update({ where: { id: image.id }, data: { approvedAt: new Date(), approvedByAdminId: administrator.id } });
  }
  revalidatePath(`/admin/encounters/${encounterId}`);
}

export async function removeMedia(formData: FormData) {
  const mediaId = z.string().uuid().parse(formData.get("mediaId"));
  const media = await prisma.encounterMedia.findUniqueOrThrow({ where: { id: mediaId } });
  const { administrator } = await requireStrongAdmin(`/admin/encounters/${media.encounterId}`);
  await prisma.$transaction([
    prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "DELETING", storageUpdatedAt: new Date(), removedAt: new Date(), approvedAt: null, approvedByAdminId: null } }),
    prisma.encounterModeration.create({ data: { encounterId: media.encounterId, administratorId: administrator.id, action: "MEDIA_REMOVED", metadata: { mediaId } } }),
  ]);
  await deleteMediaObject(mediaId).catch(() => undefined);
  revalidatePath(`/admin/encounters/${media.encounterId}`);
}

export async function deleteEncounter(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const { administrator } = await requireStrongAdmin(`/admin/encounters/${id}`);
  const existing = await prisma.encounter.findUniqueOrThrow({ where: { id }, include: { media: true } });
  await prisma.$transaction([
    prisma.submissionContact.deleteMany({ where: { encounterId: id } }),
    prisma.encounterMedia.updateMany({ where: { encounterId: id }, data: { storageStatus: "DELETING", storageUpdatedAt: new Date(), removedAt: new Date(), approvedAt: null, approvedByAdminId: null } }),
    prisma.encounter.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date(), title: "Deleted encounter", storyContent: "", originalStoryContent: "", summary: null, publicDisplayName: null, approximateLocation: null } }),
    prisma.encounterModeration.create({ data: { encounterId: id, administratorId: administrator.id, action: "DELETED", previousStatus: existing.status, updatedStatus: "DELETED" } }),
  ]);
  await Promise.all(existing.media.map((item) => deleteMediaObject(item.id).catch(() => undefined)));
  redirect("/admin");
}
