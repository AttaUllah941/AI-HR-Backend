-- Phase 7: Leave management

DO $$ BEGIN
  CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'PERSONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "leave_policies" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "leaveType" "LeaveType" NOT NULL,
  "allottedDays" INTEGER NOT NULL,
  "usedDays" INTEGER NOT NULL DEFAULT 0,
  "year" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "leave_policies_companyId_leaveType_year_key"
  ON "leave_policies"("companyId", "leaveType", "year");
CREATE INDEX IF NOT EXISTS "leave_policies_companyId_idx" ON "leave_policies"("companyId");
CREATE INDEX IF NOT EXISTS "leave_policies_deletedAt_idx" ON "leave_policies"("deletedAt");

CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leaveType" "LeaveType" NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "dayCount" INTEGER NOT NULL,
  "reason" TEXT,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leave_requests_companyId_status_idx" ON "leave_requests"("companyId", "status");
CREATE INDEX IF NOT EXISTS "leave_requests_employeeId_idx" ON "leave_requests"("employeeId");
CREATE INDEX IF NOT EXISTS "leave_requests_startDate_endDate_idx" ON "leave_requests"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "leave_requests_deletedAt_idx" ON "leave_requests"("deletedAt");

CREATE TABLE IF NOT EXISTS "company_holidays" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "holidayDate" DATE NOT NULL,
  "regionLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_holidays_companyId_holidayDate_name_key"
  ON "company_holidays"("companyId", "holidayDate", "name");
CREATE INDEX IF NOT EXISTS "company_holidays_companyId_holidayDate_idx"
  ON "company_holidays"("companyId", "holidayDate");
CREATE INDEX IF NOT EXISTS "company_holidays_deletedAt_idx" ON "company_holidays"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_policies_companyId_fkey') THEN
    ALTER TABLE "leave_policies"
      ADD CONSTRAINT "leave_policies_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_companyId_fkey') THEN
    ALTER TABLE "leave_requests"
      ADD CONSTRAINT "leave_requests_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_employeeId_fkey') THEN
    ALTER TABLE "leave_requests"
      ADD CONSTRAINT "leave_requests_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_reviewedById_fkey') THEN
    ALTER TABLE "leave_requests"
      ADD CONSTRAINT "leave_requests_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_holidays_companyId_fkey') THEN
    ALTER TABLE "company_holidays"
      ADD CONSTRAINT "company_holidays_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
