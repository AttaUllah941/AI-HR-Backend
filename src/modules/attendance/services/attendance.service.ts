import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import {
  AttendanceRepository,
  startOfDay,
  type AttendanceWithEmployee,
} from '../repositories/attendance.repository.js';
import type {
  AttendanceCalendarQuery,
  AttendanceCheckInsQuery,
  AttendanceListQuery,
  CreateAttendanceInput,
  UpdateAttendanceInput,
} from '../validators/attendance.validators.js';

function toDto(record: AttendanceWithEmployee) {
  return {
    id: record.id,
    companyId: record.companyId,
    employeeId: record.employeeId,
    workDate: record.workDate,
    status: record.status,
    checkInAt: record.checkInAt,
    checkOutAt: record.checkOutAt,
    locationLabel: record.locationLabel,
    notes: record.notes,
    employee: {
      id: record.employee.id,
      firstName: record.employee.firstName,
      lastName: record.employee.lastName,
      email: record.employee.email,
      position: record.employee.position,
      initials: `${record.employee.firstName.charAt(0)}${record.employee.lastName.charAt(0)}`.toUpperCase(),
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const EMPTY_SUMMARY = {
  present: 0,
  late: 0,
  absent: 0,
  remote: 0,
  onLeave: 0,
  totalMarked: 0,
  workforce: 0,
};

export class AttendanceService {
  constructor(private readonly repo = new AttendanceRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  async summary(userId: string, date?: Date) {
    const companyId = await this.requireCompanyId(userId);
    const workDate = startOfDay(date ?? new Date());
    const [groups, workforce] = await Promise.all([
      this.repo.summarizeByStatus(companyId, workDate),
      this.repo.countActiveEmployees(companyId),
    ]);

    const summary = { ...EMPTY_SUMMARY, workforce, date: workDate.toISOString().slice(0, 10) };
    for (const group of groups) {
      const count = group._count._all;
      summary.totalMarked += count;
      switch (group.status) {
        case 'PRESENT':
          summary.present = count;
          break;
        case 'LATE':
          summary.late = count;
          break;
        case 'ABSENT':
          summary.absent = count;
          break;
        case 'REMOTE':
          summary.remote = count;
          break;
        case 'ON_LEAVE':
          summary.onLeave = count;
          break;
      }
    }
    return summary;
  }

  async checkIns(userId: string, query: AttendanceCheckInsQuery) {
    const companyId = await this.requireCompanyId(userId);
    const workDate = startOfDay(query.date ?? new Date());
    const items = await this.repo.listCheckIns(companyId, workDate, query.limit);
    return {
      date: workDate.toISOString().slice(0, 10),
      items: items.map(toDto),
    };
  }

  async calendar(userId: string, query: AttendanceCalendarQuery) {
    const companyId = await this.requireCompanyId(userId);
    const rows = await this.repo.listMonth(companyId, query.year, query.month);
    const byDay = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const key = row.workDate.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? {};
      bucket[row.status] = (bucket[row.status] ?? 0) + 1;
      byDay.set(key, bucket);
    }

    const days = [...byDay.entries()]
      .map(([date, counts]) => {
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return { date, total, counts, dominant };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      year: query.year,
      month: query.month,
      days,
    };
  }

  async list(userId: string, query: AttendanceListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.list(companyId, {
      workDate: query.date,
      status: query.status,
      search: query.search,
      skip,
      take: query.pageSize,
    });

    return {
      items: items.map(toDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async create(userId: string, input: CreateAttendanceInput) {
    const companyId = await this.requireCompanyId(userId);
    const employee = await this.repo.findEmployee(companyId, input.employeeId);
    if (!employee) {
      throw new ValidationError('Employee not found');
    }

    const record = await this.repo.upsert({
      companyId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status,
      checkInAt: input.checkInAt,
      checkOutAt: input.checkOutAt,
      locationLabel: input.locationLabel,
      notes: input.notes,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'attendance.upsert',
      entityType: 'AttendanceRecord',
      entityId: record.id,
    });

    return toDto(record);
  }

  async update(userId: string, id: string, input: UpdateAttendanceInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Attendance record not found');
    }

    const record = await this.repo.update(id, {
      status: input.status,
      checkInAt: input.checkInAt === null ? null : input.checkInAt,
      checkOutAt: input.checkOutAt === null ? null : input.checkOutAt,
      locationLabel: input.locationLabel,
      notes: input.notes,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'attendance.update',
      entityType: 'AttendanceRecord',
      entityId: record.id,
    });

    return toDto(record);
  }

  async remove(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Attendance record not found');
    }

    await this.repo.softDelete(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'attendance.delete',
      entityType: 'AttendanceRecord',
      entityId: id,
    });

    return { deleted: true };
  }
}
