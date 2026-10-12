-- AlterTable
ALTER TABLE "User" ADD COLUMN     "slackUserId" TEXT;

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "slackCheckInSynced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slackCheckOutSynced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slackCheckInError" TEXT,
ADD COLUMN     "slackCheckOutError" TEXT;
