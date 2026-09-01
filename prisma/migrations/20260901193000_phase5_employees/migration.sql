-- Phase 5: Employee management entities

CREATE TYPE "EmployeeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_LEAVE', 'PROBATION', 'NOTICE_PERIOD', 'TERMINATED', 'RESIGNED', 'INACTIVE');
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT');
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "personalEmail" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "nationality" TEXT,
    "maritalStatus" TEXT,
    "avatarUrl" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "branchId" TEXT,
    "departmentId" TEXT,
    "teamId" TEXT,
    "designationId" TEXT,
    "managerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'DRAFT',
    "joinDate" TIMESTAMP(3),
    "probationEndDate" TIMESTAMP(3),
    "confirmationDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "workLocation" TEXT,
    "bio" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_emergency_contacts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_education" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_education_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_experience" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_experience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_skills" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT,
    "years" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_certifications" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "credentialId" TEXT,
    "issuedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_certifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");
CREATE UNIQUE INDEX "employees_companyId_employeeCode_key" ON "employees"("companyId", "employeeCode");
CREATE UNIQUE INDEX "employees_companyId_email_key" ON "employees"("companyId", "email");
CREATE INDEX "employees_companyId_status_idx" ON "employees"("companyId", "status");
CREATE INDEX "employees_branchId_idx" ON "employees"("branchId");
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");
CREATE INDEX "employees_teamId_idx" ON "employees"("teamId");
CREATE INDEX "employees_designationId_idx" ON "employees"("designationId");
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");
CREATE INDEX "employees_deletedAt_idx" ON "employees"("deletedAt");

CREATE INDEX "employee_emergency_contacts_employeeId_idx" ON "employee_emergency_contacts"("employeeId");
CREATE INDEX "employee_education_employeeId_idx" ON "employee_education"("employeeId");
CREATE INDEX "employee_experience_employeeId_idx" ON "employee_experience"("employeeId");
CREATE UNIQUE INDEX "employee_skills_employeeId_name_key" ON "employee_skills"("employeeId", "name");
CREATE INDEX "employee_skills_employeeId_idx" ON "employee_skills"("employeeId");
CREATE INDEX "employee_certifications_employeeId_idx" ON "employee_certifications"("employeeId");
CREATE INDEX "employee_documents_employeeId_idx" ON "employee_documents"("employeeId");

ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_emergency_contacts" ADD CONSTRAINT "employee_emergency_contacts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_experience" ADD CONSTRAINT "employee_experience_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_certifications" ADD CONSTRAINT "employee_certifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
