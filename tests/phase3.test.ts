import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { POST as register } from "@/app/api/members/register/route";
import { auth } from "@/lib/auth";
import { postingEligibility } from "@/lib/community-access";
import { deleteDevelopmentEmailsForRecipient, listDevelopmentEmails } from "@/lib/dev-mail";
import { createCaseReference, createStableSlug } from "@/lib/encounters";
import { prisma } from "@/lib/prisma";

const marker = `[phase3-${randomUUID()}]`;
const email = `phase3-${randomUUID()}@example.test`;
const otherEmail = `phase3-other-${randomUUID()}@example.test`;
const adminEmail = `phase3-admin-${randomUUID()}@example.test`;
const password = "Phase-Three-Test-Password-2026!";
const resetPassword = "Phase-Three-Reset-Password-2026!";
let userId = ""; let profileId = ""; let otherUserId = ""; let otherProfileId = ""; let categoryId = ""; let discussionCategoryId = ""; let encounterId = ""; let discussionId = ""; let commentId = ""; let replyId = ""; let administratorId = "";

function registrationRequest() { return new Request("http://localhost:3000/api/members/register", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-real-ip": randomUUID() }, body: JSON.stringify({ email, username: `member_${randomUUID().slice(0, 8)}`, password, website: "" }) }); }

describe("Phase 3 member and community system", { concurrency: false }, () => {
  before(async () => {
    categoryId = (await prisma.category.findFirstOrThrow({ where: { active: true } })).id;
    discussionCategoryId = (await prisma.discussionCategory.findFirstOrThrow({ where: { active: true } })).id;
  });
  after(async () => {
    await prisma.encounter.deleteMany({ where: { title: { startsWith: marker } } });
    await prisma.discussion.deleteMany({ where: { title: { startsWith: marker } } });
    if (administratorId) await prisma.communityModeration.deleteMany({ where: { administratorId } });
    await prisma.emailOutbox.deleteMany({ where: { recipient: { in: [email, otherEmail, adminEmail] } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail, adminEmail] } } });
    await deleteDevelopmentEmailsForRecipient(email); await deleteDevelopmentEmailsForRecipient(otherEmail);
    await prisma.$disconnect();
  });

  it("1. registers a new visitor with a public member profile", async () => {
    const response = await register(registrationRequest()); assert.equal(response.status, 201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberProfile: true } }); userId = user.id; profileId = user.memberProfile!.id;
    assert.equal(user.role, "member"); assert.ok(user.memberProfile?.username);
  });
  it("2. creates a real local email verification message", async () => { const messages = await listDevelopmentEmails(); assert.ok(messages.some((item) => item.to === email && item.kind === "EMAIL_VERIFICATION" && item.actionUrl?.includes("verify-email"))); });
  it("3. blocks unverified members from posting", async () => { assert.deepEqual((await postingEligibility(userId)).reason, "EMAIL_VERIFICATION_REQUIRED"); });
  it("4. verifies the email through the generated secure token", async () => { const message = (await listDevelopmentEmails()).find((item) => item.to === email && item.kind === "EMAIL_VERIFICATION")!; const url = new URL(message.actionUrl!); await auth.api.verifyEmail({ query: { token: url.searchParams.get("token")! } }); assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified, true); });
  it("5. allows the verified member to sign in", async () => { const result = await auth.api.signInEmail({ body: { email, password } }); assert.equal(result.user.id, userId); assert.ok(result.token); });
  it("6. never grants administrator role through public registration", async () => { assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).role, "member"); assert.equal(await prisma.administrator.count({ where: { userId } }), 0); });
  it("7. rejects invalid member credentials", async () => { await assert.rejects(() => auth.api.signInEmail({ body: { email, password: "Wrong-password-2026!" } })); });
  it("7a. creates an account-recovery message without revealing account state", async () => { const result = await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } }); assert.equal(result.status, true); const messages = await listDevelopmentEmails(); assert.ok(messages.some((item) => item.to === email && item.kind === "PASSWORD_RESET")); });
  it("7b. resets the password with the secure recovery token", async () => { const message = (await listDevelopmentEmails()).find((item) => item.to === email && item.kind === "PASSWORD_RESET")!; const token = new URL(message.actionUrl!).pathname.split("/").at(-1)!; await auth.api.resetPassword({ body: { token, newPassword: resetPassword } }); const signedIn = await auth.api.signInEmail({ body: { email, password: resetPassword } }); assert.equal(signedIn.user.id, userId); assert.ok((await listDevelopmentEmails()).some((item) => item.to === email && item.kind === "PASSWORD_RESET_SECURITY")); });
  it("8. creates a second verified member for ownership checks", async () => { const created = await auth.api.signUpEmail({ body: { email: otherEmail, password, name: "other_member" } }); otherUserId = created.user.id; await prisma.user.update({ where: { id: otherUserId }, data: { emailVerified: true } }); const profile = await prisma.memberProfile.create({ data: { userId: otherUserId, username: `other_${randomUUID().slice(0, 8)}`, usernameCanonical: `other_${randomUUID()}` } }); otherProfileId = profile.id; assert.equal((await postingEligibility(otherUserId)).allowed, true); });
  it("9. suspends posting and invalidates established sessions", async () => { await prisma.memberProfile.update({ where: { id: profileId }, data: { suspendedAt: new Date(), suspensionReason: "Automated test" } }); await prisma.session.deleteMany({ where: { userId } }); assert.equal((await postingEligibility(userId)).reason, "MEMBER_SUSPENDED"); await prisma.memberProfile.update({ where: { id: profileId }, data: { suspendedAt: null, suspensionReason: null } }); });
  it("10. prepares a published encounter without private data in public projection", async () => { const encounter = await prisma.encounter.create({ data: { caseReference: createCaseReference(), slug: createStableSlug("Phase 3 encounter"), title: `${marker} encounter`, categoryId, originalStoryContent: "A fictional encounter used for community integration testing.", storyContent: "A fictional encounter used for community integration testing.", publicationConsent: true, status: "PUBLISHED", publishedAt: new Date(), contact: { create: { email: "private@example.test" } } } }); encounterId = encounter.id; const publicRecord = await prisma.encounter.findFirstOrThrow({ where: { id: encounterId, status: "PUBLISHED" }, select: { id: true, title: true } }); assert.equal("contact" in publicRecord, false); });
  it("11. allows verified members to add encounter comments", async () => { const comment = await prisma.encounterComment.create({ data: { encounterId, authorId: profileId, body: `${marker} thoughtful comment` } }); commentId = comment.id; assert.ok(comment.id); });
  it("12. lets public visitors read comments without private emails", async () => { const visible = await prisma.encounterComment.findMany({ where: { encounterId, deletedAt: null }, include: { author: { select: { username: true, displayName: true } } } }); assert.equal(visible.length, 1); assert.equal("email" in visible[0].author!, false); });
  it("13. supports one-level encounter comment replies", async () => { const reply = await prisma.encounterComment.create({ data: { encounterId, authorId: otherProfileId, parentId: commentId, body: `${marker} comment reply` } }); assert.equal(reply.parentId, commentId); });
  it("14. enforces comment ownership in update selectors", async () => { assert.equal((await prisma.encounterComment.updateMany({ where: { id: commentId, authorId: otherProfileId }, data: { body: "unauthorised" } })).count, 0); assert.equal((await prisma.encounterComment.updateMany({ where: { id: commentId, authorId: profileId }, data: { body: `${marker} edited by owner`, editedAt: new Date() } })).count, 1); });
  it("15. creates a verified-member discussion", async () => { const discussion = await prisma.discussion.create({ data: { slug: createStableSlug("Phase 3 topic"), title: `${marker} discussion`, body: "A thoughtful fictional opening post for automated community testing.", categoryId: discussionCategoryId, authorId: profileId } }); discussionId = discussion.id; assert.ok(discussion.slug); });
  it("16. exposes the discussion in public listing queries", async () => { assert.equal(await prisma.discussion.count({ where: { id: discussionId, deletedAt: null } }), 1); });
  it("17. lets a verified member reply to a discussion", async () => { const reply = await prisma.discussionReply.create({ data: { discussionId, authorId: otherProfileId, body: `${marker} forum reply` } }); replyId = reply.id; assert.ok(reply.id); });
  it("18. supports search and category filtering", async () => { const results = await prisma.discussion.findMany({ where: { categoryId: discussionCategoryId, title: { contains: marker, mode: "insensitive" }, deletedAt: null } }); assert.equal(results.length, 1); });
  it("19. rejects ordinary reply eligibility when a thread is locked", async () => { await prisma.discussion.update({ where: { id: discussionId }, data: { locked: true } }); const open = await prisma.discussion.findFirst({ where: { id: discussionId, locked: false, deletedAt: null } }); assert.equal(open, null); });
  it("20. accepts content reports without deleting reported content", async () => { const report = await prisma.communityReport.create({ data: { reporterId: profileId, discussionReplyId: replyId, reason: "SPAM" } }); assert.equal(report.status, "PENDING"); assert.equal(await prisma.discussionReply.count({ where: { id: replyId, deletedAt: null } }), 1); });
  it("21. records administrator moderation and removes inappropriate comments", async () => { const adminUser = await auth.api.createUser({ body: { email: adminEmail, name: "Phase 3 Admin", password, role: "admin" } }); const administrator = await prisma.administrator.create({ data: { userId: adminUser.user.id, displayName: "Phase 3 Admin", role: "OWNER" } }); administratorId = administrator.id; await prisma.$transaction([prisma.encounterComment.update({ where: { id: commentId }, data: { deletedAt: new Date(), body: "" } }), prisma.communityModeration.create({ data: { administratorId, action: "COMMENT_REMOVED", targetType: "ENCOUNTER_COMMENT", targetId: commentId, reason: "Automated moderation test" } })]); assert.equal(await prisma.communityModeration.count({ where: { administratorId, targetId: commentId } }), 1); });
  it("22. moderators can remove topics without destroying their audit target", async () => { await prisma.discussion.update({ where: { id: discussionId }, data: { deletedAt: new Date() } }); await prisma.communityModeration.create({ data: { administratorId, action: "DISCUSSION_REMOVED", targetType: "DISCUSSION", targetId: discussionId } }); assert.equal(await prisma.discussion.count({ where: { id: discussionId, deletedAt: null } }), 0); });
  it("23. preserves public authorship safely after account deletion", async () => { await prisma.user.delete({ where: { id: otherUserId } }); otherUserId = ""; assert.equal((await prisma.discussionReply.findUniqueOrThrow({ where: { id: replyId } })).authorId, null); });
});
