-- CreateEnum
CREATE TYPE "NoticeColor" AS ENUM ('YELLOW', 'PINK', 'BLUE', 'PURPLE', 'GREEN', 'ORANGE');

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_unitId_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_reportedById_fkey";

-- DropForeignKey
ALTER TABLE "Issue" DROP CONSTRAINT "Issue_teamId_fkey";

-- DropTable
DROP TABLE "Issue";

-- DropEnum
DROP TYPE "IssueStatus";

-- DropEnum
DROP TYPE "IssueSeverity";

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "color" "NoticeColor" NOT NULL DEFAULT 'YELLOW',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notice_teamId_pinned_createdAt_idx" ON "Notice"("teamId", "pinned", "createdAt");

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

