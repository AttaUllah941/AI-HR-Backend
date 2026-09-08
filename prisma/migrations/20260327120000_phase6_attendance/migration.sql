-- Phase 6: Attendance records

DO $$ BEGIN
  CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'REMOTE', 'ON_LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
  "checkInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),
  "locationLabel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_employeeId_workDate_key"
  ON "attendance_records"("employeeId", "workDate");
CREATE INDEX IF NOT EXISTS "attendance_records_companyId_workDate_idx"
  ON "attendance_records"("companyId", "workDate");
CREATE INDEX IF NOT EXISTS "attendance_records_employeeId_idx" ON "attendance_records"("employeeId");
CREATE INDEX IF NOT EXISTS "attendance_records_status_idx" ON "attendance_records"("status");
CREATE INDEX IF NOT EXISTS "attendance_records_deletedAt_idx" ON "attendance_records"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_companyId_fkey') THEN
    ALTER TABLE "attendance_records"
      ADD CONSTRAINT "attendance_records_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_employeeId_fkey') THEN
    ALTER TABLE "attendance_records"
      ADD CONSTRAINT "attendance_records_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
