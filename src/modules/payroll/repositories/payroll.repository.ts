import type { PayrollRunStatus, Prisma, SalaryComponentKind } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type {
  CreatePayrollRunInput,
  CreateSalaryComponentInput,
  CreateSalaryStructureInput,
  UpdatePayrollRunInput,
  UpdateSalaryComponentInput,
  UpdateSalaryStructureInput,
  UpdateTaxSettingInput,
} from '../validators/payroll.validators.js';

const notDeleted = { deletedAt: null };

type DbClient = Prisma.TransactionClient | typeof prisma;

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EmployeeSelect;

const componentSelect = {
  id: true,
  name: true,
  code: true,
  kind: true,
  calcType: true,
  defaultValue: true,
  isTaxable: true,
  isActive: true,
  description: true,
} satisfies Prisma.SalaryComponentSelect;

const structureInclude = {
  employee: { select: employeeSelect },
  components: {
    include: { component: { select: componentSelect } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.SalaryStructureInclude;

const entryInclude = {
  employee: { select: employeeSelect },
  lines: {
    include: { component: { select: componentSelect } },
    orderBy: { label: 'asc' as const },
  },
  payslip: true,
} satisfies Prisma.PayrollEntryInclude;

const runInclude = {
  entries: {
    include: entryInclude,
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { entries: true } },
} satisfies Prisma.PayrollRunInclude;

const payslipInclude = {
  employee: { select: employeeSelect },
  entry: {
    include: {
      lines: {
        include: { component: { select: componentSelect } },
        orderBy: { label: 'asc' as const },
      },
      run: {
        select: {
          id: true,
          year: true,
          month: true,
          title: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.PayslipInclude;

export type PayrollListQuery = {
  page: number;
  pageSize: number;
};

export type PayrollRunListQuery = PayrollListQuery & {
  status?: PayrollRunStatus;
  year?: number;
  month?: number;
};

export type PayslipListQuery = PayrollListQuery & {
  employeeId?: string;
  year?: number;
  month?: number;
  status?: string;
};

export class PayrollRepository {
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }

  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findEmployeeByUserId(companyId: string, userId: string) {
    return prisma.employee.findFirst({
      where: { companyId, userId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  findEmployeeBasic(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  // —— Components ——
  async listComponents(companyId: string, query: PayrollListQuery) {
    const where: Prisma.SalaryComponentWhereInput = { companyId, ...notDeleted };
    const [items, total] = await Promise.all([
      prisma.salaryComponent.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.salaryComponent.count({ where }),
    ]);
    return { items, total };
  }

  findComponent(companyId: string, id: string) {
    return prisma.salaryComponent.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  findComponentsByIds(companyId: string, ids: string[]) {
    return prisma.salaryComponent.findMany({
      where: { companyId, id: { in: ids }, ...notDeleted, isActive: true },
    });
  }

  createComponent(companyId: string, data: CreateSalaryComponentInput) {
    return prisma.salaryComponent.create({
      data: {
        companyId,
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        kind: data.kind,
        calcType: data.calcType ?? 'FIXED',
        defaultValue: data.defaultValue ?? 0,
        isTaxable: data.isTaxable ?? true,
        isActive: data.isActive ?? true,
        description: data.description ?? null,
      },
    });
  }

  updateComponent(id: string, data: UpdateSalaryComponentInput) {
    return prisma.salaryComponent.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.kind !== undefined ? { kind: data.kind } : {}),
        ...(data.calcType !== undefined ? { calcType: data.calcType } : {}),
        ...(data.defaultValue !== undefined ? { defaultValue: data.defaultValue } : {}),
        ...(data.isTaxable !== undefined ? { isTaxable: data.isTaxable } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  softDeleteComponent(id: string) {
    return prisma.salaryComponent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countStructureItemsForComponent(companyId: string, componentId: string) {
    return prisma.salaryStructureItem.count({
      where: {
        componentId,
        salaryStructure: { companyId, deletedAt: null },
      },
    });
  }

  // —— Structures ——
  async listStructures(companyId: string, query: PayrollListQuery & { employeeId?: string }) {
    const where: Prisma.SalaryStructureWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.salaryStructure.findMany({
        where,
        include: structureInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.salaryStructure.count({ where }),
    ]);
    return { items, total };
  }

  findStructure(companyId: string, id: string) {
    return prisma.salaryStructure.findFirst({
      where: { id, companyId, ...notDeleted },
      include: structureInclude,
    });
  }

  createStructure(
    companyId: string,
    data: CreateSalaryStructureInput & { components?: { componentId: string; value: number }[] },
    db: DbClient = prisma,
  ) {
    return db.salaryStructure.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        basicSalary: data.basicSalary,
        currency: data.currency ?? 'USD',
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        bankName: data.bankName ?? null,
        bankAccount: data.bankAccount ?? null,
        bankIban: data.bankIban ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
        ...(data.components?.length
          ? {
              components: {
                create: data.components.map((item) => ({
                  componentId: item.componentId,
                  value: item.value,
                })),
              },
            }
          : {}),
      },
      include: structureInclude,
    });
  }

  updateStructure(
    id: string,
    data: UpdateSalaryStructureInput,
    db: DbClient = prisma,
  ) {
    return db.salaryStructure.update({
      where: { id },
      data: {
        ...(data.basicSalary !== undefined ? { basicSalary: data.basicSalary } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.effectiveFrom !== undefined ? { effectiveFrom: data.effectiveFrom } : {}),
        ...(data.effectiveTo !== undefined ? { effectiveTo: data.effectiveTo } : {}),
        ...(data.bankName !== undefined ? { bankName: data.bankName } : {}),
        ...(data.bankAccount !== undefined ? { bankAccount: data.bankAccount } : {}),
        ...(data.bankIban !== undefined ? { bankIban: data.bankIban } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: structureInclude,
    });
  }

  replaceStructureItems(
    salaryStructureId: string,
    items: { componentId: string; value: number }[],
    db: DbClient = prisma,
  ) {
    return db.salaryStructureItem.deleteMany({ where: { salaryStructureId } }).then(() =>
      items.length
        ? db.salaryStructureItem.createMany({
            data: items.map((item) => ({
              salaryStructureId,
              componentId: item.componentId,
              value: item.value,
            })),
          })
        : Promise.resolve({ count: 0 }),
    );
  }

  softDeleteStructure(id: string) {
    return prisma.salaryStructure.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  listActiveStructuresForPeriod(companyId: string, periodStart: Date, periodEnd: Date, db: DbClient = prisma) {
    return db.salaryStructure.findMany({
      where: {
        companyId,
        ...notDeleted,
        isActive: true,
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
      },
      include: {
        employee: { select: employeeSelect },
        components: {
          include: { component: true },
        },
      },
      orderBy: { employeeId: 'asc' },
    });
  }

  countActiveStructures(companyId: string) {
    return prisma.salaryStructure.count({
      where: { companyId, ...notDeleted, isActive: true },
    });
  }

  // —— Tax ——
  findTaxSetting(companyId: string) {
    return prisma.taxSetting.findUnique({ where: { companyId } });
  }

  upsertTaxSetting(companyId: string, data: UpdateTaxSettingInput = {}) {
    const taxYear = data.taxYear ?? new Date().getUTCFullYear();
    return prisma.taxSetting.upsert({
      where: { companyId },
      create: {
        companyId,
        taxYear,
        standardRate: data.standardRate ?? 0,
        personalAllowance: data.personalAllowance ?? 0,
        notes: data.notes ?? null,
      },
      update: {
        ...(data.taxYear !== undefined ? { taxYear: data.taxYear } : {}),
        ...(data.standardRate !== undefined ? { standardRate: data.standardRate } : {}),
        ...(data.personalAllowance !== undefined
          ? { personalAllowance: data.personalAllowance }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  // —— Runs ——
  async listRuns(companyId: string, query: PayrollRunListQuery) {
    const where: Prisma.PayrollRunWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.month ? { month: query.month } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        include: { _count: { select: { entries: true } } },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payrollRun.count({ where }),
    ]);
    return { items, total };
  }

  findRun(companyId: string, id: string, db: DbClient = prisma) {
    return db.payrollRun.findFirst({
      where: { id, companyId, ...notDeleted },
      include: runInclude,
    });
  }

  findRunBasic(companyId: string, id: string, db: DbClient = prisma) {
    return db.payrollRun.findFirst({
      where: { id, companyId, ...notDeleted },
    });
  }

  createRun(
    companyId: string,
    data: CreatePayrollRunInput & { title: string },
  ) {
    return prisma.payrollRun.create({
      data: {
        companyId,
        year: data.year,
        month: data.month,
        title: data.title,
        notes: data.notes ?? null,
        status: 'DRAFT',
      },
      include: { _count: { select: { entries: true } } },
    });
  }

  updateRun(
    id: string,
    data: UpdatePayrollRunInput & {
      status?: PayrollRunStatus;
      processedAt?: Date | null;
      approvedAt?: Date | null;
      approvedBy?: string | null;
      paidAt?: Date | null;
    },
    db: DbClient = prisma,
  ) {
    return db.payrollRun.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.processedAt !== undefined ? { processedAt: data.processedAt } : {}),
        ...(data.approvedAt !== undefined ? { approvedAt: data.approvedAt } : {}),
        ...(data.approvedBy !== undefined ? { approvedBy: data.approvedBy } : {}),
        ...(data.paidAt !== undefined ? { paidAt: data.paidAt } : {}),
      },
      include: runInclude,
    });
  }

  deleteRunEntries(payrollRunId: string, db: DbClient = prisma) {
    return db.payrollEntry.deleteMany({ where: { payrollRunId } });
  }

  createEntry(
    data: {
      companyId: string;
      payrollRunId: string;
      employeeId: string;
      basicSalary: number;
      totalAllowances: number;
      totalBonuses: number;
      totalDeductions: number;
      totalTax: number;
      grossPay: number;
      netPay: number;
      lines: {
        componentId?: string | null;
        kind: SalaryComponentKind;
        label: string;
        amount: number;
      }[];
    },
    db: DbClient = prisma,
  ) {
    return db.payrollEntry.create({
      data: {
        companyId: data.companyId,
        payrollRunId: data.payrollRunId,
        employeeId: data.employeeId,
        basicSalary: data.basicSalary,
        totalAllowances: data.totalAllowances,
        totalBonuses: data.totalBonuses,
        totalDeductions: data.totalDeductions,
        totalTax: data.totalTax,
        grossPay: data.grossPay,
        netPay: data.netPay,
        lines: {
          create: data.lines.map((line) => ({
            componentId: line.componentId ?? null,
            kind: line.kind,
            label: line.label,
            amount: line.amount,
          })),
        },
      },
      include: entryInclude,
    });
  }

  createPayslip(
    data: {
      companyId: string;
      employeeId: string;
      payrollEntryId: string;
      year: number;
      month: number;
      basicSalary: number;
      totalAllowances: number;
      totalBonuses: number;
      totalDeductions: number;
      totalTax: number;
      grossPay: number;
      netPay: number;
      currency: string;
    },
    db: DbClient = prisma,
  ) {
    return db.payslip.create({
      data: {
        companyId: data.companyId,
        employeeId: data.employeeId,
        payrollEntryId: data.payrollEntryId,
        year: data.year,
        month: data.month,
        basicSalary: data.basicSalary,
        totalAllowances: data.totalAllowances,
        totalBonuses: data.totalBonuses,
        totalDeductions: data.totalDeductions,
        totalTax: data.totalTax,
        grossPay: data.grossPay,
        netPay: data.netPay,
        currency: data.currency,
        status: 'GENERATED',
        generatedAt: new Date(),
      },
    });
  }

  markPayslipsPaidForRun(payrollRunId: string, paidAt: Date, db: DbClient = prisma) {
    return db.payslip.updateMany({
      where: { entry: { payrollRunId } },
      data: { status: 'PAID', paidAt },
    });
  }

  async listEntries(
    companyId: string,
    payrollRunId: string,
    query: PayrollListQuery & { employeeId?: string },
  ) {
    const where: Prisma.PayrollEntryWhereInput = {
      companyId,
      payrollRunId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.payrollEntry.findMany({
        where,
        include: entryInclude,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payrollEntry.count({ where }),
    ]);
    return { items, total };
  }

  // —— Payslips ——
  async listPayslips(companyId: string, query: PayslipListQuery) {
    const where: Prisma.PayslipWhereInput = {
      companyId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.month ? { month: query.month } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.payslip.findMany({
        where,
        include: payslipInclude,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payslip.count({ where }),
    ]);
    return { items, total };
  }

  findPayslip(companyId: string, id: string) {
    return prisma.payslip.findFirst({
      where: { id, companyId },
      include: payslipInclude,
    });
  }

  // —— Aggregates ——
  runStatusCounts(companyId: string, year: number) {
    return prisma.payrollRun.groupBy({
      by: ['status'],
      where: { companyId, year, deletedAt: null },
      _count: { _all: true },
    });
  }

  runMonthAggregates(companyId: string, year: number) {
    return prisma.payrollRun.findMany({
      where: { companyId, year, deletedAt: null },
      select: {
        id: true,
        month: true,
        status: true,
        title: true,
        entries: {
          select: {
            grossPay: true,
            netPay: true,
            totalTax: true,
            totalDeductions: true,
          },
        },
      },
      orderBy: { month: 'asc' },
    });
  }

  payslipYtdTotals(companyId: string, employeeId: string, year: number) {
    return prisma.payslip.aggregate({
      where: { companyId, employeeId, year, status: { in: ['GENERATED', 'PAID'] } },
      _sum: {
        grossPay: true,
        netPay: true,
        totalTax: true,
        totalAllowances: true,
        totalBonuses: true,
        totalDeductions: true,
      },
      _count: { _all: true },
    });
  }

  companyPayslipYtdTotals(companyId: string, year: number) {
    return prisma.payslip.aggregate({
      where: { companyId, year, status: { in: ['GENERATED', 'PAID'] } },
      _sum: {
        grossPay: true,
        netPay: true,
        totalTax: true,
      },
      _count: { _all: true },
    });
  }

  latestPayslip(companyId: string, employeeId: string) {
    return prisma.payslip.findFirst({
      where: { companyId, employeeId },
      include: payslipInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  createAuditLog(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? {},
      },
    });
  }
}
