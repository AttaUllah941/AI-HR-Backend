import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const entryInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      position: true,
      status: true,
      department: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.PayrollEntryInclude;

export type PayrollEntryWithEmployee = Prisma.PayrollEntryGetPayload<{
  include: typeof entryInclude;
}>;

export class PayrollRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findEmployee(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
  }

  findRun(companyId: string, year: number, month: number) {
    return prisma.payrollRun.findFirst({
      where: { companyId, year, month, deletedAt: null },
    });
  }

  findEntryById(companyId: string, id: string) {
    return prisma.payrollEntry.findFirst({
      where: { id, companyId, deletedAt: null },
      include: entryInclude,
    });
  }

  upsertRun(data: {
    companyId: string;
    year: number;
    month: number;
    status?: 'DRAFT' | 'READY' | 'PROCESSING' | 'COMPLETED';
    currency?: string;
  }) {
    return prisma.payrollRun.upsert({
      where: {
        companyId_year_month: {
          companyId: data.companyId,
          year: data.year,
          month: data.month,
        },
      },
      update: {
        deletedAt: null,
        ...(data.status ? { status: data.status } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
      },
      create: {
        companyId: data.companyId,
        year: data.year,
        month: data.month,
        status: data.status ?? 'READY',
        currency: data.currency ?? 'USD',
      },
    });
  }

  refreshRunTotals(payrollRunId: string) {
    return prisma.$transaction(async (tx) => {
      const aggregates = await tx.payrollEntry.aggregate({
        where: { payrollRunId, deletedAt: null },
        _count: { _all: true },
        _sum: {
          baseSalary: true,
          bonus: true,
          deductions: true,
          netPay: true,
        },
      });

      return tx.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          employeeCount: aggregates._count._all,
          totalBase: aggregates._sum.baseSalary ?? 0,
          totalBonus: aggregates._sum.bonus ?? 0,
          totalDeductions: aggregates._sum.deductions ?? 0,
          totalNet: aggregates._sum.netPay ?? 0,
        },
      });
    });
  }

  listEntries(
    companyId: string,
    options: {
      payrollRunId: string;
      search?: string;
      departmentId?: string;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.PayrollEntryWhereInput = {
      companyId,
      payrollRunId: options.payrollRunId,
      deletedAt: null,
      ...(options.departmentId
        ? { employee: { departmentId: options.departmentId } }
        : {}),
      ...(options.search
        ? {
            employee: {
              OR: [
                { firstName: { contains: options.search, mode: 'insensitive' } },
                { lastName: { contains: options.search, mode: 'insensitive' } },
                { email: { contains: options.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.payrollEntry.findMany({
        where,
        include: entryInclude,
        orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.payrollEntry.count({ where }),
    ]);
  }

  listEntriesForExport(
    companyId: string,
    options: {
      payrollRunId: string;
      search?: string;
      departmentId?: string;
    },
  ) {
    return prisma.payrollEntry.findMany({
      where: {
        companyId,
        payrollRunId: options.payrollRunId,
        deletedAt: null,
        ...(options.departmentId
          ? { employee: { departmentId: options.departmentId } }
          : {}),
        ...(options.search
          ? {
              employee: {
                OR: [
                  { firstName: { contains: options.search, mode: 'insensitive' } },
                  { lastName: { contains: options.search, mode: 'insensitive' } },
                  { email: { contains: options.search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: entryInclude,
      orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
    });
  }

  upsertEntry(data: {
    companyId: string;
    payrollRunId: string;
    employeeId: string;
    baseSalary: number;
    bonus: number;
    deductions: number;
    netPay: number;
    notes?: string;
  }) {
    return prisma.payrollEntry.upsert({
      where: {
        payrollRunId_employeeId: {
          payrollRunId: data.payrollRunId,
          employeeId: data.employeeId,
        },
      },
      create: {
        companyId: data.companyId,
        payrollRunId: data.payrollRunId,
        employeeId: data.employeeId,
        baseSalary: data.baseSalary,
        bonus: data.bonus,
        deductions: data.deductions,
        netPay: data.netPay,
        notes: data.notes,
      },
      update: {
        baseSalary: data.baseSalary,
        bonus: data.bonus,
        deductions: data.deductions,
        netPay: data.netPay,
        notes: data.notes,
        deletedAt: null,
      },
      include: entryInclude,
    });
  }

  updateEntry(id: string, data: Prisma.PayrollEntryUpdateInput) {
    return prisma.payrollEntry.update({
      where: { id },
      data,
      include: entryInclude,
    });
  }

  softDeleteEntry(id: string) {
    return prisma.payrollEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  markRunProcessed(id: string, status: 'PROCESSING' | 'COMPLETED') {
    return prisma.payrollRun.update({
      where: { id },
      data: {
        status,
        processedAt: status === 'COMPLETED' ? new Date() : undefined,
      },
    });
  }

  createAuditLog(data: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({ data });
  }
}
