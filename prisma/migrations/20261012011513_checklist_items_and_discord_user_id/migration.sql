-- CreateEnum
CREATE TYPE "ChecklistType" AS ENUM ('CHECKOUT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discordUserId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "checkoutChecklist" JSONB;

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" "ChecklistType" NOT NULL DEFAULT 'CHECKOUT',
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_teamId_type_active_idx" ON "ChecklistItem"("teamId", "type", "active");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
