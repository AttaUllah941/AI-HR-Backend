import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import {
  PayrollRepository,
  type PayrollEntryWithEmployee,
} from '../repositories/payroll.repository.js';
import type {
  CreatePayrollEntryInput,
  PayrollListQuery,
  PayrollPeriodQuery,
  RunPayrollInput,
  UpdatePayrollEntryInput,
} from '../validators/payroll.validators.js';

function toEntryDto(record: PayrollEntryWithEmployee) {
  return {
    id: record.id,
    companyId: record.companyId,
    payrollRunId: record.payrollRunId,
    employeeId: record.employeeId,
    baseSalary: record.baseSalary,
    bonus: record.bonus,
    deductions: record.deductions,
    netPay: record.netPay,
    notes: record.notes,
    employee: {
      id: record.employee.id,
      firstName: record.employee.firstName,
      lastName: record.employee.lastName,
      email: record.employee.email,
      position: record.employee.position,
      initials: `${record.employee.firstName.charAt(0)}${record.employee.lastName.charAt(0)}`.toUpperCase(),
      department: record.employee.department
        ? { id: record.employee.department.id, name: record.employee.department.name }
        : null,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toRunDto(run: {
  id: string;
  companyId: string;
  year: number;
  month: number;
  status: string;
  currency: string;
  employeeCount: number;
  totalBase: number;
  totalBonus: number;
  totalDeductions: number;
  totalNet: number;
  processedAt: Date | null;
}) {
  const label = new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return {
    id: run.id,
    companyId: run.companyId,
    year: run.year,
    month: run.month,
    label: `${label} Payroll`,
    status: run.status,
    currency: run.currency,
    employeeCount: run.employeeCount,
    totalBase: run.totalBase,
    totalBonus: run.totalBonus,
    totalDeductions: run.totalDeductions,
    totalNet: run.totalNet,
    processedAt: run.processedAt,
  };
}

function computeNet(baseSalary: number, bonus: number, deductions: number): number {
  return Math.max(0, baseSalary + bonus - deductions);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class PayrollService {
  constructor(private readonly repo = new PayrollRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  private async ensureRun(companyId: string, year: number, month: number) {
    return this.repo.upsertRun({ companyId, year, month });
  }

  async summary(userId: string, query: PayrollPeriodQuery) {
    const companyId = await this.requireCompanyId(userId);
    const run = await this.ensureRun(companyId, query.year, query.month);
    const refreshed = await this.repo.refreshRunTotals(run.id);
    return toRunDto(refreshed);
  }

  async list(userId: string, query: PayrollListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const run = await this.ensureRun(companyId, query.year, query.month);
    const refreshed = await this.repo.refreshRunTotals(run.id);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listEntries(companyId, {
      payrollRunId: run.id,
      search: query.search,
      departmentId: query.departmentId,
      skip,
      take: query.pageSize,
    });

    return {
      run: toRunDto(refreshed),
      items: items.map(toEntryDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async exportCsv(userId: string, query: PayrollListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const run = await this.ensureRun(companyId, query.year, query.month);
    const items = await this.repo.listEntriesForExport(companyId, {
      payrollRunId: run.id,
      search: query.search,
      departmentId: query.departmentId,
    });

    const header = ['Employee', 'Department', 'Base', 'Bonus', 'Deductions', 'Net Pay'];
    const rows = items.map((item) =>
      [
        `${item.employee.firstName} ${item.employee.lastName}`,
        item.employee.department?.name ?? '',
        String(item.baseSalary),
        String(item.bonus),
        String(item.deductions),
        String(item.netPay),
      ]
        .map(csvEscape)
        .join(','),
    );

    return [header.join(','), ...rows].join('\n');
  }

  async createEntry(userId: string, input: CreatePayrollEntryInput) {
    const companyId = await this.requireCompanyId(userId);
    const employee = await this.repo.findEmployee(companyId, input.employeeId);
    if (!employee) {
      throw new ValidationError('Employee not found');
    }

    const run = await this.ensureRun(companyId, input.year, input.month);
    const netPay = computeNet(input.baseSalary, input.bonus, input.deductions);
    const entry = await this.repo.upsertEntry({
      companyId,
      payrollRunId: run.id,
      employeeId: input.employeeId,
      baseSalary: input.baseSalary,
      bonus: input.bonus,
      deductions: input.deductions,
      netPay,
      notes: input.notes,
    });
    await this.repo.refreshRunTotals(run.id);

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'payroll.entry.upsert',
      entityType: 'PayrollEntry',
      entityId: entry.id,
    });

    return toEntryDto(entry);
  }

  async updateEntry(userId: string, id: string, input: UpdatePayrollEntryInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findEntryById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Payroll entry not found');
    }

    const baseSalary = input.baseSalary ?? existing.baseSalary;
    const bonus = input.bonus ?? existing.bonus;
    const deductions = input.deductions ?? existing.deductions;
    const entry = await this.repo.updateEntry(id, {
      baseSalary,
      bonus,
      deductions,
      netPay: computeNet(baseSalary, bonus, deductions),
      notes: input.notes === null ? null : input.notes,
    });
    await this.repo.refreshRunTotals(existing.payrollRunId);

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'payroll.entry.update',
      entityType: 'PayrollEntry',
      entityId: entry.id,
    });

    return toEntryDto(entry);
  }

  async removeEntry(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findEntryById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Payroll entry not found');
    }

    await this.repo.softDeleteEntry(id);
    await this.repo.refreshRunTotals(existing.payrollRunId);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'payroll.entry.delete',
      entityType: 'PayrollEntry',
      entityId: id,
    });

    return { deleted: true };
  }

  async runPayroll(userId: string, input: RunPayrollInput) {
    const companyId = await this.requireCompanyId(userId);
    const run = await this.ensureRun(companyId, input.year, input.month);
    const refreshed = await this.repo.refreshRunTotals(run.id);

    if (refreshed.employeeCount === 0) {
      throw new ValidationError('Cannot run payroll with no salary entries');
    }

    const completed = await this.repo.markRunProcessed(run.id, 'COMPLETED');
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'payroll.run',
      entityType: 'PayrollRun',
      entityId: completed.id,
      metadata: { year: input.year, month: input.month, totalNet: completed.totalNet },
    });

    return toRunDto(completed);
  }
}
