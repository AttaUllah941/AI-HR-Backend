import type { LeaveDayType, LeaveRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type {
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  UpdateLeavePolicyInput,
  UpdateLeaveRequestInput,
  UpdateLeaveTypeInput,
  UpsertLeaveBalanceInput,
} from '../validators/leave.validators.js';

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

const leaveTypeSelect = {
  id: true,
  name: true,
  code: true,
  color: true,
  isPaid: true,
  requiresApproval: true,
  allowHalfDay: true,
  maxDaysPerYear: true,
  carryForwardDays: true,
  isActive: true,
} satisfies Prisma.LeaveTypeSelect;

const requestInclude = {
  employee: { select: employeeSelect },
  leaveType: { select: leaveTypeSelect },
} satisfies Prisma.LeaveRequestInclude;

export type LeaveRequestListQuery = {
  page: number;
  pageSize: number;
  status?: LeaveRequestStatus;
  employeeId?: string;
  leaveTypeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export class LeaveRepository {
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

  listHolidaysBetween(companyId: string, from: Date, to: Date) {
    return prisma.holiday.findMany({
      where: {
        companyId,
        deletedAt: null,
        date: { gte: from, lte: to },
      },
      select: { date: true },
    });
  }

  // —— Types ——
  listTypes(companyId: string) {
    return prisma.leaveType.findMany({
      where: { companyId, ...notDeleted },
      orderBy: { name: 'asc' },
    });
  }

  findType(companyId: string, id: string) {
    return prisma.leaveType.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  createType(companyId: string, data: CreateLeaveTypeInput) {
    return prisma.leaveType.create({
      data: {
        companyId,
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        description: data.description ?? null,
        color: data.color ?? '#3b82f6',
        isPaid: data.isPaid ?? true,
        requiresApproval: data.requiresApproval ?? true,
        allowHalfDay: data.allowHalfDay ?? true,
        maxDaysPerYear: data.maxDaysPerYear ?? 0,
        carryForwardDays: data.carryForwardDays ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateType(id: string, data: UpdateLeaveTypeInput) {
    return prisma.leaveType.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.isPaid !== undefined ? { isPaid: data.isPaid } : {}),
        ...(data.requiresApproval !== undefined ? { requiresApproval: data.requiresApproval } : {}),
        ...(data.allowHalfDay !== undefined ? { allowHalfDay: data.allowHalfDay } : {}),
        ...(data.maxDaysPerYear !== undefined ? { maxDaysPerYear: data.maxDaysPerYear } : {}),
        ...(data.carryForwardDays !== undefined ? { carryForwardDays: data.carryForwardDays } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  softDeleteType(id: string) {
    return prisma.leaveType.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countOpenRequestsForType(companyId: string, leaveTypeId: string) {
    return prisma.leaveRequest.count({
      where: {
        companyId,
        leaveTypeId,
        ...notDeleted,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });
  }

  // —— Policy ——
  findPolicy(companyId: string) {
    return prisma.leavePolicy.findUnique({ where: { companyId } });
  }

  upsertPolicy(companyId: string, data: UpdateLeavePolicyInput = {}) {
    return prisma.leavePolicy.upsert({
      where: { companyId },
      create: {
        companyId,
        allowNegativeBalance: data.allowNegativeBalance ?? false,
        countWeekends: data.countWeekends ?? false,
        countHolidays: data.countHolidays ?? false,
        minNoticeDays: data.minNoticeDays ?? 0,
      },
      update: {
        ...(data.allowNegativeBalance !== undefined
          ? { allowNegativeBalance: data.allowNegativeBalance }
          : {}),
        ...(data.countWeekends !== undefined ? { countWeekends: data.countWeekends } : {}),
        ...(data.countHolidays !== undefined ? { countHolidays: data.countHolidays } : {}),
        ...(data.minNoticeDays !== undefined ? { minNoticeDays: data.minNoticeDays } : {}),
      },
    });
  }

  // —— Balances ——
  listBalances(companyId: string, year: number, employeeId?: string) {
    return prisma.leaveBalance.findMany({
      where: {
        companyId,
        year,
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: { select: employeeSelect },
        leaveType: { select: leaveTypeSelect },
      },
      orderBy: [{ employee: { firstName: 'asc' } }, { leaveType: { name: 'asc' } }],
    });
  }

  findBalance(
    companyId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    db: DbClient = prisma,
  ) {
    return db.leaveBalance.findFirst({
      where: { companyId, employeeId, leaveTypeId, year },
    });
  }

  upsertBalance(companyId: string, data: UpsertLeaveBalanceInput, db: DbClient = prisma) {
    return db.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: data.employeeId,
          leaveTypeId: data.leaveTypeId,
          year: data.year,
        },
      },
      create: {
        companyId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        year: data.year,
        entitled: data.entitled ?? 0,
        carriedForward: data.carriedForward ?? 0,
      },
      update: {
        ...(data.entitled !== undefined ? { entitled: data.entitled } : {}),
        ...(data.carriedForward !== undefined ? { carriedForward: data.carriedForward } : {}),
      },
      include: {
        employee: { select: employeeSelect },
        leaveType: { select: leaveTypeSelect },
      },
    });
  }

  adjustBalancePending(id: string, delta: number, db: DbClient = prisma) {
    return db.leaveBalance.update({
      where: { id },
      data: { pending: { increment: delta } },
    });
  }

  movePendingToUsed(id: string, days: number, db: DbClient = prisma) {
    return db.leaveBalance.update({
      where: { id },
      data: {
        pending: { decrement: days },
        used: { increment: days },
      },
    });
  }

  adjustBalanceUsed(id: string, delta: number, db: DbClient = prisma) {
    return db.leaveBalance.update({
      where: { id },
      data: { used: { increment: delta } },
    });
  }

  // —— Requests ——
  async listRequests(companyId: string, query: LeaveRequestListQuery) {
    const where: Prisma.LeaveRequestWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            startDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return { items, total };
  }

  findRequest(companyId: string, id: string, db: DbClient = prisma) {
    return db.leaveRequest.findFirst({
      where: { id, companyId, ...notDeleted },
      include: requestInclude,
    });
  }

  findOverlappingRequests(
    companyId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
    db: DbClient = prisma,
  ) {
    return db.leaveRequest.findFirst({
      where: {
        companyId,
        employeeId,
        ...notDeleted,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
  }

  createRequest(
    companyId: string,
    data: CreateLeaveRequestInput & {
      employeeId: string;
      days: number;
      dayType: LeaveDayType;
      status: LeaveRequestStatus;
    },
    db: DbClient = prisma,
  ) {
    return db.leaveRequest.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        leaveTypeId: data.leaveTypeId,
        startDate: data.startDate,
        endDate: data.endDate,
        dayType: data.dayType,
        days: data.days,
        reason: data.reason ?? null,
        status: data.status,
      },
      include: requestInclude,
    });
  }

  updateRequest(
    id: string,
    data: UpdateLeaveRequestInput & {
      days?: number;
      dayType?: LeaveDayType;
      status?: LeaveRequestStatus;
      reviewedBy?: string | null;
      reviewedAt?: Date | null;
      reviewNotes?: string | null;
    },
    db: DbClient = prisma,
  ) {
    return db.leaveRequest.update({
      where: { id },
      data: {
        ...(data.leaveTypeId !== undefined ? { leaveTypeId: data.leaveTypeId } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.dayType !== undefined ? { dayType: data.dayType } : {}),
        ...(data.days !== undefined ? { days: data.days } : {}),
        ...(data.reason !== undefined ? { reason: data.reason } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.reviewedBy !== undefined ? { reviewedBy: data.reviewedBy } : {}),
        ...(data.reviewedAt !== undefined ? { reviewedAt: data.reviewedAt } : {}),
        ...(data.reviewNotes !== undefined ? { reviewNotes: data.reviewNotes } : {}),
      },
      include: requestInclude,
    });
  }

  listCalendar(companyId: string, from: Date, to: Date, employeeId?: string) {
    return prisma.leaveRequest.findMany({
      where: {
        companyId,
        ...notDeleted,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: to },
        endDate: { gte: from },
        ...(employeeId ? { employeeId } : {}),
      },
      include: requestInclude,
      orderBy: { startDate: 'asc' },
    });
  }

  summaryCounts(companyId: string, year: number, employeeId?: string) {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    return prisma.leaveRequest.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
        startDate: { gte: yearStart, lte: yearEnd },
      },
      _count: { _all: true },
      _sum: { days: true },
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
