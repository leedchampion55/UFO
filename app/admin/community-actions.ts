"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const reason = z.string().trim().max(1000).optional();
export async function moderateDiscussion(formData: FormData) {
  const { administrator } = await requireAdmin(); const id = z.string().uuid().parse(formData.get("id")); const intent = z.enum(["pin", "unpin", "lock", "unlock", "remove"]).parse(formData.get("intent")); const note = reason.parse(formData.get("reason") || undefined);
  const map = { pin: ["DISCUSSION_PINNED", { pinned: true }], unpin: ["DISCUSSION_UNPINNED", { pinned: false }], lock: ["DISCUSSION_LOCKED", { locked: true }], unlock: ["DISCUSSION_UNLOCKED", { locked: false }], remove: ["DISCUSSION_REMOVED", { deletedAt: new Date() }] } as const; const [action, data] = map[intent];
  await prisma.$transaction([prisma.discussion.update({ where: { id }, data }), prisma.communityModeration.create({ data: { administratorId: administrator.id, action, targetType: "DISCUSSION", targetId: id, reason: note } })]); revalidatePath("/admin/community"); revalidatePath("/mothership");
}
export async function removeCommunityPost(formData: FormData) {
  const { administrator } = await requireAdmin(); const id = z.string().uuid().parse(formData.get("id")); const type = z.enum(["reply", "comment"]).parse(formData.get("type")); const note = reason.parse(formData.get("reason") || undefined);
  if (type === "reply") await prisma.$transaction([prisma.discussionReply.update({ where: { id }, data: { deletedAt: new Date(), body: "" } }), prisma.communityModeration.create({ data: { administratorId: administrator.id, action: "REPLY_REMOVED", targetType: "DISCUSSION_REPLY", targetId: id, reason: note } })]);
  else await prisma.$transaction([prisma.encounterComment.update({ where: { id }, data: { deletedAt: new Date(), body: "" } }), prisma.communityModeration.create({ data: { administratorId: administrator.id, action: "COMMENT_REMOVED", targetType: "ENCOUNTER_COMMENT", targetId: id, reason: note } })]);
  revalidatePath("/admin/community");
}
export async function moderateMember(formData: FormData) {
  const { administrator } = await requireAdmin(); const id = z.string().uuid().parse(formData.get("id")); const intent = z.enum(["suspend", "reinstate"]).parse(formData.get("intent")); const note = reason.parse(formData.get("reason") || undefined);
  const profile = await prisma.memberProfile.update({ where: { id }, data: intent === "suspend" ? { suspendedAt: new Date(), suspensionReason: note ?? "Community guidelines review" } : { suspendedAt: null, suspensionReason: null } });
  if (intent === "suspend") await prisma.session.deleteMany({ where: { userId: profile.userId } });
  await prisma.communityModeration.create({ data: { administratorId: administrator.id, action: intent === "suspend" ? "MEMBER_SUSPENDED" : "MEMBER_REINSTATED", targetType: "MEMBER", targetId: id, reason: note } }); revalidatePath("/admin/community");
}
export async function resolveCommunityReport(formData: FormData) {
  const { administrator } = await requireAdmin(); const id = z.string().uuid().parse(formData.get("id")); const intent = z.enum(["resolve", "dismiss"]).parse(formData.get("intent")); const note = reason.parse(formData.get("reason") || undefined);
  const report = await prisma.communityReport.findUniqueOrThrow({ where: { id }, select: { discussionId: true, discussionReplyId: true, encounterCommentId: true } });
  const target = report.discussionId ? { type: "DISCUSSION" as const, id: report.discussionId } : report.discussionReplyId ? { type: "DISCUSSION_REPLY" as const, id: report.discussionReplyId } : { type: "ENCOUNTER_COMMENT" as const, id: report.encounterCommentId! };
  await prisma.$transaction([prisma.communityReport.update({ where: { id }, data: { status: intent === "resolve" ? "RESOLVED" : "DISMISSED", resolvedAt: new Date(), resolvedByAdminId: administrator.id, resolutionNote: note } }), prisma.communityModeration.create({ data: { administratorId: administrator.id, action: intent === "resolve" ? "REPORT_RESOLVED" : "REPORT_DISMISSED", targetType: target.type, targetId: target.id, reason: note, metadata: { reportId: id } } })]); revalidatePath("/admin/community");
}
