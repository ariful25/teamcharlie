-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAM_LEAD', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('STABLE', 'ATTENTION', 'URGENT', 'WAITING');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RepeatMode" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'CHECKED_IN', 'CHECKED_OUT', 'MISSING_CHECK_IN', 'MISSING_CHECK_OUT');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ShiftDayStatus" AS ENUM ('WORKING', 'WEEKEND', 'LEAVE');

-- CreateEnum
CREATE TYPE "UnitListingLevel" AS ENUM ('WHOLE_PROPERTY', 'WHOLE_HOUSE', 'PRIVATE_ROOM', 'DETACHED_UNIT');

-- CreateEnum
CREATE TYPE "TenancyStatus" AS ENUM ('CURRENT', 'UPCOMING', 'VACANT', 'AIRBNB_TRANSITION');

-- CreateEnum
CREATE TYPE "KnowledgePropertyStatus" AS ENUM ('PENDING', 'EXTRACTING', 'NEEDS_REVIEW', 'READY', 'EXPORTED', 'FAILED');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSettings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "discordCheckinWebhookConfigured" BOOLEAN NOT NULL DEFAULT false,
    "discordCheckoutWebhookConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "teamId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultShiftTypeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'STABLE',
    "guestCommunicationPlatform" TEXT,
    "operationPlatform" TEXT,
    "clientCommunicationPlatform" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "propertyName" TEXT,
    "categoryId" TEXT,
    "assignedUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "dueTime" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "status" "TaskStatus" NOT NULL DEFAULT 'UPCOMING',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "blockedReason" TEXT,
    "isRecurringTemplate" BOOLEAN NOT NULL DEFAULT false,
    "repeatMode" "RepeatMode" NOT NULL DEFAULT 'NONE',
    "repeatDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT,
    "photosLink" TEXT,
    "redfinLink" TEXT,
    "zillowLink" TEXT,
    "googleMapsLink" TEXT,
    "driveTimesNote" TEXT,
    "generalNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyKnowledgeItem" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "airbnbUrl" TEXT NOT NULL,
    "airbnbListingId" TEXT,
    "status" "KnowledgePropertyStatus" NOT NULL DEFAULT 'PENDING',
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "extractionError" TEXT,
    "listingName" TEXT,
    "description" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "propertyType" TEXT,
    "location" TEXT,
    "guestCapacity" INTEGER,
    "bedrooms" DOUBLE PRECISION,
    "bathrooms" DOUBLE PRECISION,
    "beds" DOUBLE PRECISION,
    "rules" TEXT,
    "wifiName" TEXT,
    "wifiPassword" TEXT,
    "doorCode" TEXT,
    "parkingInfo" TEXT,
    "checkInInfo" TEXT,
    "checkoutInfo" TEXT,
    "internalNotes" TEXT,
    "extractedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyKnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "parentUnitId" TEXT,
    "internalName" TEXT NOT NULL,
    "listingLevel" "UnitListingLevel" NOT NULL,
    "bedBathConfig" TEXT,
    "bedType" TEXT,
    "hasSofaBed" BOOLEAN NOT NULL DEFAULT false,
    "thermostatLocation" TEXT,
    "parkingInfo" TEXT,
    "petPolicy" TEXT,
    "hasTV" BOOLEAN,
    "airbnbLink" TEXT,
    "vrboLink" TEXT,
    "amenitiesDocLink" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenancy" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "TenancyStatus" NOT NULL,
    "tenantName" TEXT,
    "tenantContact" TEXT,
    "moveInDate" TIMESTAMP(3),
    "moveOutDate" TIMESTAMP(3),
    "nextTenantName" TEXT,
    "nextTenantMoveIn" TIMESTAMP(3),
    "nextTenantMoveOut" TIMESTAMP(3),
    "leaseSource" TEXT,
    "rentAmount" DECIMAL(10,2),
    "securityDeposit" DECIMAL(10,2),
    "cleaningFee" DECIMAL(10,2),
    "petFee" DECIMAL(10,2),
    "utilitiesNote" TEXT,
    "parkingNote" TEXT,
    "amountDue" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "interestedUnitId" TEXT,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "contactedDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftType" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#22d3ee',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftTypeId" TEXT,
    "status" "ShiftDayStatus" NOT NULL DEFAULT 'WORKING',
    "customStart" TEXT,
    "customEnd" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "scheduledCheckIn" TEXT,
    "scheduledCheckOut" TEXT,
    "actualCheckIn" TIMESTAMP(3),
    "actualCheckOut" TIMESTAMP(3),
    "totalMinutes" INTEGER,
    "lateMinutes" INTEGER,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'MISSING_CHECK_IN',
    "discordCheckInSynced" BOOLEAN NOT NULL DEFAULT false,
    "discordCheckOutSynced" BOOLEAN NOT NULL DEFAULT false,
    "discordCheckInError" TEXT,
    "discordCheckOutError" TEXT,
    "editedBy" TEXT,
    "editedAt" TIMESTAMP(3),
    "editReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "clientId" TEXT,
    "unitId" TEXT,
    "reportedById" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSettings_teamId_key" ON "TeamSettings"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "Client_teamId_idx" ON "Client"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Task_teamId_date_idx" ON "Task"("teamId", "date");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- CreateIndex
