import type { SalaryComponentKind, SalaryCalcType } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { PayrollRepository } from '../repositories/payroll.repository.js';
import type {
  CreatePayrollRunInput,
  CreateSalaryComponentInput,
  CreateSalaryStructureInput,
  UpdatePayrollRunInput,
  UpdateSalaryComponentInput,
  UpdateSalaryStructureInput,
  UpdateTaxSettingInput,
} from '../validators/payroll.validators.js';

type AuthActor = { id: string; permissions: string[] };

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthPeriod(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function computeComponentAmount(
  basicSalary: number,
  calcType: SalaryCalcType,
  value: number,
): number {
  if (calcType === 'PERCENT_OF_BASIC') {
    return roundMoney((basicSalary * value) / 100);
  }
  return roundMoney(value);
}

function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

function parsePage(params: Record<string, string | undefined>) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  return { page, pageSize };
}

export class PayrollService {
  constructor(private readonly repo = new PayrollRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      throw new ConflictError(message);
    }
    throw error;
  }

  private canManageCompanyWide(actor: AuthActor): boolean {
    return (
      actor.permissions.includes('payroll:update') ||
      actor.permissions.includes('payroll:approve') ||
      actor.permissions.includes('payroll:create')
    );
  }

  private async resolveEmployeeId(
    companyId: string,
    actorId: string,
    employeeId?: string | null,
  ): Promise<string> {
    if (employeeId) {
      const employee = await this.repo.findEmployeeBasic(companyId, employeeId);
      if (!employee) throw new ValidationError('Invalid employee');
      return employee.id;
    }
    const linked = await this.repo.findEmployeeByUserId(companyId, actorId);
    if (!linked) {
      throw new ValidationError(
        'No employee profile linked to your account. Provide employeeId or link a user to an employee.',
      );
    }
    return linked.id;
  }

  private async validateStructureComponents(
    companyId: string,
    components?: { componentId: string; value: number }[],
  ) {
    if (!components?.length) return;
    const ids = [...new Set(components.map((c) => c.componentId))];
    const found = await this.repo.findComponentsByIds(companyId, ids);
    if (found.length !== ids.length) {
      throw new ValidationError('One or more salary components are invalid or inactive');
    }
  }

  // —— Summary / Report ——
  async summary(actor: AuthActor, yearParam?: string) {
    if (!this.canManageCompanyWide(actor)) {
      return this.mySummary(actor, yearParam);
    }

    const companyId = await this.requireCompanyId(actor.id);
    const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    const [statusRows, ytd, structuresCount, monthRuns] = await Promise.all([
      this.repo.runStatusCounts(companyId, year),
      this.repo.companyPayslipYtdTotals(companyId, year),
      this.repo.countActiveStructures(companyId),
      this.repo.runMonthAggregates(companyId, year),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusRows) {
      byStatus[row.status] = row._count._all;
    }

    return {
      scope: 'company' as const,
      year,
      activeSalaryStructures: structuresCount,
      runsByStatus: byStatus,
      draftRuns: byStatus.DRAFT ?? 0,
      completedRuns: byStatus.COMPLETED ?? 0,
      approvedRuns: byStatus.APPROVED ?? 0,
      paidRuns: byStatus.PAID ?? 0,
      ytdGross: roundMoney(ytd._sum.grossPay ?? 0),
      ytdNet: roundMoney(ytd._sum.netPay ?? 0),
      ytdTax: roundMoney(ytd._sum.totalTax ?? 0),
      payslipCount: ytd._count._all,
      months: monthRuns.map((run) => ({
        month: run.month,
        status: run.status,
        title: run.title,
        entryCount: run.entries.length,
        grossPay: roundMoney(run.entries.reduce((s, e) => s + e.grossPay, 0)),
        netPay: roundMoney(run.entries.reduce((s, e) => s + e.netPay, 0)),
      })),
    };
  }

  async mySummary(actor: AuthActor, yearParam?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    const [ytd, latest, recent] = await Promise.all([
      this.repo.payslipYtdTotals(companyId, employeeId, year),
      this.repo.latestPayslip(companyId, employeeId),
      this.repo.listPayslips(companyId, {
        employeeId,
        year,
        page: 1,
        pageSize: 5,
      }),
    ]);

    return {
      scope: 'employee' as const,
      year,
      employeeId,
      payslipCount: ytd._count._all,
      ytdGross: roundMoney(ytd._sum.grossPay ?? 0),
      ytdNet: roundMoney(ytd._sum.netPay ?? 0),
      ytdTax: roundMoney(ytd._sum.totalTax ?? 0),
      ytdAllowances: roundMoney(ytd._sum.totalAllowances ?? 0),
      ytdBonuses: roundMoney(ytd._sum.totalBonuses ?? 0),
      ytdDeductions: roundMoney(ytd._sum.totalDeductions ?? 0),
      latestPayslip: latest,
      recentPayslips: recent.items,
    };
  }

  async report(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    if (!this.canManageCompanyWide(actor)) {
      throw new ForbiddenError('You do not have permission to view company payroll reports');
    }

    const year = params.year ? Number(params.year) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    const [statusRows, monthRuns] = await Promise.all([
      this.repo.runStatusCounts(companyId, year),
      this.repo.runMonthAggregates(companyId, year),
    ]);

    return {
      year,
      byStatus: statusRows.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      byMonth: monthRuns.map((run) => ({
        month: run.month,
        status: run.status,
        title: run.title,
        entryCount: run.entries.length,
        grossPay: roundMoney(run.entries.reduce((s, e) => s + e.grossPay, 0)),
        netPay: roundMoney(run.entries.reduce((s, e) => s + e.netPay, 0)),
        totalTax: roundMoney(run.entries.reduce((s, e) => s + e.totalTax, 0)),
        totalDeductions: roundMoney(run.entries.reduce((s, e) => s + e.totalDeductions, 0)),
      })),
    };
  }

  // —— Components ——
  async listComponents(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listComponents(companyId, { page, pageSize });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async createComponent(actor: AuthActor, input: CreateSalaryComponentInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const component = await this.repo.createComponent(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'payroll.component.create',
        entityType: 'SalaryComponent',
        entityId: component.id,
      });
      return component;
    } catch (error) {
      this.rethrowUnique(error, 'Salary component code already exists');
    }
  }

  async updateComponent(actor: AuthActor, id: string, input: UpdateSalaryComponentInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findComponent(companyId, id);
    if (!existing) throw new NotFoundError('Salary component not found');
    try {
      const component = await this.repo.updateComponent(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'payroll.component.update',
        entityType: 'SalaryComponent',
        entityId: id,
      });
      return component;
    } catch (error) {
      this.rethrowUnique(error, 'Salary component code already exists');
    }
  }

  async deleteComponent(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findComponent(companyId, id);
    if (!existing) throw new NotFoundError('Salary component not found');

    const inUse = await this.repo.countStructureItemsForComponent(companyId, id);
    if (inUse > 0) {
      throw new ValidationError(
        'Cannot delete a component used in salary structures. Deactivate it instead.',
      );
    }

    await this.repo.softDeleteComponent(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.component.delete',
      entityType: 'SalaryComponent',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— Structures ——
  async listStructures(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    let employeeId = params.employeeId || undefined;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else if (employeeId) {
      await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }
    const { items, total } = await this.repo.listStructures(companyId, {
      page,
      pageSize,
      employeeId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getStructure(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const structure = await this.repo.findStructure(companyId, id);
    if (!structure) throw new NotFoundError('Salary structure not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (structure.employeeId !== selfId) {
        throw new ForbiddenError('You can only view your own salary structure');
      }
    }
    return structure;
  }

  async createStructure(actor: AuthActor, input: CreateSalaryStructureInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    await this.validateStructureComponents(companyId, input.components);

    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new ValidationError('effectiveTo must be on or after effectiveFrom');
    }

    const structure = await this.repo.createStructure(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.structure.create',
      entityType: 'SalaryStructure',
      entityId: structure.id,
    });
    return structure;
  }

  async updateStructure(actor: AuthActor, id: string, input: UpdateSalaryStructureInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findStructure(companyId, id);
    if (!existing) throw new NotFoundError('Salary structure not found');

    await this.validateStructureComponents(companyId, input.components);

    const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
    const effectiveTo =
      input.effectiveTo !== undefined ? input.effectiveTo : existing.effectiveTo;
    if (effectiveTo && effectiveTo < effectiveFrom) {
      throw new ValidationError('effectiveTo must be on or after effectiveFrom');
    }

    const structure = await this.repo.runTransaction(async (tx) => {
      if (input.components) {
        await this.repo.replaceStructureItems(id, input.components, tx);
      }
      return this.repo.updateStructure(id, input, tx);
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.structure.update',
      entityType: 'SalaryStructure',
      entityId: id,
    });
    return this.repo.findStructure(companyId, id) ?? structure;
  }

  async deleteStructure(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findStructure(companyId, id);
    if (!existing) throw new NotFoundError('Salary structure not found');

    await this.repo.softDeleteStructure(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.structure.delete',
      entityType: 'SalaryStructure',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— Tax ——
  async getTax(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return this.repo.upsertTaxSetting(companyId);
  }

  async updateTax(actor: AuthActor, input: UpdateTaxSettingInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const tax = await this.repo.upsertTaxSetting(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.tax.update',
      entityType: 'TaxSetting',
      entityId: tax.id,
    });
    return tax;
  }

  // —— Runs ——
  async listRuns(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const year = params.year ? Number(params.year) : undefined;
    const month = params.month ? Number(params.month) : undefined;
    if (year !== undefined && !Number.isFinite(year)) throw new ValidationError('Invalid year');
    if (month !== undefined && (!Number.isFinite(month) || month < 1 || month > 12)) {
      throw new ValidationError('Invalid month');
    }

    const status = params.status as
      | 'DRAFT'
      | 'PROCESSING'
      | 'COMPLETED'
      | 'APPROVED'
      | 'PAID'
      | 'CANCELLED'
      | undefined;
    if (
      status &&
      !['DRAFT', 'PROCESSING', 'COMPLETED', 'APPROVED', 'PAID', 'CANCELLED'].includes(status)
    ) {
      throw new ValidationError('Invalid status');
    }

    const { items, total } = await this.repo.listRuns(companyId, {
      page,
      pageSize,
      status,
      year,
      month,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getRun(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const run = await this.repo.findRun(companyId, id);
    if (!run) throw new NotFoundError('Payroll run not found');

    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      return {
        ...run,
        entries: run.entries.filter((e) => e.employeeId === selfId),
      };
    }
    return run;
  }

  async createRun(actor: AuthActor, input: CreatePayrollRunInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const title =
      input.title?.trim() ||
      `Payroll ${input.year}-${String(input.month).padStart(2, '0')}`;

    try {
      const run = await this.repo.createRun(companyId, { ...input, title });
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'payroll.run.create',
        entityType: 'PayrollRun',
        entityId: run.id,
      });
      return run;
    } catch (error) {
      this.rethrowUnique(error, 'A payroll run already exists for this year and month');
    }
  }

  async updateRun(actor: AuthActor, id: string, input: UpdatePayrollRunInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRunBasic(companyId, id);
    if (!existing) throw new NotFoundError('Payroll run not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'COMPLETED') {
      throw new ValidationError('Only draft or completed runs can be updated');
    }

    const run = await this.repo.updateRun(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.run.update',
      entityType: 'PayrollRun',
      entityId: id,
    });
    return run;
  }

  async processRun(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRunBasic(companyId, id);
    if (!existing) throw new NotFoundError('Payroll run not found');

    if (existing.status !== 'DRAFT' && existing.status !== 'COMPLETED') {
      throw new ValidationError(
        'Only draft or completed (not yet approved) runs can be processed',
      );
    }

    const { start: periodStart, end: periodEnd } = monthPeriod(existing.year, existing.month);
    const [structures, taxSetting] = await Promise.all([
      this.repo.listActiveStructuresForPeriod(companyId, periodStart, periodEnd),
      this.repo.findTaxSetting(companyId),
    ]);

    // One structure per employee — prefer most recently updated if duplicates
    const byEmployee = new Map<string, (typeof structures)[number]>();
    for (const structure of structures) {
      const prev = byEmployee.get(structure.employeeId);
      if (!prev || structure.updatedAt > prev.updatedAt) {
        byEmployee.set(structure.employeeId, structure);
      }
    }

    const standardRate = taxSetting?.standardRate ?? 0;
    const personalAllowanceMonthly = (taxSetting?.personalAllowance ?? 0) / 12;

    await this.repo.runTransaction(async (tx) => {
      await this.repo.updateRun(id, { status: 'PROCESSING' }, tx);
      await this.repo.deleteRunEntries(id, tx);

      for (const structure of byEmployee.values()) {
        const basic = roundMoney(structure.basicSalary);
        const lines: {
          componentId?: string | null;
          kind: SalaryComponentKind;
          label: string;
          amount: number;
        }[] = [];

        let totalAllowances = 0;
        let totalBonuses = 0;
        let totalDeductions = 0;
        let totalTax = 0;
        let taxableAllowances = 0;
        let hasTaxComponent = false;

        for (const item of structure.components) {
          const component = item.component;
          if (!component || component.deletedAt || !component.isActive) continue;

          const amount = computeComponentAmount(basic, component.calcType, item.value);
          if (amount === 0) continue;

          lines.push({
            componentId: component.id,
            kind: component.kind,
            label: component.name,
            amount,
          });

          switch (component.kind) {
            case 'ALLOWANCE':
              totalAllowances = roundMoney(totalAllowances + amount);
              if (component.isTaxable) {
                taxableAllowances = roundMoney(taxableAllowances + amount);
              }
              break;
            case 'BONUS':
              totalBonuses = roundMoney(totalBonuses + amount);
              break;
            case 'DEDUCTION':
              totalDeductions = roundMoney(totalDeductions + amount);
              break;
            case 'TAX':
              totalTax = roundMoney(totalTax + amount);
              hasTaxComponent = true;
              break;
            default:
              break;
          }
        }

        if (standardRate > 0 && !hasTaxComponent) {
          const taxable = Math.max(
            0,
            roundMoney(basic + taxableAllowances + totalBonuses - personalAllowanceMonthly),
          );
          const incomeTax = roundMoney((taxable * standardRate) / 100);
          if (incomeTax > 0) {
            lines.push({
              componentId: null,
              kind: 'TAX',
              label: 'Income Tax',
              amount: incomeTax,
            });
            totalTax = roundMoney(totalTax + incomeTax);
          }
        }

        const grossPay = roundMoney(basic + totalAllowances + totalBonuses);
        const netPay = roundMoney(grossPay - totalDeductions - totalTax);

        const entry = await this.repo.createEntry(
          {
            companyId,
            payrollRunId: id,
            employeeId: structure.employeeId,
            basicSalary: basic,
            totalAllowances,
            totalBonuses,
            totalDeductions,
            totalTax,
            grossPay,
            netPay,
            lines,
          },
          tx,
        );

        await this.repo.createPayslip(
          {
            companyId,
            employeeId: structure.employeeId,
            payrollEntryId: entry.id,
            year: existing.year,
            month: existing.month,
            basicSalary: basic,
            totalAllowances,
            totalBonuses,
            totalDeductions,
            totalTax,
            grossPay,
            netPay,
            currency: structure.currency,
          },
          tx,
        );
      }

      await this.repo.updateRun(
        id,
        { status: 'COMPLETED', processedAt: new Date() },
        tx,
      );
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.run.process',
      entityType: 'PayrollRun',
      entityId: id,
      metadata: { employeeCount: byEmployee.size },
    });

    return this.repo.findRun(companyId, id);
  }

  async approveRun(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRunBasic(companyId, id);
    if (!existing) throw new NotFoundError('Payroll run not found');
    if (existing.status !== 'COMPLETED') {
      throw new ValidationError('Only completed payroll runs can be approved');
    }

    const run = await this.repo.updateRun(id, {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: actor.id,
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.run.approve',
      entityType: 'PayrollRun',
      entityId: id,
    });
    return run;
  }

  async markRunPaid(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRunBasic(companyId, id);
    if (!existing) throw new NotFoundError('Payroll run not found');
    if (existing.status !== 'APPROVED') {
      throw new ValidationError('Only approved payroll runs can be marked as paid');
    }

    const paidAt = new Date();
    await this.repo.runTransaction(async (tx) => {
      await this.repo.updateRun(id, { status: 'PAID', paidAt }, tx);
      await this.repo.markPayslipsPaidForRun(id, paidAt, tx);
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.run.mark_paid',
      entityType: 'PayrollRun',
      entityId: id,
    });
    return this.repo.findRun(companyId, id);
  }

  async cancelRun(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRunBasic(companyId, id);
    if (!existing) throw new NotFoundError('Payroll run not found');
    if (existing.status !== 'DRAFT' && existing.status !== 'COMPLETED') {
      throw new ValidationError('Only draft or completed runs can be cancelled');
    }

    const run = await this.repo.updateRun(id, { status: 'CANCELLED' });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'payroll.run.cancel',
      entityType: 'PayrollRun',
      entityId: id,
    });
    return run;
  }

  async listEntries(actor: AuthActor, runId: string, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const run = await this.repo.findRunBasic(companyId, runId);
    if (!run) throw new NotFoundError('Payroll run not found');

    const { page, pageSize } = parsePage(params);
    let employeeId = params.employeeId || undefined;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    }

    const { items, total } = await this.repo.listEntries(companyId, runId, {
      page,
      pageSize,
      employeeId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  // —— Payslips ——
  async listPayslips(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);

    let employeeId = params.employeeId || undefined;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else if (employeeId) {
      await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }

    const year = params.year ? Number(params.year) : undefined;
    const month = params.month ? Number(params.month) : undefined;
    if (year !== undefined && !Number.isFinite(year)) throw new ValidationError('Invalid year');
    if (month !== undefined && (!Number.isFinite(month) || month < 1 || month > 12)) {
      throw new ValidationError('Invalid month');
    }

    const { items, total } = await this.repo.listPayslips(companyId, {
      page,
      pageSize,
      employeeId,
      year,
      month,
      status: params.status,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getPayslip(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const payslip = await this.repo.findPayslip(companyId, id);
    if (!payslip) throw new NotFoundError('Payslip not found');

    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (payslip.employeeId !== selfId) {
        throw new ForbiddenError('You can only view your own payslips');
      }
    }
    return payslip;
  }

  async myPayslips(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    return this.listPayslips(actor, { ...params, employeeId });
  }
}
