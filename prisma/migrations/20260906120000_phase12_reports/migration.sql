-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('OVERVIEW', 'ATTENDANCE', 'LEAVE', 'PAYROLL', 'RECRUITMENT', 'PERFORMANCE', 'EMPLOYEES');

-- CreateEnum
CREATE TYPE "ReportExportFormat" AS ENUM ('CSV', 'PDF', 'JSON');

-- CreateTable
CREATE TABLE "report_export_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "reportType" "ReportType" NOT NULL,
    "format" "ReportExportFormat" NOT NULL,
    "filters" JSONB,
    "rowCount" INTEGER,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_export_logs_companyId_createdAt_idx" ON "report_export_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "report_export_logs_userId_idx" ON "report_export_logs"("userId");

-- CreateIndex
CREATE INDEX "report_export_logs_reportType_idx" ON "report_export_logs"("reportType");

-- AddForeignKey
ALTER TABLE "report_export_logs" ADD CONSTRAINT "report_export_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_export_logs" ADD CONSTRAINT "report_export_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
