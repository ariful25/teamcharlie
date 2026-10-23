-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PAID', 'UNPAID', 'SICK');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- AlterTable
ALTER TABLE "ListingHealthSnapshot" ADD COLUMN     "alertSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "TeamSettings" ADD COLUMN     "aiDailyLimit" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'ANTHROPIC',
ADD COLUMN     "anthropicKeyEnc" TEXT,
ADD COLUMN     "anthropicModel" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'BDT',
ADD COLUMN     "dailyRateDivisor" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "holidayOtMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2,
ADD COLUMN     "lateDaysPerDeduction" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openaiKeyEnc" TEXT,
ADD COLUMN     "openaiModel" TEXT,
ADD COLUMN     "otBase" TEXT NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "otHoursPerMonth" INTEGER NOT NULL DEFAULT 208,
ADD COLUMN     "otMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "paidLeavePerYear" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "sickLeavePerYear" INTEGER NOT NULL DEFAULT 14;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAiNote" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reviewId" TEXT,
    "content" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingAiNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "replaced" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyGross" INTEGER NOT NULL,
    "basicPercent" INTEGER NOT NULL DEFAULT 60,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "basic" INTEGER NOT NULL,
    "otPay" INTEGER NOT NULL,
    "deductions" INTEGER NOT NULL,
    "adjustment" INTEGER NOT NULL DEFAULT 0,
    "net" INTEGER NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_teamId_createdAt_idx" ON "AiUsage"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingAiNote_propertyId_kind_createdAt_idx" ON "ListingAiNote"("propertyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_teamId_status_idx" ON "LeaveRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalary_userId_key" ON "EmployeeSalary"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_teamId_year_month_key" ON "PayrollRun"("teamId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_userId_key" ON "PayrollLine"("runId", "userId");

-- CreateIndex
CREATE INDEX "Task_teamId_sourceRef_idx" ON "Task"("teamId", "sourceRef");

-- AddForeignKey
ALTER TABLE "ListingAiNote" ADD CONSTRAINT "ListingAiNote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyKnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

