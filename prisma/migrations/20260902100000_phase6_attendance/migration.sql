-- Phase 6: Attendance management entities

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND', 'REMOTE', 'EARLY_LEAVE');
CREATE TYPE "AttendanceSource" AS ENUM ('CLOCK', 'MANUAL', 'SYSTEM');
CREATE TYPE "OvertimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
    "workMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shifts_companyId_code_key" ON "shifts"("companyId", "code");
CREATE INDEX "shifts_companyId_idx" ON "shifts"("companyId");
CREATE INDEX "shifts_deletedAt_idx" ON "shifts"("deletedAt");

CREATE UNIQUE INDEX "holidays_companyId_date_key" ON "holidays"("companyId", "date");
CREATE INDEX "holidays_companyId_idx" ON "holidays"("companyId");
CREATE INDEX "holidays_deletedAt_idx" ON "holidays"("deletedAt");

CREATE UNIQUE INDEX "attendance_records_companyId_employeeId_date_key" ON "attendance_records"("companyId", "employeeId", "date");
CREATE INDEX "attendance_records_companyId_date_idx" ON "attendance_records"("companyId", "date");
CREATE INDEX "attendance_records_employeeId_date_idx" ON "attendance_records"("employeeId", "date");
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");
CREATE INDEX "attendance_records_deletedAt_idx" ON "attendance_records"("deletedAt");

CREATE INDEX "overtime_requests_companyId_status_idx" ON "overtime_requests"("companyId", "status");
CREATE INDEX "overtime_requests_employeeId_date_idx" ON "overtime_requests"("employeeId", "date");
CREATE INDEX "overtime_requests_deletedAt_idx" ON "overtime_requests"("deletedAt");

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
