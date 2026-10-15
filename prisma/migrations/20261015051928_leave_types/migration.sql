-- AlterEnum
BEGIN;
CREATE TYPE "ShiftDayStatus_new" AS ENUM ('WORKING', 'WEEKEND', 'PAID_LEAVE', 'UNPAID_LEAVE', 'SICK_LEAVE');
ALTER TABLE "ShiftAssignment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ShiftAssignment" ALTER COLUMN "status" TYPE "ShiftDayStatus_new" USING ("status"::text::"ShiftDayStatus_new");
ALTER TYPE "ShiftDayStatus" RENAME TO "ShiftDayStatus_old";
ALTER TYPE "ShiftDayStatus_new" RENAME TO "ShiftDayStatus";
DROP TYPE "ShiftDayStatus_old";
ALTER TABLE "ShiftAssignment" ALTER COLUMN "status" SET DEFAULT 'WORKING';
COMMIT;

