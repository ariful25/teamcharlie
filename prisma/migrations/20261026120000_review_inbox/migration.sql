-- AlterTable
ALTER TABLE "TeamSettings" ADD COLUMN     "reviewInboxCreatedById" TEXT,
ADD COLUMN     "reviewInboxLastSeenAt" TIMESTAMP(3),
ADD COLUMN     "reviewInboxTokenHash" TEXT,
ADD COLUMN     "reviewInboxTokenHint" TEXT;

-- CreateTable
CREATE TABLE "ReviewInboxItem" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "propertyId" TEXT,
    "reviewId" TEXT,
    "parsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewInboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewInboxItem_teamId_status_idx" ON "ReviewInboxItem"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewInboxItem_teamId_externalId_key" ON "ReviewInboxItem"("teamId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSettings_reviewInboxTokenHash_key" ON "TeamSettings"("reviewInboxTokenHash");

