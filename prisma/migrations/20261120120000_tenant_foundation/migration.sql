-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "loginMessage" TEXT,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "subscriptionPlan" TEXT NOT NULL DEFAULT 'STARTER',
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "noticePeriodDays" INTEGER;

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DOUBLE PRECISION,
    "assignedEmployeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'COMPANY',
    "departmentId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_companyId_status_idx" ON "assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "assets_assignedEmployeeId_idx" ON "assets"("assignedEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_companyId_assetCode_key" ON "assets"("companyId", "assetCode");

-- CreateIndex
CREATE INDEX "announcements_companyId_publishedAt_idx" ON "announcements"("companyId", "publishedAt");

-- CreateIndex
CREATE INDEX "announcements_departmentId_idx" ON "announcements"("departmentId");

-- CreateIndex
-- Backfill slugs for companies that existed before multi-tenant login (name-based, de-duplicated by id suffix).
UPDATE "companies" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')) WHERE "slug" IS NULL;
UPDATE "companies" SET "slug" = "slug" || '-' || substr("id", 1, 6)
 WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "createdAt") rn FROM "companies") t WHERE rn > 1);
UPDATE "companies" SET "slug" = 'company-' || substr("id", 1, 8) WHERE "slug" IS NULL OR "slug" = '';
ALTER TABLE "companies" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

