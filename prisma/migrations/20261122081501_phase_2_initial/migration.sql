-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAFT', 'PENDING', 'NEEDS_INFORMATION', 'PUBLISHED', 'REJECTED', 'UNPUBLISHED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('SUBMITTED', 'CREATED', 'UPDATED', 'REQUESTED_INFORMATION', 'APPROVED', 'REJECTED', 'PUBLISHED', 'UNPUBLISHED', 'DELETED', 'MEDIA_APPROVED', 'MEDIA_REMOVED');

-- CreateEnum
CREATE TYPE "AdministratorRole" AS ENUM ('OWNER', 'EDITOR');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imagePath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "caseReference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "originalStoryContent" TEXT NOT NULL,
    "storyContent" TEXT NOT NULL,
    "summary" TEXT,
    "encounterDate" TIMESTAMP(3),
    "approximateDate" TEXT,
    "approximateTime" TEXT,
    "approximateLocation" TEXT,
    "region" TEXT,
    "witnessCount" INTEGER,
    "publicDisplayName" TEXT,
    "publishAnonymously" BOOLEAN NOT NULL DEFAULT false,
    "publicationConsent" BOOLEAN NOT NULL,
    "videoLinks" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" "EncounterStatus" NOT NULL DEFAULT 'PENDING',
    "founderFile" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "administrativeNotes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterMedia" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "alternativeText" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedByAdminId" TEXT,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "EncounterMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionContact" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "email" TEXT,
    "privateName" TEXT,
    "removalTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterModeration" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "administratorId" TEXT,
    "action" "ModerationAction" NOT NULL,
    "previousStatus" "EncounterStatus",
    "updatedStatus" "EncounterStatus",
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterModeration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Administrator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdministratorRole" NOT NULL DEFAULT 'EDITOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Administrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRateLimit" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_sortOrder_idx" ON "Category"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_caseReference_key" ON "Encounter"("caseReference");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_slug_key" ON "Encounter"("slug");

-- CreateIndex
CREATE INDEX "Encounter_status_publishedAt_idx" ON "Encounter"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Encounter_categoryId_status_publishedAt_idx" ON "Encounter"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Encounter_founderFile_status_publishedAt_idx" ON "Encounter"("founderFile", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Encounter_featured_status_publishedAt_idx" ON "Encounter"("featured", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Encounter_submittedAt_idx" ON "Encounter"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EncounterMedia_storageKey_key" ON "EncounterMedia"("storageKey");

-- CreateIndex
CREATE INDEX "EncounterMedia_encounterId_approvedAt_removedAt_idx" ON "EncounterMedia"("encounterId", "approvedAt", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionContact_encounterId_key" ON "SubmissionContact"("encounterId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionContact_removalTokenHash_key" ON "SubmissionContact"("removalTokenHash");

-- CreateIndex
CREATE INDEX "EncounterModeration_encounterId_createdAt_idx" ON "EncounterModeration"("encounterId", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterModeration_administratorId_createdAt_idx" ON "EncounterModeration"("administratorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Administrator_userId_key" ON "Administrator"("userId");

-- CreateIndex
CREATE INDEX "RequestRateLimit_purpose_windowStart_idx" ON "RequestRateLimit"("purpose", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRateLimit_purpose_keyHash_windowStart_key" ON "RequestRateLimit"("purpose", "keyHash", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedia" ADD CONSTRAINT "EncounterMedia_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMedia" ADD CONSTRAINT "EncounterMedia_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionContact" ADD CONSTRAINT "SubmissionContact_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterModeration" ADD CONSTRAINT "EncounterModeration_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterModeration" ADD CONSTRAINT "EncounterModeration_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Administrator" ADD CONSTRAINT "Administrator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
