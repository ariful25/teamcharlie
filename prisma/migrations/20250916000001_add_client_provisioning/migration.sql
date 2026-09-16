-- CreateEnum
CREATE TYPE "ClientWorkspaceTemplate" AS ENUM ('STANDARD', 'PERFECT_STAY_LTR');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GUESTY', 'AIRBNB', 'CLICKUP', 'WHATSAPP', 'ENSO', 'HOSTBUDDY', 'GOOGLE_DRIVE', 'GOOGLE_SHEETS', 'NOTION', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONNECTED', 'NEEDS_AUTHORIZATION', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ClientFileCategory" AS ENUM ('SOP', 'PROPERTIES', 'INVOICES', 'KNOWLEDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientFileSource" AS ENUM ('UPLOAD', 'GOOGLE_DRIVE', 'URL', 'GENERATED', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "workspaceTemplate" "ClientWorkspaceTemplate" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "ClientIntegration" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "note" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientFile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ClientFileCategory" NOT NULL DEFAULT 'OTHER',
    "source" "ClientFileSource" NOT NULL,
    "url" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientIntegration_clientId_idx" ON "ClientIntegration"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientIntegration_clientId_provider_key" ON "ClientIntegration"("clientId", "provider");

-- CreateIndex
CREATE INDEX "ClientFile_clientId_idx" ON "ClientFile"("clientId");

-- CreateIndex
CREATE INDEX "ClientFile_clientId_category_idx" ON "ClientFile"("clientId", "category");

-- AddForeignKey
ALTER TABLE "ClientIntegration" ADD CONSTRAINT "ClientIntegration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

