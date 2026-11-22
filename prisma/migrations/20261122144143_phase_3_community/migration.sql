-- CreateEnum
CREATE TYPE "CommunityReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'PERSONAL_INFORMATION', 'INAPPROPRIATE_CONTENT', 'MISLEADING_OR_IMPERSONATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CommunityTargetType" AS ENUM ('DISCUSSION', 'DISCUSSION_REPLY', 'ENCOUNTER_COMMENT', 'MEMBER');

-- CreateEnum
CREATE TYPE "CommunityModerationAction" AS ENUM ('DISCUSSION_PINNED', 'DISCUSSION_UNPINNED', 'DISCUSSION_LOCKED', 'DISCUSSION_UNLOCKED', 'DISCUSSION_REMOVED', 'REPLY_REMOVED', 'COMMENT_REMOVED', 'MEMBER_SUSPENDED', 'MEMBER_REINSTATED', 'REPORT_RESOLVED', 'REPORT_DISMISSED');

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'member';

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameCanonical" TEXT NOT NULL,
    "displayName" TEXT,
    "biography" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '✦',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discussion" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "authorId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Discussion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionReply" (
    "id" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DiscussionReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterComment" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "authorId" TEXT,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EncounterComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" "CommunityReportReason" NOT NULL,
    "details" TEXT,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'PENDING',
    "discussionId" TEXT,
    "discussionReplyId" TEXT,
    "encounterCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityModeration" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "action" "CommunityModerationAction" NOT NULL,
    "targetType" "CommunityTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityModeration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_userId_key" ON "MemberProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_username_key" ON "MemberProfile"("username");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_usernameCanonical_key" ON "MemberProfile"("usernameCanonical");

-- CreateIndex
CREATE INDEX "MemberProfile_suspendedAt_idx" ON "MemberProfile"("suspendedAt");

-- CreateIndex
CREATE INDEX "MemberProfile_joinedAt_idx" ON "MemberProfile"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionCategory_name_key" ON "DiscussionCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionCategory_slug_key" ON "DiscussionCategory"("slug");

-- CreateIndex
CREATE INDEX "DiscussionCategory_active_sortOrder_idx" ON "DiscussionCategory"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Discussion_slug_key" ON "Discussion"("slug");

-- CreateIndex
CREATE INDEX "Discussion_categoryId_deletedAt_lastActivityAt_idx" ON "Discussion"("categoryId", "deletedAt", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Discussion_pinned_deletedAt_lastActivityAt_idx" ON "Discussion"("pinned", "deletedAt", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Discussion_authorId_createdAt_idx" ON "Discussion"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionReply_discussionId_deletedAt_createdAt_idx" ON "DiscussionReply"("discussionId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionReply_authorId_createdAt_idx" ON "DiscussionReply"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterComment_encounterId_parentId_deletedAt_createdAt_idx" ON "EncounterComment"("encounterId", "parentId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterComment_authorId_createdAt_idx" ON "EncounterComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_status_createdAt_idx" ON "CommunityReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_discussionId_idx" ON "CommunityReport"("discussionId");

-- CreateIndex
CREATE INDEX "CommunityReport_discussionReplyId_idx" ON "CommunityReport"("discussionReplyId");

-- CreateIndex
CREATE INDEX "CommunityReport_encounterCommentId_idx" ON "CommunityReport"("encounterCommentId");

-- CreateIndex
CREATE INDEX "CommunityModeration_administratorId_createdAt_idx" ON "CommunityModeration"("administratorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModeration_targetType_targetId_createdAt_idx" ON "CommunityModeration"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DiscussionCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionReply" ADD CONSTRAINT "DiscussionReply_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionReply" ADD CONSTRAINT "DiscussionReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterComment" ADD CONSTRAINT "EncounterComment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterComment" ADD CONSTRAINT "EncounterComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterComment" ADD CONSTRAINT "EncounterComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EncounterComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_discussionReplyId_fkey" FOREIGN KEY ("discussionReplyId") REFERENCES "DiscussionReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_encounterCommentId_fkey" FOREIGN KEY ("encounterCommentId") REFERENCES "EncounterComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityModeration" ADD CONSTRAINT "CommunityModeration_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
