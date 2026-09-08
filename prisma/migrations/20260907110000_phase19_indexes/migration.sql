-- Phase 19: query optimization indexes for hot list/filter/sort paths

CREATE INDEX IF NOT EXISTS "companies_deletedAt_isActive_idx" ON "companies"("deletedAt", "isActive");

CREATE INDEX IF NOT EXISTS "users_createdAt_idx" ON "users"("createdAt");
CREATE INDEX IF NOT EXISTS "users_companyId_status_idx" ON "users"("companyId", "status");
CREATE INDEX IF NOT EXISTS "users_companyId_mfaEnabled_idx" ON "users"("companyId", "mfaEnabled");

CREATE INDEX IF NOT EXISTS "sessions_status_expiresAt_idx" ON "sessions"("status", "expiresAt");

CREATE INDEX IF NOT EXISTS "audit_logs_entityId_idx" ON "audit_logs"("entityId");

CREATE INDEX IF NOT EXISTS "employees_companyId_createdAt_idx" ON "employees"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "employees_companyId_deletedAt_idx" ON "employees"("companyId", "deletedAt");

CREATE INDEX IF NOT EXISTS "employee_documents_employeeId_deletedAt_idx" ON "employee_documents"("employeeId", "deletedAt");

CREATE INDEX IF NOT EXISTS "leave_balances_leaveTypeId_idx" ON "leave_balances"("leaveTypeId");

CREATE INDEX IF NOT EXISTS "candidates_companyId_updatedAt_idx" ON "candidates"("companyId", "updatedAt");

CREATE INDEX IF NOT EXISTS "job_applications_jobOpeningId_status_idx" ON "job_applications"("jobOpeningId", "status");

CREATE INDEX IF NOT EXISTS "ai_generations_companyId_status_idx" ON "ai_generations"("companyId", "status");

CREATE INDEX IF NOT EXISTS "stored_files_companyId_updatedAt_idx" ON "stored_files"("companyId", "updatedAt");

CREATE INDEX IF NOT EXISTS "login_attempts_companyId_success_createdAt_idx" ON "login_attempts"("companyId", "success", "createdAt");
