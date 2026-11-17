-- Performance indexes backed by real query patterns (see docs/audit/AUDIT.md, section B1).
--
-- Safety notes
--   * Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE), so the migration can be
--     re-run, or the indexes can be pre-built with CREATE INDEX CONCURRENTLY on a large production
--     table before deploying (the statements below then become no-ops).
--   * Prisma runs this file in one transaction, so plain CREATE INDEX takes a short write lock per
--     table. On very large tables, create the index CONCURRENTLY by hand first (see above).
--   * Rollback (not run automatically):
--       DROP TRIGGER IF EXISTS audit_logs_set_company ON "audit_logs";
--       DROP FUNCTION IF EXISTS audit_logs_set_company();
--       DROP INDEX IF EXISTS <each index named below>;
--       ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "companyId";

-- ---------------------------------------------------------------------------------------------
-- 1. audit_logs: tenant key + (companyId, createdAt)
--
-- Audit lists (settings audit page, dashboard activity) were filtered through
-- `actor.companyId` and sorted by createdAt desc. Measured on 600k rows:
--   * small tenant, newest 50:      68 ms (walks the global createdAt index, filtering by user)
--   * big tenant, count(*) for the page total: 94 ms
-- A (companyId, createdAt) index serves both the filter and the sort.
-- The column is filled for new rows by a trigger (so none of the ten audit writers has to change)
-- and backfilled here for existing rows. Rows without an actor stay NULL (not tenant-attributable,
-- same as before).
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

UPDATE "audit_logs" a
SET "companyId" = u."companyId"
FROM "users" u
WHERE a."actorId" = u.id AND a."companyId" IS NULL AND u."companyId" IS NOT NULL;

CREATE OR REPLACE FUNCTION audit_logs_set_company() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS NULL AND NEW."actorId" IS NOT NULL THEN
    SELECT "companyId" INTO NEW."companyId" FROM "users" WHERE id = NEW."actorId";
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_set_company ON "audit_logs";
CREATE TRIGGER audit_logs_set_company
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_set_company();

CREATE INDEX IF NOT EXISTS "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- ---------------------------------------------------------------------------------------------
-- 2. employees(companyId, joinDate)
-- The headcount trend runs 12 range counts on joinDate per report/dashboard request
-- (reports.repository.ts, dashboard.repository.ts). Measured on 20k employees: 4.0 ms (seq scan)
-- -> 0.24 ms (bitmap index scan), and the gap grows with headcount.
CREATE INDEX IF NOT EXISTS "employees_companyId_joinDate_idx" ON "employees"("companyId", "joinDate");

-- ---------------------------------------------------------------------------------------------
-- 3. stored_files(companyId, createdAt)
-- The file list is `WHERE companyId ORDER BY createdAt DESC` (files.repository.ts); the existing
-- (companyId, updatedAt) index only helps the global-search query, so the list had to sort.
-- Measured on 60k files, newest 20: 11.5 ms (sort) -> 0.02 ms (backward index scan).
CREATE INDEX IF NOT EXISTS "stored_files_companyId_createdAt_idx" ON "stored_files"("companyId", "createdAt");

-- ---------------------------------------------------------------------------------------------
-- 4. ai_generations(companyId, createdAt)
-- Generation history and "latest insight" lookups are ordered by createdAt desc per company
-- (ai.repository.ts); only (companyId, feature) / (companyId, status) existed.
-- Measured on 40k rows, newest 20: 6.4 ms (sort) -> 0.01 ms.
CREATE INDEX IF NOT EXISTS "ai_generations_companyId_createdAt_idx" ON "ai_generations"("companyId", "createdAt");

-- ---------------------------------------------------------------------------------------------
-- Candidates evaluated and NOT added (no measurable benefit with the existing indexes):
--   * notifications(userId, readAt, createdAt): the existing (companyId, userId, status) index
--     already answers the unread count in ~0.1 ms for a realistic user.
--   * employees(companyId, departmentId): headcount-by-department reads every row of the tenant
--     anyway; the planner keeps choosing a sequential scan (3.7 ms vs 3.8 ms).
--   * sessions(userId, status), payslips(employeeId, year, month),
--     salary_structures(companyId, isActive, effectiveFrom): each user/employee/company has few
--     rows here, so the existing single-column / two-column indexes are sufficient.
--   * AttendanceRecord(employeeId, date), LeaveRequest(companyId, status), Employee(companyId,
--     status), LoginAttempt(email, createdAt), PayrollEntry(payrollRunId): already exist.
