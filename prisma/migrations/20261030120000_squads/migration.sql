-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'HR';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "squadId" TEXT;

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "squadId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "squadId" TEXT;

-- AlterTable
ALTER TABLE "TeamInvite" ADD COLUMN     "squadId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "squadId" TEXT;

-- CreateTable
CREATE TABLE "Squad" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Squad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Squad_teamId_name_key" ON "Squad"("teamId", "name");

-- CreateIndex
CREATE INDEX "Client_squadId_idx" ON "Client"("squadId");

-- CreateIndex
CREATE INDEX "Notice_squadId_idx" ON "Notice"("squadId");

-- CreateIndex
CREATE INDEX "Task_teamId_squadId_idx" ON "Task"("teamId", "squadId");

-- CreateIndex
CREATE INDEX "User_squadId_idx" ON "User"("squadId");

-- AddForeignKey
ALTER TABLE "Squad" ADD CONSTRAINT "Squad_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "Squad"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: every existing company gets one team named after it, and all of its
-- current people (except admins, who stay company-wide), clients, tasks and
-- notices move into that team. Nothing is deleted.
INSERT INTO "Squad" ("id", "teamId", "name", "updatedAt")
SELECT 'sq_' || "id", "id", "name", CURRENT_TIMESTAMP FROM "Team";

UPDATE "User" SET "squadId" = 'sq_' || "teamId" WHERE "role" <> 'ADMIN';
UPDATE "Client" SET "squadId" = 'sq_' || "teamId";
UPDATE "Task" SET "squadId" = 'sq_' || "teamId";
UPDATE "Notice" SET "squadId" = 'sq_' || "teamId";
