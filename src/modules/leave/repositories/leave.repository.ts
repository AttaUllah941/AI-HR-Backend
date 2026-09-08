import type { LeaveRequestStatus, LeaveType, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const leaveInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      position: true,
      status: true,
    },
  },
} satisfies Prisma.LeaveRequestInclude;

export type LeaveRequestWithEmployee = Prisma.LeaveRequestGetPayload<{
  include: typeof leaveInclude;
}>;

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export class LeaveRepository {
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

  findById(companyId: string, id: string) {
    return prisma.leaveRequest.findFirst({
      where: { id, companyId, deletedAt: null },
      include: leaveInclude,
    });
  }

  listPolicies(companyId: string, year: number) {
    return prisma.leavePolicy.findMany({
      where: { companyId, year, deletedAt: null },
      orderBy: { leaveType: 'asc' },
    });
  }

  countByStatus(companyId: string, status: LeaveRequestStatus) {
    return prisma.leaveRequest.count({
      where: { companyId, status, deletedAt: null },
    });
  }

  listPending(companyId: string, take: number) {
    return prisma.leaveRequest.findMany({
      where: { companyId, status: 'PENDING', deletedAt: null },
      include: leaveInclude,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take,
    });
  }

  listHolidays(companyId: string, from: Date, take: number) {
    return prisma.companyHoliday.findMany({
      where: {
        companyId,
        deletedAt: null,
        holidayDate: { gte: startOfDay(from) },
      },
      orderBy: { holidayDate: 'asc' },
      take,
    });
  }

  list(
    companyId: string,
    options: {
      status?: LeaveRequestStatus;
      leaveType?: LeaveType;
      search?: string;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.LeaveRequestWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.status ? { status: options.status } : {}),
      ...(options.leaveType ? { leaveType: options.leaveType } : {}),
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
      prisma.leaveRequest.findMany({
        where,
        include: leaveInclude,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.leaveRequest.count({ where }),
    ]);
  }

  create(data: {
    companyId: string;
    employeeId: string;
    leaveType: LeaveType;
    startDate: Date;
    endDate: Date;
    dayCount: number;
    reason?: string;
  }) {
    return prisma.leaveRequest.create({
      data: {
        companyId: data.companyId,
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        startDate: startOfDay(data.startDate),
        endDate: startOfDay(data.endDate),
        dayCount: data.dayCount,
        reason: data.reason,
        status: 'PENDING',
      },
      include: leaveInclude,
    });
  }

  update(id: string, data: Prisma.LeaveRequestUpdateInput) {
    return prisma.leaveRequest.update({
      where: { id },
      data,
      include: leaveInclude,
    });
  }

  softDelete(id: string) {
    return prisma.leaveRequest.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
  }

  adjustPolicyUsed(companyId: string, leaveType: LeaveType, year: number, delta: number) {
    return prisma.leavePolicy.updateMany({
      where: { companyId, leaveType, year, deletedAt: null },
      data: { usedDays: { increment: delta } },
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

export { startOfDay };
