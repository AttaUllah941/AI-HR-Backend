-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('GENERAL', 'EMPLOYEE_DOCUMENT', 'RESUME', 'AVATAR', 'POLICY', 'OTHER');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "category" "FileCategory" NOT NULL DEFAULT 'GENERAL',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "title" TEXT,
    "description" TEXT,
    "employeeId" TEXT,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_files_companyId_category_idx" ON "stored_files"("companyId", "category");

-- CreateIndex
CREATE INDEX "stored_files_employeeId_idx" ON "stored_files"("employeeId");

-- CreateIndex
CREATE INDEX "stored_files_candidateId_idx" ON "stored_files"("candidateId");

-- CreateIndex
CREATE INDEX "stored_files_uploadedById_idx" ON "stored_files"("uploadedById");

-- CreateIndex
CREATE INDEX "stored_files_deletedAt_idx" ON "stored_files"("deletedAt");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Candidate FK is optional for degraded local DBs; apply when candidates heap is healthy.
-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
