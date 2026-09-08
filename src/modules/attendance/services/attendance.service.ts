import type { AttendanceStatus } from '@prisma/client';
import { isIpAllowed } from '../../../utils/ip-matcher.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import {
  AttendanceRepository,
  type AttendanceListQuery,
} from '../repositories/attendance.repository.js';
import type {
  ClockActionInput,
  CreateAttendanceInput,
  CreateHolidayInput,
  CreateOvertimeInput,
  CreateShiftInput,
  ReviewOvertimeInput,
  UpdateAttendanceInput,
  UpdateHolidayInput,
  UpdateShiftInput,
} from '../validators/attendance.validators.js';

type AuthActor = { id: string; permissions: string[] };

type ClockContext = { clientIp: string };

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseTimeOnDate(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0, 0));
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export class AttendanceService {
  constructor(private readonly repo = new AttendanceRepository()) {}

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

  private async resolveSelfEmployeeId(companyId: string, actorId: string): Promise<string> {
    const linked = await this.repo.findEmployeeByUserId(companyId, actorId);
    if (!linked) {
      throw new ValidationError(
        'No employee profile linked to your account. Contact HR to link your user before clocking in.',
      );
    }
    return linked.id;
  }

  private async assertAllowedBranchIp(
    companyId: string,
    employeeId: string,
    clientIp: string,
  ): Promise<{ branchId: string; branchName: string }> {
    const employee = await this.repo.findEmployeeForClock(companyId, employeeId);
    if (!employee) {
      throw new ValidationError('Employee profile not found');
    }
    if (!employee.branchId || !employee.branch) {
      throw new ValidationError(
        'Your employee profile has no branch assigned. Contact HR to assign a branch before clocking in.',
      );
    }

    const allowed = await this.repo.listBranchAllowedCidrs(employee.branchId);
    if (!allowed.length) {
      throw new ForbiddenError(
        'Clock in/out is not available: your branch has no authorized office IP addresses configured. Please contact HR.',
      );
    }

    const rules = allowed.map((row) => row.cidr);
    if (!isIpAllowed(clientIp, rules)) {
      throw new ForbiddenError(
        'Clock in/out is only allowed from your branch office network. Your current location is not on an authorized IP address. If you are at the office, please contact HR.',
      );
    }

    return { branchId: employee.branchId, branchName: employee.branch.name };
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

  private async computeMetrics(
    companyId: string,
    input: {
      date: Date;
      checkInAt?: Date | null;
      checkOutAt?: Date | null;
      shiftId?: string | null;
      status?: AttendanceStatus;
    },
  ) {
    const day = startOfUtcDay(input.date);
    let shift =
      (input.shiftId ? await this.repo.findShift(companyId, input.shiftId) : null) ??
      (await this.repo.findDefaultShift(companyId));

    let status: AttendanceStatus = input.status ?? 'ABSENT';
    let workMinutes = 0;
    let overtimeMinutes = 0;
    let lateMinutes = 0;

    if (input.checkInAt && input.checkOutAt && input.checkOutAt < input.checkInAt) {
      throw new ValidationError('Check-out must be after check-in');
    }

    if (input.checkInAt) {
      status = input.status ?? 'PRESENT';
      if (shift) {
        const expectedStart = parseTimeOnDate(day, shift.startTime);
        const graceEnd = new Date(expectedStart.getTime() + shift.graceMinutes * 60000);
        if (input.checkInAt > graceEnd) {
          lateMinutes = minutesBetween(expectedStart, input.checkInAt);
          status = input.status ?? 'LATE';
        }
      }
    }

    if (input.checkInAt && input.checkOutAt) {
      workMinutes = minutesBetween(input.checkInAt, input.checkOutAt);
      if (shift) {
        workMinutes = Math.max(0, workMinutes - shift.breakMinutes);
        const expectedEnd = parseTimeOnDate(day, shift.endTime);
        const expectedStart = parseTimeOnDate(day, shift.startTime);
        let expectedWork = minutesBetween(expectedStart, expectedEnd) - shift.breakMinutes;
        if (expectedWork < 0) expectedWork = 0;
        overtimeMinutes = Math.max(0, workMinutes - expectedWork);
        if (!input.status && workMinutes < expectedWork * 0.5) {
          status = 'HALF_DAY';
        }
      }
    }

    if (!input.checkInAt && !input.status) {
      const holiday = await this.repo.findHolidayByDate(companyId, day);
      if (holiday) status = 'HOLIDAY';
      else if (day.getUTCDay() === 0 || day.getUTCDay() === 6) status = 'WEEKEND';
      else status = 'ABSENT';
    }

    return {
      day,
      shiftId: shift?.id ?? input.shiftId ?? null,
      status,
      workMinutes,
      overtimeMinutes,
      lateMinutes,
    };
  }

  private parseListQuery(params: Record<string, string | undefined>): AttendanceListQuery {
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20) || 20));
    return {
      page,
      pageSize,
      search: params.search?.trim() || undefined,
      status: (params.status as AttendanceStatus | undefined) || undefined,
      employeeId: params.employeeId || undefined,
      departmentId: params.departmentId || undefined,
      dateFrom: params.dateFrom ? startOfUtcDay(new Date(params.dateFrom)) : undefined,
      dateTo: params.dateTo ? startOfUtcDay(new Date(params.dateTo)) : undefined,
      sortDir: params.sortDir === 'asc' ? 'asc' : 'desc',
    };
  }

  async getSummary(actor: AuthActor, date?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const day = startOfUtcDay(date ? new Date(date) : new Date());
    const rows = await this.repo.summaryCounts(companyId, day, day);
    const byStatus: Record<string, number> = {};
    let workMinutes = 0;
    let overtimeMinutes = 0;
    for (const row of rows) {
      byStatus[row.status] = row._count._all;
      workMinutes += row._sum.workMinutes ?? 0;
      overtimeMinutes += row._sum.overtimeMinutes ?? 0;
    }
    const present =
      (byStatus.PRESENT ?? 0) + (byStatus.LATE ?? 0) + (byStatus.REMOTE ?? 0) + (byStatus.HALF_DAY ?? 0);
    return {
      date: day.toISOString(),
      present,
      absent: byStatus.ABSENT ?? 0,
      late: byStatus.LATE ?? 0,
      onLeave: byStatus.ON_LEAVE ?? 0,
      remote: byStatus.REMOTE ?? 0,
      halfDay: byStatus.HALF_DAY ?? 0,
      holiday: byStatus.HOLIDAY ?? 0,
      workHours: Math.round((workMinutes / 60) * 10) / 10,
      overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
      byStatus,
    };
  }

  async list(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const query = this.parseListQuery(params);
    const [items, total] = await this.repo.listAttendance(companyId, query);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize) || 1,
      },
    };
  }

  async getById(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const record = await this.repo.findAttendance(companyId, id);
    if (!record) throw new NotFoundError('Attendance record not found');
    return record;
  }

  async getMyToday(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    const day = startOfUtcDay(new Date());
    const record = await this.repo.findAttendanceByEmployeeDate(companyId, employeeId, day);
    const shift = (await this.repo.findDefaultShift(companyId)) ?? null;
    return { date: day.toISOString(), employeeId, shift, record };
  }

  async create(actor: AuthActor, input: CreateAttendanceInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    const metrics = await this.computeMetrics(companyId, input);
    try {
      const record = await this.repo.createAttendance(companyId, {
        ...input,
        date: metrics.day,
        shiftId: metrics.shiftId,
        status: metrics.status,
        workMinutes: metrics.workMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        lateMinutes: metrics.lateMinutes,
        source: input.source ?? 'MANUAL',
      });
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'attendance.create',
        entityType: 'AttendanceRecord',
        entityId: record.id,
      });
      return record;
    } catch (error) {
      this.rethrowUnique(error, 'Attendance already exists for this employee and date');
    }
  }

  async update(actor: AuthActor, id: string, input: UpdateAttendanceInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findAttendance(companyId, id);
    if (!existing) throw new NotFoundError('Attendance record not found');

    const metrics = await this.computeMetrics(companyId, {
      date: input.date ?? existing.date,
      checkInAt: input.checkInAt !== undefined ? input.checkInAt : existing.checkInAt,
      checkOutAt: input.checkOutAt !== undefined ? input.checkOutAt : existing.checkOutAt,
      shiftId: input.shiftId !== undefined ? input.shiftId : existing.shiftId,
      status: input.status,
    });

    const record = await this.repo.updateAttendance(id, {
      ...input,
      shiftId: metrics.shiftId,
      status: metrics.status,
      workMinutes: metrics.workMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.update',
      entityType: 'AttendanceRecord',
      entityId: id,
    });
    return record;
  }

  async remove(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findAttendance(companyId, id);
    if (!existing) throw new NotFoundError('Attendance record not found');
    await this.repo.softDeleteAttendance(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.delete',
      entityType: 'AttendanceRecord',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async clockIn(actor: AuthActor, input: ClockActionInput, context: ClockContext) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveSelfEmployeeId(companyId, actor.id);
    const branch = await this.assertAllowedBranchIp(companyId, employeeId, context.clientIp);
    const at = new Date();
    const day = startOfUtcDay(at);
    const existing = await this.repo.findAttendanceByEmployeeDate(companyId, employeeId, day);
    if (existing?.checkInAt) {
      throw new ConflictError('Already clocked in for today');
    }

    const metrics = await this.computeMetrics(companyId, {
      date: day,
      checkInAt: at,
      checkOutAt: null,
    });

    if (existing) {
      const record = await this.repo.updateAttendance(existing.id, {
        checkInAt: at,
        checkInIp: context.clientIp,
        shiftId: metrics.shiftId,
        status: metrics.status,
        workMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: metrics.lateMinutes,
        notes: input.notes,
        source: 'CLOCK',
      });
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'attendance.clock_in',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        metadata: { clientIp: context.clientIp, branchId: branch.branchId },
      });
      return record;
    }

    try {
      const record = await this.repo.createAttendance(companyId, {
        employeeId,
        date: day,
        shiftId: metrics.shiftId,
        checkInAt: at,
        checkOutAt: null,
        checkInIp: context.clientIp,
        status: metrics.status,
        workMinutes: 0,
        overtimeMinutes: 0,
        lateMinutes: metrics.lateMinutes,
        notes: input.notes,
        source: 'CLOCK',
      });
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'attendance.clock_in',
        entityType: 'AttendanceRecord',
        entityId: record.id,
        metadata: { clientIp: context.clientIp, branchId: branch.branchId },
      });
      return record;
    } catch (error) {
      this.rethrowUnique(error, 'Attendance already exists for this employee and date');
    }
  }

  async clockOut(actor: AuthActor, input: ClockActionInput, context: ClockContext) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveSelfEmployeeId(companyId, actor.id);
    const branch = await this.assertAllowedBranchIp(companyId, employeeId, context.clientIp);
    const at = new Date();
    const day = startOfUtcDay(at);
    const existing = await this.repo.findAttendanceByEmployeeDate(companyId, employeeId, day);
    if (!existing?.checkInAt) {
      throw new ValidationError('Clock in first before clocking out');
    }
    if (existing.checkOutAt) {
      throw new ConflictError('Already clocked out for today');
    }

    const metrics = await this.computeMetrics(companyId, {
      date: day,
      checkInAt: existing.checkInAt,
      checkOutAt: at,
      shiftId: existing.shiftId,
    });

    const record = await this.repo.updateAttendance(existing.id, {
      checkOutAt: at,
      checkOutIp: context.clientIp,
      status: metrics.status,
      workMinutes: metrics.workMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      notes: input.notes ?? existing.notes,
      source: 'CLOCK',
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.clock_out',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      metadata: { clientIp: context.clientIp, branchId: branch.branchId },
    });
    return record;
  }

  async getTimesheet(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, params.employeeId);
    const dateTo = startOfUtcDay(params.dateTo ? new Date(params.dateTo) : new Date());
    const dateFrom = params.dateFrom
      ? startOfUtcDay(new Date(params.dateFrom))
      : new Date(Date.UTC(dateTo.getUTCFullYear(), dateTo.getUTCMonth(), 1));
    const items = await this.repo.timesheet(companyId, employeeId, dateFrom, dateTo);
    const totals = items.reduce(
      (acc, row) => {
        acc.workMinutes += row.workMinutes;
        acc.overtimeMinutes += row.overtimeMinutes;
        acc.lateMinutes += row.lateMinutes;
        return acc;
      },
      { workMinutes: 0, overtimeMinutes: 0, lateMinutes: 0 },
    );
    return { employeeId, dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), items, totals };
  }

  // Shifts
  async listShifts(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return { items: await this.repo.listShifts(companyId) };
  }

  async createShift(actor: AuthActor, input: CreateShiftInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const shift = await this.repo.createShift(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'attendance.shift.create',
        entityType: 'Shift',
        entityId: shift.id,
      });
      return shift;
    } catch (error) {
      this.rethrowUnique(error, 'Shift code already exists');
    }
  }

  async updateShift(actor: AuthActor, id: string, input: UpdateShiftInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findShift(companyId, id);
    if (!existing) throw new NotFoundError('Shift not found');
    try {
      return await this.repo.updateShift(id, companyId, input);
    } catch (error) {
      this.rethrowUnique(error, 'Shift code already exists');
    }
  }

  async deleteShift(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findShift(companyId, id);
    if (!existing) throw new NotFoundError('Shift not found');
    await this.repo.softDeleteShift(id);
    return { id, deleted: true };
  }

  // Holidays
  async listHolidays(actor: AuthActor, year?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const y = year ? Number(year) : new Date().getUTCFullYear();
    return { items: await this.repo.listHolidays(companyId, y) };
  }

  async createHoliday(actor: AuthActor, input: CreateHolidayInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const holiday = await this.repo.createHoliday(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'attendance.holiday.create',
        entityType: 'Holiday',
        entityId: holiday.id,
      });
      return holiday;
    } catch (error) {
      this.rethrowUnique(error, 'Holiday already exists for this date');
    }
  }

  async updateHoliday(actor: AuthActor, id: string, input: UpdateHolidayInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findHoliday(companyId, id);
    if (!existing) throw new NotFoundError('Holiday not found');
    try {
      return await this.repo.updateHoliday(id, input);
    } catch (error) {
      this.rethrowUnique(error, 'Holiday already exists for this date');
    }
  }

  async deleteHoliday(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findHoliday(companyId, id);
    if (!existing) throw new NotFoundError('Holiday not found');
    await this.repo.softDeleteHoliday(id);
    return { id, deleted: true };
  }

  // Overtime
  async listOvertime(actor: AuthActor, status?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    return {
      items: await this.repo.listOvertime(
        companyId,
        status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
      ),
    };
  }

  async createOvertime(actor: AuthActor, input: CreateOvertimeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    const request = await this.repo.createOvertime(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.overtime.create',
      entityType: 'OvertimeRequest',
      entityId: request.id,
    });
    return request;
  }

  async approveOvertime(actor: AuthActor, id: string, input: ReviewOvertimeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findOvertime(companyId, id);
    if (!existing) throw new NotFoundError('Overtime request not found');
    if (existing.status !== 'PENDING') throw new ValidationError('Request already reviewed');
    const updated = await this.repo.reviewOvertime(id, 'APPROVED', actor.id, input.reviewNotes);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.overtime.approve',
      entityType: 'OvertimeRequest',
      entityId: id,
    });
    return updated;
  }

  async rejectOvertime(actor: AuthActor, id: string, input: ReviewOvertimeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findOvertime(companyId, id);
    if (!existing) throw new NotFoundError('Overtime request not found');
    if (existing.status !== 'PENDING') throw new ValidationError('Request already reviewed');
    const updated = await this.repo.reviewOvertime(id, 'REJECTED', actor.id, input.reviewNotes);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'attendance.overtime.reject',
      entityType: 'OvertimeRequest',
      entityId: id,
    });
    return updated;
  }

  async getReport(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const dateTo = startOfUtcDay(params.dateTo ? new Date(params.dateTo) : new Date());
    const dateFrom = params.dateFrom
      ? startOfUtcDay(new Date(params.dateFrom))
      : new Date(Date.UTC(dateTo.getUTCFullYear(), dateTo.getUTCMonth(), dateTo.getUTCDate() - 6));
    const rows = await this.repo.summaryCounts(companyId, dateFrom, dateTo);
    return {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      rows: rows.map((row) => ({
        status: row.status,
        count: row._count._all,
        workMinutes: row._sum.workMinutes ?? 0,
        overtimeMinutes: row._sum.overtimeMinutes ?? 0,
      })),
    };
  }
}
