-- CreateEnum
CREATE TYPE "MediaStorageStatus" AS ENUM ('PENDING_UPLOAD', 'READY', 'FAILED', 'DELETING', 'REMOVED');

-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'PASSWORD_RESET_SECURITY', 'ACCOUNT_SECURITY', 'ENCOUNTER_SUBMITTED', 'COMMUNITY_REPORT');

-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('QUEUED', 'PROCESSING', 'ACCEPTED', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED');

-- AlterTable
ALTER TABLE "EncounterMedia" ADD COLUMN     "lastStorageError" TEXT,
ADD COLUMN     "storageAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageEtag" TEXT,
ADD COLUMN     "storageStatus" "MediaStorageStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
ADD COLUMN     "storageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key" ON "EmailOutbox"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_providerMessageId_key" ON "EmailOutbox"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_lockedAt_idx" ON "EmailOutbox"("lockedAt");

-- CreateIndex
CREATE INDEX "EmailOutbox_createdAt_idx" ON "EmailOutbox"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailWebhookEvent_providerEventId_key" ON "EmailWebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_providerMessageId_processedAt_idx" ON "EmailWebhookEvent"("providerMessageId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_recipientHash_key" ON "EmailSuppression"("recipientHash");

-- CreateIndex
CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");

-- CreateIndex
CREATE INDEX "EncounterMedia_storageStatus_storageUpdatedAt_idx" ON "EncounterMedia"("storageStatus", "storageUpdatedAt");
