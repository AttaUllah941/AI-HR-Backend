-- Phase 5: Employee directory

DO $$ BEGIN
  CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'REMOTE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "employees" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT,
  "employeeNumber" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "avatarUrl" TEXT,
  "position" TEXT,
  "departmentId" TEXT,
  "locationId" TEXT,
  "managerId" TEXT,
  "hireDate" TIMESTAMP(3),
  "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employees_userId_key" ON "employees"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_companyId_email_key" ON "employees"("companyId", "email");
CREATE INDEX IF NOT EXISTS "employees_companyId_idx" ON "employees"("companyId");
CREATE INDEX IF NOT EXISTS "employees_departmentId_idx" ON "employees"("departmentId");
CREATE INDEX IF NOT EXISTS "employees_locationId_idx" ON "employees"("locationId");
CREATE INDEX IF NOT EXISTS "employees_managerId_idx" ON "employees"("managerId");
CREATE INDEX IF NOT EXISTS "employees_status_idx" ON "employees"("status");
CREATE INDEX IF NOT EXISTS "employees_hireDate_idx" ON "employees"("hireDate");
CREATE INDEX IF NOT EXISTS "employees_deletedAt_idx" ON "employees"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_companyId_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_userId_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_departmentId_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_locationId_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_managerId_fkey') THEN
    ALTER TABLE "employees"
      ADD CONSTRAINT "employees_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
