-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "shiftTypeId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

