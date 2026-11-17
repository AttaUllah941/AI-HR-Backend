-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL', 'HR', 'FINAL');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "location" TEXT,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'DRAFT',
    "departmentId" TEXT,
    "designationId" TEXT,
    "branchId" TEXT,
    "hiringManagerId" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "yearsExperience" DOUBLE PRECISION,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "resumeUrl" TEXT,
    "resumeFileName" TEXT,
    "resumeMimeType" TEXT,
    "screeningScore" DOUBLE PRECISION,
    "screeningNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "coverLetter" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'VIDEO',
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "locationOrLink" TEXT,
    "interviewerId" TEXT,
    "feedback" TEXT,
    "rating" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_openings_companyId_status_idx" ON "job_openings"("companyId", "status");
CREATE INDEX "job_openings_departmentId_idx" ON "job_openings"("departmentId");
CREATE INDEX "job_openings_designationId_idx" ON "job_openings"("designationId");
CREATE INDEX "job_openings_branchId_idx" ON "job_openings"("branchId");
CREATE INDEX "job_openings_hiringManagerId_idx" ON "job_openings"("hiringManagerId");
CREATE INDEX "job_openings_deletedAt_idx" ON "job_openings"("deletedAt");
CREATE UNIQUE INDEX "job_openings_companyId_code_key" ON "job_openings"("companyId", "code");

CREATE UNIQUE INDEX "candidates_companyId_email_key" ON "candidates"("companyId", "email");
CREATE INDEX "candidates_companyId_idx" ON "candidates"("companyId");
CREATE INDEX "candidates_deletedAt_idx" ON "candidates"("deletedAt");

CREATE UNIQUE INDEX "job_applications_jobOpeningId_candidateId_key" ON "job_applications"("jobOpeningId", "candidateId");
CREATE INDEX "job_applications_companyId_status_idx" ON "job_applications"("companyId", "status");
CREATE INDEX "job_applications_candidateId_idx" ON "job_applications"("candidateId");
CREATE INDEX "job_applications_deletedAt_idx" ON "job_applications"("deletedAt");

CREATE INDEX "interviews_companyId_status_idx" ON "interviews"("companyId", "status");
CREATE INDEX "interviews_applicationId_idx" ON "interviews"("applicationId");
CREATE INDEX "interviews_interviewerId_idx" ON "interviews"("interviewerId");
CREATE INDEX "interviews_scheduledAt_idx" ON "interviews"("scheduledAt");
CREATE INDEX "interviews_deletedAt_idx" ON "interviews"("deletedAt");

CREATE UNIQUE INDEX "job_offers_applicationId_key" ON "job_offers"("applicationId");
CREATE INDEX "job_offers_companyId_status_idx" ON "job_offers"("companyId", "status");
CREATE INDEX "job_offers_deletedAt_idx" ON "job_offers"("deletedAt");

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
