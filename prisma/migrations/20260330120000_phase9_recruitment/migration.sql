-- Phase 9: Recruitment

DO $$ BEGIN
  CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FILLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CandidateStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "job_openings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "departmentId" TEXT,
  "title" TEXT NOT NULL,
  "locationLabel" TEXT,
  "description" TEXT,
  "status" "JobOpeningStatus" NOT NULL DEFAULT 'OPEN',
  "openingsCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "job_openings_companyId_status_idx" ON "job_openings"("companyId", "status");
CREATE INDEX IF NOT EXISTS "job_openings_departmentId_idx" ON "job_openings"("departmentId");
CREATE INDEX IF NOT EXISTS "job_openings_deletedAt_idx" ON "job_openings"("deletedAt");

CREATE TABLE IF NOT EXISTS "candidates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "jobOpeningId" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "locationLabel" TEXT,
  "stage" "CandidateStage" NOT NULL DEFAULT 'APPLIED',
  "score" INTEGER,
  "notes" TEXT,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "candidates_companyId_stage_idx" ON "candidates"("companyId", "stage");
CREATE INDEX IF NOT EXISTS "candidates_jobOpeningId_idx" ON "candidates"("jobOpeningId");
CREATE INDEX IF NOT EXISTS "candidates_email_idx" ON "candidates"("email");
CREATE INDEX IF NOT EXISTS "candidates_deletedAt_idx" ON "candidates"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_openings_companyId_fkey') THEN
    ALTER TABLE "job_openings"
      ADD CONSTRAINT "job_openings_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_openings_departmentId_fkey') THEN
    ALTER TABLE "job_openings"
      ADD CONSTRAINT "job_openings_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_companyId_fkey') THEN
    ALTER TABLE "candidates"
      ADD CONSTRAINT "candidates_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_jobOpeningId_fkey') THEN
    ALTER TABLE "candidates"
      ADD CONSTRAINT "candidates_jobOpeningId_fkey"
      FOREIGN KEY ("jobOpeningId") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
