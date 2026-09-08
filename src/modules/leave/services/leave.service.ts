import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import {
  LeaveRepository,
  startOfDay,
  type LeaveRequestWithEmployee,
} from '../repositories/leave.repository.js';
import type {
  CreateLeaveRequestInput,
  LeaveHolidaysQuery,
  LeaveListQuery,
  LeavePendingQuery,
  UpdateLeaveRequestInput,
} from '../validators/leave.validators.js';

const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: 'Annual Balance',
  SICK: 'Sick Leave',
  PERSONAL: 'Personal',
};

function inclusiveDayCount(start: Date, end: Date): number {
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  return Math.floor((e - s) / 86_400_000) + 1;
}

function toDto(record: LeaveRequestWithEmployee) {
  return {
    id: record.id,
    companyId: record.companyId,
    employeeId: record.employeeId,
    leaveType: record.leaveType,
    startDate: record.startDate,
    endDate: record.endDate,
    dayCount: record.dayCount,
    reason: record.reason,
    status: record.status,
    reviewedById: record.reviewedById,
    reviewedAt: record.reviewedAt,
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

export class LeaveService {
  constructor(private readonly repo = new LeaveRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  async summary(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const year = new Date().getUTCFullYear();
    const [policies, pendingCount] = await Promise.all([
      this.repo.listPolicies(companyId, year),
      this.repo.countByStatus(companyId, 'PENDING'),
    ]);

    const balances = (['ANNUAL', 'SICK', 'PERSONAL'] as const).map((leaveType) => {
      const policy = policies.find((row) => row.leaveType === leaveType);
      const allotted = policy?.allottedDays ?? 0;
      const used = policy?.usedDays ?? 0;
      return {
        leaveType,
        label: LEAVE_LABELS[leaveType],
        allotted,
        used,
        remaining: Math.max(0, allotted - used),
      };
    });

    return { year, balances, pendingCount };
  }

  async pending(userId: string, query: LeavePendingQuery) {
    const companyId = await this.requireCompanyId(userId);
    const items = await this.repo.listPending(companyId, query.limit);
    return { items: items.map(toDto) };
  }

  async holidays(userId: string, query: LeaveHolidaysQuery) {
    const companyId = await this.requireCompanyId(userId);
    const from = query.from ?? new Date();
    const items = await this.repo.listHolidays(companyId, from, query.limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        name: row.name,
        holidayDate: row.holidayDate,
        regionLabel: row.regionLabel,
      })),
    };
  }

  async list(userId: string, query: LeaveListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.list(companyId, {
      status: query.status,
      leaveType: query.leaveType,
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

  async create(userId: string, input: CreateLeaveRequestInput) {
    const companyId = await this.requireCompanyId(userId);
    const employee = await this.repo.findEmployee(companyId, input.employeeId);
    if (!employee) {
      throw new ValidationError('Employee not found');
    }

    const dayCount = inclusiveDayCount(input.startDate, input.endDate);
    const record = await this.repo.create({
      companyId,
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      dayCount,
      reason: input.reason,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'leave.create',
      entityType: 'LeaveRequest',
      entityId: record.id,
    });

    return toDto(record);
  }

  async update(userId: string, id: string, input: UpdateLeaveRequestInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Leave request not found');
    }

    const nextStart = input.startDate ?? existing.startDate;
    const nextEnd = input.endDate ?? existing.endDate;
    const dayCount =
      input.startDate || input.endDate
        ? inclusiveDayCount(nextStart, nextEnd)
        : existing.dayCount;

    const previousStatus = existing.status;
    const nextStatus = input.status ?? previousStatus;

    const record = await this.repo.update(id, {
      leaveType: input.leaveType,
      startDate: input.startDate ? startOfDay(input.startDate) : undefined,
      endDate: input.endDate ? startOfDay(input.endDate) : undefined,
      dayCount,
      reason: input.reason === null ? null : input.reason,
      status: input.status,
      ...(input.status && input.status !== 'PENDING'
        ? { reviewedById: userId, reviewedAt: new Date() }
        : {}),
    });

    if (previousStatus !== 'APPROVED' && nextStatus === 'APPROVED') {
      await this.repo.adjustPolicyUsed(
        companyId,
        record.leaveType,
        new Date().getUTCFullYear(),
        record.dayCount,
      );
    } else if (previousStatus === 'APPROVED' && nextStatus !== 'APPROVED') {
      await this.repo.adjustPolicyUsed(
        companyId,
        existing.leaveType,
        new Date().getUTCFullYear(),
        -existing.dayCount,
      );
    }

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'leave.update',
      entityType: 'LeaveRequest',
      entityId: record.id,
      metadata: { status: nextStatus },
    });

    return toDto(record);
  }

  async remove(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Leave request not found');
    }

    if (existing.status === 'APPROVED') {
      await this.repo.adjustPolicyUsed(
        companyId,
        existing.leaveType,
        new Date().getUTCFullYear(),
        -existing.dayCount,
      );
    }

    await this.repo.softDelete(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'leave.delete',
      entityType: 'LeaveRequest',
      entityId: id,
    });

    return { deleted: true };
  }
}