CREATE INDEX "Task_assignedUserId_idx" ON "Task"("assignedUserId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_isRecurringTemplate_idx" ON "Task"("isRecurringTemplate");

-- CreateIndex
CREATE INDEX "Property_clientId_idx" ON "Property"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_clientId_internalCode_key" ON "Property"("clientId", "internalCode");

-- CreateIndex
CREATE INDEX "PropertyKnowledgeItem_clientId_idx" ON "PropertyKnowledgeItem"("clientId");

-- CreateIndex
CREATE INDEX "PropertyKnowledgeItem_clientId_status_idx" ON "PropertyKnowledgeItem"("clientId", "status");

-- CreateIndex
CREATE INDEX "PropertyKnowledgeItem_clientId_createdAt_idx" ON "PropertyKnowledgeItem"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyKnowledgeItem_clientId_airbnbUrl_key" ON "PropertyKnowledgeItem"("clientId", "airbnbUrl");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_parentUnitId_idx" ON "Unit"("parentUnitId");

-- CreateIndex
CREATE INDEX "Tenancy_unitId_idx" ON "Tenancy"("unitId");

-- CreateIndex
CREATE INDEX "Tenancy_status_idx" ON "Tenancy"("status");

-- CreateIndex
CREATE INDEX "Lead_clientId_idx" ON "Lead"("clientId");

-- CreateIndex
CREATE INDEX "Lead_interestedUnitId_idx" ON "Lead"("interestedUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftType_teamId_name_key" ON "ShiftType"("teamId", "name");

-- CreateIndex
CREATE INDEX "ShiftAssignment_date_idx" ON "ShiftAssignment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_userId_date_key" ON "ShiftAssignment"("userId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_userId_date_key" ON "AttendanceRecord"("userId", "date");

-- CreateIndex
CREATE INDEX "Issue_teamId_idx" ON "Issue"("teamId");

-- CreateIndex
CREATE INDEX "Issue_clientId_idx" ON "Issue"("clientId");

-- CreateIndex
CREATE INDEX "Issue_unitId_idx" ON "Issue"("unitId");

-- AddForeignKey
ALTER TABLE "TeamSettings" ADD CONSTRAINT "TeamSettings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultShiftTypeId_fkey" FOREIGN KEY ("defaultShiftTypeId") REFERENCES "ShiftType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyKnowledgeItem" ADD CONSTRAINT "PropertyKnowledgeItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_parentUnitId_fkey" FOREIGN KEY ("parentUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestedUnitId_fkey" FOREIGN KEY ("interestedUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftType" ADD CONSTRAINT "ShiftType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

