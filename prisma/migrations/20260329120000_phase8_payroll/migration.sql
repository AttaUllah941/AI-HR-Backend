-- Phase 8: Payroll

DO $$ BEGIN
  CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'READY', 'PROCESSING', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "status" "PayrollRunStatus" NOT NULL DEFAULT 'READY',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "employeeCount" INTEGER NOT NULL DEFAULT 0,
  "totalBase" INTEGER NOT NULL DEFAULT 0,
  "totalBonus" INTEGER NOT NULL DEFAULT 0,
  "totalDeductions" INTEGER NOT NULL DEFAULT 0,
  "totalNet" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_runs_companyId_year_month_key"
  ON "payroll_runs"("companyId", "year", "month");
CREATE INDEX IF NOT EXISTS "payroll_runs_companyId_idx" ON "payroll_runs"("companyId");
CREATE INDEX IF NOT EXISTS "payroll_runs_status_idx" ON "payroll_runs"("status");
CREATE INDEX IF NOT EXISTS "payroll_runs_deletedAt_idx" ON "payroll_runs"("deletedAt");

CREATE TABLE IF NOT EXISTS "payroll_entries" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payrollRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "baseSalary" INTEGER NOT NULL,
  "bonus" INTEGER NOT NULL DEFAULT 0,
  "deductions" INTEGER NOT NULL DEFAULT 0,
  "netPay" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_entries_payrollRunId_employeeId_key"
  ON "payroll_entries"("payrollRunId", "employeeId");
CREATE INDEX IF NOT EXISTS "payroll_entries_companyId_idx" ON "payroll_entries"("companyId");
CREATE INDEX IF NOT EXISTS "payroll_entries_employeeId_idx" ON "payroll_entries"("employeeId");
CREATE INDEX IF NOT EXISTS "payroll_entries_deletedAt_idx" ON "payroll_entries"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_runs_companyId_fkey') THEN
    ALTER TABLE "payroll_runs"
      ADD CONSTRAINT "payroll_runs_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_entries_companyId_fkey') THEN
    ALTER TABLE "payroll_entries"
      ADD CONSTRAINT "payroll_entries_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_entries_payrollRunId_fkey') THEN
    ALTER TABLE "payroll_entries"
      ADD CONSTRAINT "payroll_entries_payrollRunId_fkey"
      FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_entries_employeeId_fkey') THEN
    ALTER TABLE "payroll_entries"
      ADD CONSTRAINT "payroll_entries_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
