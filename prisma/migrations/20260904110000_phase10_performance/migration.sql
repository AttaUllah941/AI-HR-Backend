-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "GoalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "FeedbackType" AS ENUM ('PEER', 'MANAGER', 'SELF', 'UPWARD', 'GENERAL');
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "performance_goals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_kpis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "targetDefault" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "performance_kpis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_kpis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "targetValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_kpis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_cycles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "cycleId" TEXT,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "selfRating" DOUBLE PRECISION,
    "managerRating" DOUBLE PRECISION,
    "overallRating" DOUBLE PRECISION,
    "selfComments" TEXT,
    "managerComments" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance_feedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromEmployeeId" TEXT NOT NULL,
    "toEmployeeId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL DEFAULT 'GENERAL',
    "rating" DOUBLE PRECISION,
    "content" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "performance_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "proposedDesignationId" TEXT,
    "proposedTitle" TEXT,
    "reason" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "promotion_requests_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "performance_goals_companyId_status_idx" ON "performance_goals"("companyId", "status");
CREATE INDEX "performance_goals_employeeId_idx" ON "performance_goals"("employeeId");
CREATE INDEX "performance_goals_deletedAt_idx" ON "performance_goals"("deletedAt");

CREATE UNIQUE INDEX "performance_kpis_companyId_code_key" ON "performance_kpis"("companyId", "code");
CREATE INDEX "performance_kpis_companyId_idx" ON "performance_kpis"("companyId");
CREATE INDEX "performance_kpis_deletedAt_idx" ON "performance_kpis"("deletedAt");

CREATE UNIQUE INDEX "employee_kpis_employeeId_kpiId_year_quarter_key" ON "employee_kpis"("employeeId", "kpiId", "year", "quarter");
CREATE INDEX "employee_kpis_companyId_year_idx" ON "employee_kpis"("companyId", "year");
CREATE INDEX "employee_kpis_employeeId_idx" ON "employee_kpis"("employeeId");

CREATE INDEX "review_cycles_companyId_year_idx" ON "review_cycles"("companyId", "year");
CREATE INDEX "review_cycles_status_idx" ON "review_cycles"("status");
CREATE INDEX "review_cycles_deletedAt_idx" ON "review_cycles"("deletedAt");

CREATE INDEX "performance_reviews_companyId_status_idx" ON "performance_reviews"("companyId", "status");
CREATE INDEX "performance_reviews_employeeId_idx" ON "performance_reviews"("employeeId");
CREATE INDEX "performance_reviews_reviewerId_idx" ON "performance_reviews"("reviewerId");
CREATE INDEX "performance_reviews_cycleId_idx" ON "performance_reviews"("cycleId");
CREATE INDEX "performance_reviews_deletedAt_idx" ON "performance_reviews"("deletedAt");

CREATE INDEX "performance_feedback_companyId_idx" ON "performance_feedback"("companyId");
CREATE INDEX "performance_feedback_fromEmployeeId_idx" ON "performance_feedback"("fromEmployeeId");
CREATE INDEX "performance_feedback_toEmployeeId_idx" ON "performance_feedback"("toEmployeeId");
CREATE INDEX "performance_feedback_reviewId_idx" ON "performance_feedback"("reviewId");
CREATE INDEX "performance_feedback_deletedAt_idx" ON "performance_feedback"("deletedAt");

CREATE INDEX "promotion_requests_companyId_status_idx" ON "promotion_requests"("companyId", "status");
CREATE INDEX "promotion_requests_employeeId_idx" ON "promotion_requests"("employeeId");
CREATE INDEX "promotion_requests_proposedDesignationId_idx" ON "promotion_requests"("proposedDesignationId");
CREATE INDEX "promotion_requests_deletedAt_idx" ON "promotion_requests"("deletedAt");

-- FKs
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "performance_kpis" ADD CONSTRAINT "performance_kpis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_kpis" ADD CONSTRAINT "employee_kpis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_kpis" ADD CONSTRAINT "employee_kpis_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_kpis" ADD CONSTRAINT "employee_kpis_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "performance_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance_feedback" ADD CONSTRAINT "performance_feedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_feedback" ADD CONSTRAINT "performance_feedback_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_feedback" ADD CONSTRAINT "performance_feedback_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_feedback" ADD CONSTRAINT "performance_feedback_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "promotion_requests" ADD CONSTRAINT "promotion_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_requests" ADD CONSTRAINT "promotion_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotion_requests" ADD CONSTRAINT "promotion_requests_proposedDesignationId_fkey" FOREIGN KEY ("proposedDesignationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
