-- CreateEnum
CREATE TYPE "AttendanceReview" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "autoClosedAt" TIMESTAMP(3),
ADD COLUMN     "blocksCheckIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkInRequestedAt" TIMESTAMP(3),
ADD COLUMN     "checkoutNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "claimReason" TEXT,
ADD COLUMN     "claimedCheckIn" TIMESTAMP(3),
ADD COLUMN     "claimedCheckOut" TIMESTAMP(3),
ADD COLUMN     "effectiveCheckIn" TIMESTAMP(3),
ADD COLUMN     "effectiveCheckOut" TIMESTAMP(3),
ADD COLUMN     "missedCheckIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missedCheckOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reportedCheckOutAt" TIMESTAMP(3),
ADD COLUMN     "review" "AttendanceReview" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "shiftEndAt" TIMESTAMP(3),
ADD COLUMN     "shiftStartAt" TIMESTAMP(3),
ADD COLUMN     "tasksConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TeamSettings" ADD COLUMN     "autoCheckoutHours" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "AttendanceAudit" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requestedMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "askedById" TEXT,
    "publicHoliday" BOOLEAN NOT NULL DEFAULT false,
    "submittedAfterShift" BOOLEAN NOT NULL DEFAULT false,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "approvedMinutes" INTEGER,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceAudit_recordId_idx" ON "AttendanceAudit"("recordId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_teamId_status_idx" ON "OvertimeRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "OvertimeRequest_userId_date_idx" ON "OvertimeRequest"("userId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_review_idx" ON "AttendanceRecord"("review");

-- AddForeignKey
ALTER TABLE "AttendanceAudit" ADD CONSTRAINT "AttendanceAudit_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---- Backfill (hand-added to the generated diff) ----

-- Absolute scheduled instants, computed in each team's own timezone. An
-- end time earlier than the start time means the shift ends the next day.
UPDATE "AttendanceRecord" ar
-- Columns are timestamp-without-time-zone holding UTC (Prisma's convention),
-- so convert local wall time -> timestamptz -> UTC explicitly rather than
-- relying on the session's TimeZone setting.
SET "shiftStartAt" = (((ar."date"::date + ar."scheduledCheckIn"::time) AT TIME ZONE t."timezone") AT TIME ZONE 'UTC'),
    "shiftEndAt"   = (((ar."date"::date
                       + CASE WHEN ar."scheduledCheckOut" <= ar."scheduledCheckIn" THEN 1 ELSE 0 END
                       + ar."scheduledCheckOut"::time) AT TIME ZONE t."timezone") AT TIME ZONE 'UTC')
FROM "User" u
JOIN "Team" t ON t."id" = u."teamId"
WHERE u."id" = ar."userId"
  AND ar."scheduledCheckIn" ~ '^\d{2}:\d{2}$'
  AND ar."scheduledCheckOut" ~ '^\d{2}:\d{2}$';

-- Records an admin already corrected under the old system: those edits
-- overwrote the punches, so treat the stored times as approved.
UPDATE "AttendanceRecord"
SET "review" = 'APPROVED',
    "effectiveCheckIn" = "actualCheckIn",
    "effectiveCheckOut" = "actualCheckOut",
    "reviewedBy" = "editedBy",
    "reviewedAt" = "editedAt",
    "reviewNote" = "editReason",
    "tasksConfirmed" = true
WHERE "editedBy" IS NOT NULL
  AND "actualCheckIn" IS NOT NULL
  AND "actualCheckOut" IS NOT NULL;

-- Old forgotten check-outs: stopped at check-in + 10h and queued for a
-- lead's review, as the new auto-stop would have done — but blocksCheckIn
-- stays false: history from before these rules must not lock anyone out of
-- their next shift on day one.
UPDATE "AttendanceRecord"
SET "autoClosedAt" = "actualCheckIn" + interval '10 hours',
    "missedCheckOut" = true,
    "review" = 'PENDING',
    "status" = 'MISSING_CHECK_OUT'
WHERE "actualCheckIn" IS NOT NULL
  AND "actualCheckOut" IS NULL
  AND "actualCheckIn" < (now() AT TIME ZONE 'UTC') - interval '10 hours'
  AND "review" = 'NONE';

-- Everything already checked out was already reported — don't re-notify.
UPDATE "AttendanceRecord" SET "checkoutNotifiedAt" = "actualCheckOut" WHERE "actualCheckOut" IS NOT NULL;
