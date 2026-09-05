-- CreateEnum
CREATE TYPE "SalaryComponentKind" AS ENUM ('ALLOWANCE', 'DEDUCTION', 'BONUS', 'TAX');

-- CreateEnum
CREATE TYPE "SalaryCalcType" AS ENUM ('FIXED', 'PERCENT_OF_BASIC');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('GENERATED', 'PAID', 'VOID');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "SalaryComponentKind" NOT NULL,
    "calcType" "SalaryCalcType" NOT NULL DEFAULT 'FIXED',
    "defaultValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankIban" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structure_items" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "standardRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "personalAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "processedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBonuses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entry_lines" (
    "id" TEXT NOT NULL,
    "payrollEntryId" TEXT NOT NULL,
    "componentId" TEXT,
    "kind" "SalaryComponentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "payroll_entry_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollEntryId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "totalAllowances" DOUBLE PRECISION NOT NULL,
    "totalBonuses" DOUBLE PRECISION NOT NULL,
    "totalDeductions" DOUBLE PRECISION NOT NULL,
    "totalTax" DOUBLE PRECISION NOT NULL,
    "grossPay" DOUBLE PRECISION NOT NULL,
    "netPay" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayslipStatus" NOT NULL DEFAULT 'GENERATED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_components_companyId_kind_idx" ON "salary_components"("companyId", "kind");

-- CreateIndex
CREATE INDEX "salary_components_deletedAt_idx" ON "salary_components"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_companyId_code_key" ON "salary_components"("companyId", "code");

-- CreateIndex
CREATE INDEX "salary_structures_companyId_isActive_idx" ON "salary_structures"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "salary_structures_employeeId_idx" ON "salary_structures"("employeeId");

-- CreateIndex
CREATE INDEX "salary_structures_deletedAt_idx" ON "salary_structures"("deletedAt");

-- CreateIndex
CREATE INDEX "salary_structure_items_componentId_idx" ON "salary_structure_items"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structure_items_salaryStructureId_componentId_key" ON "salary_structure_items"("salaryStructureId", "componentId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_settings_companyId_key" ON "tax_settings"("companyId");

-- CreateIndex
CREATE INDEX "payroll_runs_companyId_status_idx" ON "payroll_runs"("companyId", "status");

-- CreateIndex
CREATE INDEX "payroll_runs_deletedAt_idx" ON "payroll_runs"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_companyId_year_month_key" ON "payroll_runs"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_entries_companyId_idx" ON "payroll_entries"("companyId");

-- CreateIndex
CREATE INDEX "payroll_entries_employeeId_idx" ON "payroll_entries"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_payrollRunId_employeeId_key" ON "payroll_entries"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_entry_lines_payrollEntryId_idx" ON "payroll_entry_lines"("payrollEntryId");

-- CreateIndex
CREATE INDEX "payroll_entry_lines_componentId_idx" ON "payroll_entry_lines"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollEntryId_key" ON "payslips"("payrollEntryId");

-- CreateIndex
CREATE INDEX "payslips_companyId_year_month_idx" ON "payslips"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE INDEX "payslips_status_idx" ON "payslips"("status");

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_items" ADD CONSTRAINT "salary_structure_items_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_items" ADD CONSTRAINT "salary_structure_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry_lines" ADD CONSTRAINT "payroll_entry_lines_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entry_lines" ADD CONSTRAINT "payroll_entry_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
