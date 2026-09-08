-- Phase 4: Organization management (company profile fields, departments, locations)

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "addressLine1" TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "state" TEXT,
  ADD COLUMN IF NOT EXISTS "country" TEXT,
  ADD COLUMN IF NOT EXISTS "postalCode" TEXT;

CREATE INDEX IF NOT EXISTS "companies_deletedAt_idx" ON "companies"("deletedAt");

CREATE TABLE IF NOT EXISTS "departments" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "parentId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "departments_companyId_name_key" ON "departments"("companyId", "name");
CREATE INDEX IF NOT EXISTS "departments_companyId_idx" ON "departments"("companyId");
CREATE INDEX IF NOT EXISTS "departments_parentId_idx" ON "departments"("parentId");
CREATE INDEX IF NOT EXISTS "departments_deletedAt_idx" ON "departments"("deletedAt");

CREATE TABLE IF NOT EXISTS "locations" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "addressLine1" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "postalCode" TEXT,
  "timezone" TEXT,
  "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "locations_companyId_name_key" ON "locations"("companyId", "name");
CREATE INDEX IF NOT EXISTS "locations_companyId_idx" ON "locations"("companyId");
CREATE INDEX IF NOT EXISTS "locations_deletedAt_idx" ON "locations"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_companyId_fkey'
  ) THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_parentId_fkey'
  ) THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'locations_companyId_fkey'
  ) THEN
    ALTER TABLE "locations"
      ADD CONSTRAINT "locations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
