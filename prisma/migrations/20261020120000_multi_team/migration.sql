-- DropIndex
DROP INDEX "Category_name_key";

-- AlterTable
ALTER TABLE "TeamSettings" ADD COLUMN     "discordWebhookUrl" TEXT;

-- AlterTable — nullable first so existing rows can be backfilled below.
ALTER TABLE "Category" ADD COLUMN     "teamId" TEXT;

-- Backfill (hand-added to the generated diff). Categories used to be global.
-- 1) Existing categories belong to the home team (slug 'charlie'), falling
--    back to the oldest team if there's no such slug.
UPDATE "Category"
SET "teamId" = COALESCE(
  (SELECT "id" FROM "Team" WHERE "slug" = 'charlie'),
  (SELECT "id" FROM "Team" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE "teamId" IS NULL;

-- 2) Every other existing team gets its own copy of each category...
INSERT INTO "Category" ("id", "name", "isCustom", "teamId", "createdAt")
SELECT 'c' || md5(random()::text || t."id" || c."id"), c."name", c."isCustom", t."id", CURRENT_TIMESTAMP
FROM "Category" c
CROSS JOIN "Team" t
WHERE c."teamId" IS NOT NULL AND t."id" <> c."teamId"
  AND c."teamId" = COALESCE(
    (SELECT "id" FROM "Team" WHERE "slug" = 'charlie'),
    (SELECT "id" FROM "Team" ORDER BY "createdAt" ASC LIMIT 1)
  );

-- 3) ...and that team's tasks are re-pointed at its own copy (matched by name).
UPDATE "Task" tk
SET "categoryId" = mine."id"
FROM "Category" orig, "Category" mine
WHERE tk."categoryId" = orig."id"
  AND orig."teamId" <> tk."teamId"
  AND mine."teamId" = tk."teamId"
  AND mine."name" = orig."name";

-- 4) Only possible if there were no teams at all: nothing can own these.
DELETE FROM "Category" WHERE "teamId" IS NULL;

ALTER TABLE "Category" ALTER COLUMN "teamId" SET NOT NULL;

-- CreateTable
CREATE TABLE "TeamInvite" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamInvite_tokenHash_key" ON "TeamInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "TeamInvite_teamId_idx" ON "TeamInvite"("teamId");

-- CreateIndex
CREATE INDEX "TeamInvite_email_idx" ON "TeamInvite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_teamId_name_key" ON "Category"("teamId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

