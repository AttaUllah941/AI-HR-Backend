import type { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const attendanceInclude = {
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
} satisfies Prisma.AttendanceRecordInclude;

export type AttendanceWithEmployee = Prisma.AttendanceRecordGetPayload<{
  include: typeof attendanceInclude;
}>;

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

export class AttendanceRepository {
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
    return prisma.attendanceRecord.findFirst({
      where: { id, companyId, deletedAt: null },
      include: attendanceInclude,
    });
  }

  summarizeByStatus(companyId: string, workDate: Date) {
    const day = startOfDay(workDate);
    return prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: { companyId, workDate: day, deletedAt: null },
      _count: { _all: true },
    });
  }

  countActiveEmployees(companyId: string) {
    return prisma.employee.count({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'REMOTE', 'ON_LEAVE'] },
      },
    });
  }

  listCheckIns(companyId: string, workDate: Date, take: number) {
    const day = startOfDay(workDate);
    return prisma.attendanceRecord.findMany({
      where: {
        companyId,
        workDate: day,
        deletedAt: null,
        checkInAt: { not: null },
        status: { in: ['PRESENT', 'LATE', 'REMOTE'] },
      },
      include: attendanceInclude,
      orderBy: [{ checkInAt: 'desc' }],
      take,
    });
  }

  listMonth(companyId: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return prisma.attendanceRecord.findMany({
      where: {
        companyId,
        deletedAt: null,
        workDate: { gte: start, lte: end },
      },
      select: {
        workDate: true,
        status: true,
      },
    });
  }

  list(
    companyId: string,
    options: {
      workDate?: Date;
      status?: AttendanceStatus;
      search?: string;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.workDate ? { workDate: startOfDay(options.workDate) } : {}),
      ...(options.status ? { status: options.status } : {}),
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
      prisma.attendanceRecord.findMany({
        where,
        include: attendanceInclude,
        orderBy: [{ workDate: 'desc' }, { checkInAt: 'desc' }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
  }

  upsert(data: {
    companyId: string;
    employeeId: string;
    workDate: Date;
    status: AttendanceStatus;
    checkInAt?: Date | null;
    checkOutAt?: Date | null;
    locationLabel?: string;
    notes?: string;
  }) {
    const workDate = startOfDay(data.workDate);
    return prisma.attendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId: data.employeeId,
          workDate,
        },
      },
      create: {
        companyId: data.companyId,
        employeeId: data.employeeId,
        workDate,
        status: data.status,
        checkInAt: data.checkInAt ?? undefined,
        checkOutAt: data.checkOutAt ?? undefined,
        locationLabel: data.locationLabel,
        notes: data.notes,
      },
      update: {
        status: data.status,
        checkInAt: data.checkInAt === null ? null : data.checkInAt,
        checkOutAt: data.checkOutAt === null ? null : data.checkOutAt,
        locationLabel: data.locationLabel,
        notes: data.notes,
        deletedAt: null,
      },
      include: attendanceInclude,
    });
  }

  update(id: string, data: Prisma.AttendanceRecordUpdateInput) {
    return prisma.attendanceRecord.update({
      where: { id },
      data,
      include: attendanceInclude,
    });
  }

  softDelete(id: string) {
    return prisma.attendanceRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
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

export { startOfDay, endOfDay };
