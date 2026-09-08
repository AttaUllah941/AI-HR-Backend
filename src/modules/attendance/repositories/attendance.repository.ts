import type { AttendanceStatus, OvertimeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type {
  CreateAttendanceInput,
  CreateHolidayInput,
  CreateOvertimeInput,
  CreateShiftInput,
  UpdateAttendanceInput,
  UpdateHolidayInput,
  UpdateShiftInput,
} from '../validators/attendance.validators.js';

const notDeleted = { deletedAt: null };

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EmployeeSelect;

const attendanceInclude = {
  employee: { select: employeeSelect },
  shift: {
    select: {
      id: true,
      name: true,
      code: true,
      startTime: true,
      endTime: true,
      graceMinutes: true,
      breakMinutes: true,
    },
  },
} satisfies Prisma.AttendanceRecordInclude;

export type AttendanceListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  status?: AttendanceStatus;
  employeeId?: string;
  departmentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortDir: 'asc' | 'desc';
};

export class AttendanceRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findEmployeeByUserId(companyId: string, userId: string) {
    return prisma.employee.findFirst({
      where: { companyId, userId, ...notDeleted },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        branchId: true,
      },
    });
  }

  findEmployeeForClock(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: {
        id: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  listBranchAllowedCidrs(branchId: string) {
    return prisma.branchAllowedIp.findMany({
      where: { branchId, isActive: true },
      select: { cidr: true },
      orderBy: { cidr: 'asc' },
    });
  }

  findEmployeeBasic(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  findDefaultShift(companyId: string) {
    return prisma.shift.findFirst({
      where: { companyId, isDefault: true, isActive: true, ...notDeleted },
    });
  }

  findShift(companyId: string, id: string) {
    return prisma.shift.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  listShifts(companyId: string) {
    return prisma.shift.findMany({
      where: { companyId, ...notDeleted },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  createShift(companyId: string, data: CreateShiftInput) {
    return prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.shift.updateMany({
          where: { companyId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      return tx.shift.create({
        data: {
          companyId,
          name: data.name.trim(),
          code: data.code.trim().toUpperCase(),
          startTime: data.startTime,
          endTime: data.endTime,
          breakMinutes: data.breakMinutes ?? 60,
          graceMinutes: data.graceMinutes ?? 15,
          isDefault: data.isDefault ?? false,
          isActive: data.isActive ?? true,
        },
      });
    });
  }

  updateShift(id: string, companyId: string, data: UpdateShiftInput) {
    return prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.shift.updateMany({
          where: { companyId, deletedAt: null, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.shift.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
          ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
          ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
          ...(data.breakMinutes !== undefined ? { breakMinutes: data.breakMinutes } : {}),
          ...(data.graceMinutes !== undefined ? { graceMinutes: data.graceMinutes } : {}),
          ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });
    });
  }

  softDeleteShift(id: string) {
    return prisma.shift.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  listHolidays(companyId: string, year?: number) {
    const where: Prisma.HolidayWhereInput = { companyId, ...notDeleted };
    if (year) {
      where.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }
    return prisma.holiday.findMany({ where, orderBy: { date: 'asc' } });
  }

  findHoliday(companyId: string, id: string) {
    return prisma.holiday.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  findHolidayByDate(companyId: string, date: Date) {
    const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return prisma.holiday.findFirst({ where: { companyId, date: day, ...notDeleted } });
  }

  createHoliday(companyId: string, data: CreateHolidayInput) {
    const day = new Date(
      Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate()),
    );
    return prisma.holiday.create({
      data: {
        companyId,
        name: data.name.trim(),
        date: day,
        isOptional: data.isOptional ?? false,
        description: data.description ?? null,
      },
    });
  }

  updateHoliday(id: string, data: UpdateHolidayInput) {
    return prisma.holiday.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.date !== undefined
          ? {
              date: new Date(
                Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate()),
              ),
            }
          : {}),
        ...(data.isOptional !== undefined ? { isOptional: data.isOptional } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  softDeleteHoliday(id: string) {
    return prisma.holiday.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  listAttendance(companyId: string, query: AttendanceListQuery) {
    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.departmentId ? { employee: { departmentId: query.departmentId } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            employee: {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { employeeCode: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    return Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: attendanceInclude,
        orderBy: [{ date: query.sortDir }, { createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
  }

  findAttendance(companyId: string, id: string) {
    return prisma.attendanceRecord.findFirst({
      where: { id, companyId, ...notDeleted },
      include: attendanceInclude,
    });
  }

  findAttendanceByEmployeeDate(companyId: string, employeeId: string, date: Date) {
    return prisma.attendanceRecord.findFirst({
      where: { companyId, employeeId, date, ...notDeleted },
      include: attendanceInclude,
    });
  }

  createAttendance(companyId: string, data: CreateAttendanceInput & {
    status: AttendanceStatus;
    workMinutes: number;
    overtimeMinutes: number;
    lateMinutes: number;
    source: 'CLOCK' | 'MANUAL' | 'SYSTEM';
    checkInIp?: string | null;
    checkOutIp?: string | null;
  }) {
    const day = new Date(
      Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate()),
    );
    return prisma.attendanceRecord.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        date: day,
        shiftId: data.shiftId || null,
        checkInAt: data.checkInAt ?? null,
        checkOutAt: data.checkOutAt ?? null,
        checkInIp: data.checkInIp ?? null,
        checkOutIp: data.checkOutIp ?? null,
        status: data.status,
        workMinutes: data.workMinutes,
        overtimeMinutes: data.overtimeMinutes,
        lateMinutes: data.lateMinutes,
        notes: data.notes ?? null,
        source: data.source,
      },
      include: attendanceInclude,
    });
  }

  updateAttendance(id: string, data: UpdateAttendanceInput & {
    status?: AttendanceStatus;
    workMinutes?: number;
    overtimeMinutes?: number;
    lateMinutes?: number;
    checkInIp?: string | null;
    checkOutIp?: string | null;
  }) {
    return prisma.attendanceRecord.update({
      where: { id },
      data: {
        ...(data.shiftId !== undefined ? { shiftId: data.shiftId || null } : {}),
        ...(data.checkInAt !== undefined ? { checkInAt: data.checkInAt } : {}),
        ...(data.checkOutAt !== undefined ? { checkOutAt: data.checkOutAt } : {}),
        ...(data.checkInIp !== undefined ? { checkInIp: data.checkInIp } : {}),
        ...(data.checkOutIp !== undefined ? { checkOutIp: data.checkOutIp } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.workMinutes !== undefined ? { workMinutes: data.workMinutes } : {}),
        ...(data.overtimeMinutes !== undefined ? { overtimeMinutes: data.overtimeMinutes } : {}),
        ...(data.lateMinutes !== undefined ? { lateMinutes: data.lateMinutes } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.date !== undefined
          ? {
              date: new Date(
                Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate()),
              ),
            }
          : {}),
      },
      include: attendanceInclude,
    });
  }

  softDeleteAttendance(id: string) {
    return prisma.attendanceRecord.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  summaryCounts(companyId: string, dateFrom: Date, dateTo: Date) {
    return prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        date: { gte: dateFrom, lte: dateTo },
      },
      _count: { _all: true },
      _sum: { workMinutes: true, overtimeMinutes: true },
    });
  }

  timesheet(companyId: string, employeeId: string, dateFrom: Date, dateTo: Date) {
    return prisma.attendanceRecord.findMany({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        date: { gte: dateFrom, lte: dateTo },
      },
      include: attendanceInclude,
      orderBy: { date: 'asc' },
    });
  }

  listOvertime(companyId: string, status?: OvertimeStatus) {
    return prisma.overtimeRequest.findMany({
      where: {
        companyId,
        ...notDeleted,
        ...(status ? { status } : {}),
      },
      include: {
        employee: { select: employeeSelect },
        attendance: { select: { id: true, date: true, status: true } },
      },
      orderBy: [{ status: 'asc' }, { date: 'desc' }],
    });
  }

  findOvertime(companyId: string, id: string) {
    return prisma.overtimeRequest.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        employee: { select: employeeSelect },
        attendance: { select: { id: true, date: true, status: true } },
      },
    });
  }

  createOvertime(companyId: string, data: CreateOvertimeInput) {
    const day = new Date(
      Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate()),
    );
    return prisma.overtimeRequest.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        attendanceId: data.attendanceId || null,
        date: day,
        minutes: data.minutes,
        reason: data.reason ?? null,
      },
      include: {
        employee: { select: employeeSelect },
        attendance: { select: { id: true, date: true, status: true } },
      },
    });
  }

  reviewOvertime(
    id: string,
    status: OvertimeStatus,
    reviewedBy: string,
    reviewNotes?: string | null,
  ) {
    return prisma.overtimeRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes ?? null,
      },
      include: {
        employee: { select: employeeSelect },
        attendance: { select: { id: true, date: true, status: true } },
      },
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
