-- CreateEnum
CREATE TYPE "GoogleSheetStatus" AS ENUM ('NOT_CONNECTED', 'CREATING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "KnowledgeColumnType" AS ENUM ('SYSTEM', 'CUSTOM');

-- AlterTable
ALTER TABLE "PropertyKnowledgeItem" ADD COLUMN     "googleSheetSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientGoogleSheet" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "spreadsheetUrl" TEXT,
    "status" "GoogleSheetStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientGoogleSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeColumn" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "columnType" "KnowledgeColumnType" NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSyncLog" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientGoogleSheet_clientId_key" ON "ClientGoogleSheet"("clientId");

-- CreateIndex
CREATE INDEX "KnowledgeColumn_clientId_idx" ON "KnowledgeColumn"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeColumn_clientId_columnName_key" ON "KnowledgeColumn"("clientId", "columnName");

-- CreateIndex
CREATE INDEX "KnowledgeSyncLog_clientId_createdAt_idx" ON "KnowledgeSyncLog"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeSyncLog_propertyId_idx" ON "KnowledgeSyncLog"("propertyId");

-- AddForeignKey
ALTER TABLE "ClientGoogleSheet" ADD CONSTRAINT "ClientGoogleSheet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeColumn" ADD CONSTRAINT "KnowledgeColumn_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSyncLog" ADD CONSTRAINT "KnowledgeSyncLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSyncLog" ADD CONSTRAINT "KnowledgeSyncLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PropertyKnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

