-- CreateTable
CREATE TABLE "ListingHealthSnapshot" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "title" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "cleanliness" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "checkin" DOUBLE PRECISION,
    "communication" DOUBLE PRECISION,
    "location" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "starShares" JSONB,
    "reviewTags" JSONB,
    "guestFavorite" BOOLEAN NOT NULL DEFAULT false,
    "superhost" BOOLEAN NOT NULL DEFAULT false,
    "photoCount" INTEGER,
    "genericCaptions" INTEGER,
    "descriptionLength" INTEGER,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "healthScore" INTEGER,
    "qualityScore" INTEGER,
    "issues" JSONB,

    CONSTRAINT "ListingHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingReview" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3),
    "rating" INTEGER NOT NULL,
    "guestName" TEXT,
    "comment" TEXT NOT NULL,
    "privateNote" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingHealthSnapshot_propertyId_fetchedAt_idx" ON "ListingHealthSnapshot"("propertyId", "fetchedAt");

-- CreateIndex
CREATE INDEX "ListingReview_propertyId_rating_idx" ON "ListingReview"("propertyId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "ListingReview_propertyId_fingerprint_key" ON "ListingReview"("propertyId", "fingerprint");

-- AddForeignKey
ALTER TABLE "ListingHealthSnapshot" ADD CONSTRAINT "ListingHealthSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyKnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyKnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

