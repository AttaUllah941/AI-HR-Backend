-- Phase 10: Performance

DO $$ BEGIN
  CREATE TYPE "PerformanceCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoalStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BEHIND', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "performance_cycles" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "quarter" INTEGER NOT NULL,
  "status" "PerformanceCycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "previousAvgScore" DOUBLE PRECISION,
  "previousGoalsOnTrackPercent" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "performance_cycles_companyId_year_quarter_key"
  ON "performance_cycles"("companyId", "year", "quarter");
CREATE INDEX IF NOT EXISTS "performance_cycles_companyId_status_idx"
  ON "performance_cycles"("companyId", "status");
CREATE INDEX IF NOT EXISTS "performance_cycles_deletedAt_idx" ON "performance_cycles"("deletedAt");

CREATE TABLE IF NOT EXISTS "performance_reviews" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "goalCount" INTEGER NOT NULL DEFAULT 0,
  "goalsCompletePercent" INTEGER NOT NULL DEFAULT 0,
  "promotionReady" BOOLEAN NOT NULL DEFAULT false,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "performance_reviews_cycleId_employeeId_key"
  ON "performance_reviews"("cycleId", "employeeId");
CREATE INDEX IF NOT EXISTS "performance_reviews_companyId_idx" ON "performance_reviews"("companyId");
CREATE INDEX IF NOT EXISTS "performance_reviews_employeeId_idx" ON "performance_reviews"("employeeId");
CREATE INDEX IF NOT EXISTS "performance_reviews_score_idx" ON "performance_reviews"("score");
CREATE INDEX IF NOT EXISTS "performance_reviews_deletedAt_idx" ON "performance_reviews"("deletedAt");

CREATE TABLE IF NOT EXISTS "performance_goals" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "status" "GoalStatus" NOT NULL DEFAULT 'ON_TRACK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "performance_goals_companyId_status_idx"
  ON "performance_goals"("companyId", "status");
CREATE INDEX IF NOT EXISTS "performance_goals_cycleId_idx" ON "performance_goals"("cycleId");
CREATE INDEX IF NOT EXISTS "performance_goals_employeeId_idx" ON "performance_goals"("employeeId");
CREATE INDEX IF NOT EXISTS "performance_goals_deletedAt_idx" ON "performance_goals"("deletedAt");

CREATE TABLE IF NOT EXISTS "performance_insights" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "cycleId" TEXT,
  "body" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "performance_insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "performance_insights_companyId_sortOrder_idx"
  ON "performance_insights"("companyId", "sortOrder");
CREATE INDEX IF NOT EXISTS "performance_insights_cycleId_idx" ON "performance_insights"("cycleId");
CREATE INDEX IF NOT EXISTS "performance_insights_deletedAt_idx" ON "performance_insights"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_cycles_companyId_fkey') THEN
    ALTER TABLE "performance_cycles"
      ADD CONSTRAINT "performance_cycles_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_reviews_companyId_fkey') THEN
    ALTER TABLE "performance_reviews"
      ADD CONSTRAINT "performance_reviews_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_reviews_cycleId_fkey') THEN
    ALTER TABLE "performance_reviews"
      ADD CONSTRAINT "performance_reviews_cycleId_fkey"
      FOREIGN KEY ("cycleId") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_reviews_employeeId_fkey') THEN
    ALTER TABLE "performance_reviews"
      ADD CONSTRAINT "performance_reviews_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_goals_companyId_fkey') THEN
    ALTER TABLE "performance_goals"
      ADD CONSTRAINT "performance_goals_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_goals_cycleId_fkey') THEN
    ALTER TABLE "performance_goals"
      ADD CONSTRAINT "performance_goals_cycleId_fkey"
      FOREIGN KEY ("cycleId") REFERENCES "performance_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_goals_employeeId_fkey') THEN
    ALTER TABLE "performance_goals"
      ADD CONSTRAINT "performance_goals_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_insights_companyId_fkey') THEN
    ALTER TABLE "performance_insights"
      ADD CONSTRAINT "performance_insights_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_insights_cycleId_fkey') THEN
    ALTER TABLE "performance_insights"
      ADD CONSTRAINT "performance_insights_cycleId_fkey"
      FOREIGN KEY ("cycleId") REFERENCES "performance_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
