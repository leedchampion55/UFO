CREATE TABLE "OperationalLease" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationalLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX "OperationalLease_expiresAt_idx" ON "OperationalLease"("expiresAt");
