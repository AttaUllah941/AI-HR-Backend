-- Phase 19 follow-up: leave report date-range index + payroll entry run aggregates

CREATE INDEX IF NOT EXISTS "leave_requests_companyId_startDate_idx" ON "leave_requests"("companyId", "startDate");

CREATE INDEX IF NOT EXISTS "payroll_entries_payrollRunId_idx" ON "payroll_entries"("payrollRunId");
