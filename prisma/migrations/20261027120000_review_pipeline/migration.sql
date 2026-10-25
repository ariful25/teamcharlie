-- AlterTable
ALTER TABLE "ListingReview" ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "stayId" TEXT;

-- AlterTable
ALTER TABLE "ReviewInboxItem" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'GUEST_REVIEW',
ADD COLUMN     "stayId" TEXT;

-- CreateTable
CREATE TABLE "GuestStay" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "propertyId" TEXT,
    "confirmationCode" TEXT,
    "guestName" TEXT NOT NULL,
    "guests" INTEGER,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "stage" TEXT NOT NULL DEFAULT 'BOOKED',
    "issueNote" TEXT,
    "followUpSentAt" TIMESTAMP(3),
    "guestRepliedAt" TIMESTAMP(3),
    "reviewRequestedAt" TIMESTAMP(3),
    "hostReviewedAt" TIMESTAMP(3),
    "guestReviewedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestStay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StayEvent" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestStay_teamId_stage_idx" ON "GuestStay"("teamId", "stage");

-- CreateIndex
CREATE INDEX "GuestStay_teamId_checkOut_idx" ON "GuestStay"("teamId", "checkOut");

-- CreateIndex
CREATE UNIQUE INDEX "GuestStay_teamId_confirmationCode_key" ON "GuestStay"("teamId", "confirmationCode");

-- CreateIndex
CREATE INDEX "StayEvent_stayId_at_idx" ON "StayEvent"("stayId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_teamId_key_key" ON "MessageTemplate"("teamId", "key");

-- AddForeignKey
ALTER TABLE "GuestStay" ADD CONSTRAINT "GuestStay_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyKnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayEvent" ADD CONSTRAINT "StayEvent_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

