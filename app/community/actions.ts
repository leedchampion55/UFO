"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMemberSession, requireVerifiedMember } from "@/lib/auth";
import { createStableSlug } from "@/lib/encounters";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/security";
import { appendInternalQuery } from "@/lib/redirects";

const content = z.string().trim().min(3).max(5000);

async function rateLimit(purpose: string, limit: number, seconds: number) {
  const requestHeaders = await headers();
  await enforceRateLimit(new Request(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", { headers: requestHeaders }), purpose, limit, seconds);
}

export async function createEncounterComment(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("encounter-comment", 12, 60 * 60);
  const data = z.object({ encounterId: z.string().uuid(), body: content, parentId: z.string().uuid().optional().or(z.literal("")), website: z.string().max(0).optional() }).parse(Object.fromEntries(formData.entries()));
  const encounter = await prisma.encounter.findFirstOrThrow({ where: { id: data.encounterId, status: "PUBLISHED", deletedAt: null }, select: { slug: true } });
  if (data.parentId) { const parent = await prisma.encounterComment.findFirst({ where: { id: data.parentId, encounterId: data.encounterId, parentId: null, deletedAt: null } }); if (!parent) throw new Error("INVALID_REPLY_TARGET"); }
  await prisma.encounterComment.create({ data: { encounterId: data.encounterId, authorId: profile.id, body: data.body, parentId: data.parentId || null } });
  revalidatePath(`/encounters/${encounter.slug}`);
}

export async function editEncounterComment(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("encounter-comment-edit", 30, 60 * 60); const id = z.string().uuid().parse(formData.get("id")); const body = content.parse(formData.get("body"));
  const comment = await prisma.encounterComment.findFirstOrThrow({ where: { id, authorId: profile.id, deletedAt: null }, include: { encounter: { select: { slug: true } } } });
  await prisma.encounterComment.update({ where: { id }, data: { body, editedAt: new Date() } }); revalidatePath(`/encounters/${comment.encounter.slug}`);
}

export async function deleteEncounterComment(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("encounter-comment-delete", 20, 60 * 60); const id = z.string().uuid().parse(formData.get("id"));
  const comment = await prisma.encounterComment.findFirstOrThrow({ where: { id, authorId: profile.id, deletedAt: null }, include: { encounter: { select: { slug: true } } } });
  await prisma.encounterComment.update({ where: { id }, data: { deletedAt: new Date(), body: "" } }); revalidatePath(`/encounters/${comment.encounter.slug}`);
}

export async function createDiscussion(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("new-discussion", 5, 60 * 60);
  const data = z.object({ title: z.string().trim().min(5).max(140), body: content.min(20), categoryId: z.string().uuid(), website: z.string().max(0).optional() }).parse(Object.fromEntries(formData.entries()));
  const category = await prisma.discussionCategory.findFirstOrThrow({ where: { id: data.categoryId, active: true } });
  const discussion = await prisma.discussion.create({ data: { slug: createStableSlug(data.title), title: data.title, body: data.body, categoryId: category.id, authorId: profile.id } });
  redirect(`/mothership/${discussion.slug}`);
}

export async function createDiscussionReply(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("discussion-reply", 15, 60 * 60);
  const data = z.object({ discussionId: z.string().uuid(), body: content, website: z.string().max(0).optional() }).parse(Object.fromEntries(formData.entries()));
  const discussion = await prisma.discussion.findFirstOrThrow({ where: { id: data.discussionId, deletedAt: null, locked: false }, select: { slug: true } });
  await prisma.$transaction([prisma.discussionReply.create({ data: { discussionId: data.discussionId, authorId: profile.id, body: data.body } }), prisma.discussion.update({ where: { id: data.discussionId }, data: { lastActivityAt: new Date() } })]);
  revalidatePath(`/mothership/${discussion.slug}`); revalidatePath("/mothership");
}

export async function editDiscussionReply(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("discussion-reply-edit", 30, 60 * 60); const id = z.string().uuid().parse(formData.get("id")); const body = content.parse(formData.get("body"));
  const reply = await prisma.discussionReply.findFirstOrThrow({ where: { id, authorId: profile.id, deletedAt: null }, include: { discussion: { select: { slug: true } } } });
  await prisma.discussionReply.update({ where: { id }, data: { body, editedAt: new Date() } }); revalidatePath(`/mothership/${reply.discussion.slug}`);
}

export async function deleteDiscussionReply(formData: FormData) {
  const { profile } = await requireVerifiedMember(); await rateLimit("discussion-reply-delete", 20, 60 * 60); const id = z.string().uuid().parse(formData.get("id"));
  const reply = await prisma.discussionReply.findFirstOrThrow({ where: { id, authorId: profile.id, deletedAt: null }, include: { discussion: { select: { slug: true } } } });
  await prisma.discussionReply.update({ where: { id }, data: { deletedAt: new Date(), body: "" } }); revalidatePath(`/mothership/${reply.discussion.slug}`);
}

export async function reportContent(formData: FormData) {
  const member = await getMemberSession(); await rateLimit("community-report", 8, 60 * 60);
  const data = z.object({ targetType: z.enum(["DISCUSSION", "DISCUSSION_REPLY", "ENCOUNTER_COMMENT"]), targetId: z.string().uuid(), reason: z.enum(["SPAM", "HARASSMENT", "PERSONAL_INFORMATION", "INAPPROPRIATE_CONTENT", "MISLEADING_OR_IMPERSONATION", "OTHER"]), details: z.string().trim().max(500).optional(), returnTo: z.string() }).parse(Object.fromEntries(formData.entries()));
  const target = data.targetType === "DISCUSSION" ? { discussionId: data.targetId } : data.targetType === "DISCUSSION_REPLY" ? { discussionReplyId: data.targetId } : { encounterCommentId: data.targetId };
  await prisma.communityReport.create({ data: { reporterId: member?.profile.id, reason: data.reason, details: data.details || null, ...target } });
  redirect(appendInternalQuery(data.returnTo, "reported", "true", "/report"));
}
