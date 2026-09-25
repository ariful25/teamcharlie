-- DropIndex
DROP INDEX "Notice_teamId_pinned_createdAt_idx";

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checklist" JSONB;

-- CreateIndex
CREATE INDEX "Notice_teamId_archived_pinned_createdAt_idx" ON "Notice"("teamId", "archived", "pinned", "createdAt");

