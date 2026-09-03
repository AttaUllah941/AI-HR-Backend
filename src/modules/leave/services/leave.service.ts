import type { LeaveDayType, LeaveRequestStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { LeaveRepository } from '../repositories/leave.repository.js';
import type {
  CreateLeaveRequestInput,
  CreateLeaveTypeInput,
  ReviewLeaveRequestInput,
  UpdateLeavePolicyInput,
  UpdateLeaveRequestInput,
  UpdateLeaveTypeInput,
  UpsertLeaveBalanceInput,
} from '../validators/leave.validators.js';

type AuthActor = { id: string; permissions: string[] };
type DbClient = Prisma.TransactionClient;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function isComplementaryHalfDay(
  a: LeaveDayType,
  b: LeaveDayType,
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  const sameSingleDay =
    aStart.getTime() === aEnd.getTime() &&
    bStart.getTime() === bEnd.getTime() &&
    aStart.getTime() === bStart.getTime();
  return (
    sameSingleDay &&
    a !== 'FULL_DAY' &&
    b !== 'FULL_DAY' &&
    a !== b
  );
}

export class LeaveService {
  constructor(private readonly repo = new LeaveRepository()) {}

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

  private canManageOthers(actor: AuthActor): boolean {
    return (
      actor.permissions.includes('leave:update') || actor.permissions.includes('leave:approve')
    );
  }

  private async resolveRequestEmployeeId(
    companyId: string,
    actor: AuthActor,
    employeeId?: string | null,
  ): Promise<string> {
    if (employeeId) {
      if (!this.canManageOthers(actor)) {
        const linked = await this.repo.findEmployeeByUserId(companyId, actor.id);
        if (!linked || linked.id !== employeeId) {
          throw new ForbiddenError('You can only submit leave for your own employee profile');
        }
        return linked.id;
      }
      const employee = await this.repo.findEmployeeBasic(companyId, employeeId);
      if (!employee) throw new ValidationError('Invalid employee');
      return employee.id;
    }
    return this.resolveEmployeeId(companyId, actor.id, null);
  }

  private async calculateDays(
    companyId: string,
    startDate: Date,
    endDate: Date,
    dayType: LeaveDayType,
  ): Promise<number> {
    const start = startOfUtcDay(startDate);
    const end = startOfUtcDay(endDate);
    if (end < start) {
      throw new ValidationError('End date must be on or after start date');
    }

    if (dayType !== 'FULL_DAY') {
      if (start.getTime() !== end.getTime()) {
        throw new ValidationError('Half-day leave must be for a single date');
      }
      return 0.5;
    }

    const policy = (await this.repo.findPolicy(companyId)) ?? {
      countWeekends: false,
      countHolidays: false,
    };

    const holidays = policy.countHolidays
      ? []
      : (await this.repo.listHolidaysBetween(companyId, start, end)).map((h) =>
          startOfUtcDay(h.date).getTime(),
        );
    const holidaySet = new Set(holidays);

    let days = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      const current = new Date(t);
      const dow = current.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      if (!policy.countWeekends && isWeekend) continue;
      if (!policy.countHolidays && holidaySet.has(t)) continue;
      days += 1;
    }

    if (days <= 0) {
      throw new ValidationError('Selected range has no countable leave days');
    }
    return days;
  }

  private async ensureBalance(
    companyId: string,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    leaveTypeMaxDays: number,
    db?: DbClient,
  ) {
    const existing = await this.repo.findBalance(companyId, employeeId, leaveTypeId, year, db);
    if (existing) return existing;
    return this.repo.upsertBalance(
      companyId,
      {
        employeeId,
        leaveTypeId,
        year,
        entitled: leaveTypeMaxDays,
        carriedForward: 0,
      },
      db,
    );
  }

  private available(balance: {
    entitled: number;
    carriedForward: number;
    used: number;
    pending: number;
  }) {
    return balance.entitled + balance.carriedForward - balance.used - balance.pending;
  }

  private async assertNoOverlap(
    companyId: string,
    employeeId: string,
    startDate: Date,
    endDate: Date,
    dayType: LeaveDayType,
    excludeId?: string,
    db?: DbClient,
  ) {
    const overlap = await this.repo.findOverlappingRequests(
      companyId,
      employeeId,
      startDate,
      endDate,
      excludeId,
      db,
    );
    if (!overlap) return;

    if (
      isComplementaryHalfDay(
        dayType,
        overlap.dayType,
        startDate,
        endDate,
        startOfUtcDay(overlap.startDate),
        startOfUtcDay(overlap.endDate),
      )
    ) {
      return;
    }

    throw new ConflictError('A leave request already exists for overlapping dates');
  }

  // —— Types ——
  async listTypes(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return { items: await this.repo.listTypes(companyId) };
  }

  async createType(actor: AuthActor, input: CreateLeaveTypeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const type = await this.repo.createType(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'leave.type.create',
        entityType: 'LeaveType',
        entityId: type.id,
      });
      return type;
    } catch (error) {
      this.rethrowUnique(error, 'Leave type code already exists');
    }
  }

  async updateType(actor: AuthActor, id: string, input: UpdateLeaveTypeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findType(companyId, id);
    if (!existing) throw new NotFoundError('Leave type not found');
    try {
      const type = await this.repo.updateType(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'leave.type.update',
        entityType: 'LeaveType',
        entityId: id,
      });
      return type;
    } catch (error) {
      this.rethrowUnique(error, 'Leave type code already exists');
    }
  }

  async deleteType(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findType(companyId, id);
    if (!existing) throw new NotFoundError('Leave type not found');

    const openRequests = await this.repo.countOpenRequestsForType(companyId, id);
    if (openRequests > 0) {
      throw new ValidationError(
        'Cannot delete a leave type that has pending or approved requests. Deactivate it instead.',
      );
    }

    await this.repo.softDeleteType(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.type.delete',
      entityType: 'LeaveType',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— Policy ——
  async getPolicy(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return this.repo.upsertPolicy(companyId);
  }

  async updatePolicy(actor: AuthActor, input: UpdateLeavePolicyInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const policy = await this.repo.upsertPolicy(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.policy.update',
      entityType: 'LeavePolicy',
      entityId: policy.id,
    });
    return policy;
  }

  // —— Balances ——
  async listBalances(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const year = params.year ? Number(params.year) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    let employeeId = params.employeeId || undefined;
    if (!this.canManageOthers(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else if (employeeId) {
      await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }

    const items = await this.repo.listBalances(companyId, year, employeeId);
    return {
      items: items.map((item) => ({
        ...item,
        available: this.available(item),
      })),
    };
  }

  async upsertBalance(actor: AuthActor, input: UpsertLeaveBalanceInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    const leaveType = await this.repo.findType(companyId, input.leaveTypeId);
    if (!leaveType) throw new ValidationError('Invalid leave type');

    const existing = await this.repo.findBalance(
      companyId,
      input.employeeId,
      input.leaveTypeId,
      input.year,
    );

    const balance = await this.repo.upsertBalance(companyId, {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      ...(input.entitled !== undefined
        ? { entitled: input.entitled }
        : !existing
          ? { entitled: leaveType.maxDaysPerYear }
          : {}),
      ...(input.carriedForward !== undefined
        ? { carriedForward: input.carriedForward }
        : !existing
          ? { carriedForward: 0 }
          : {}),
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.balance.upsert',
      entityType: 'LeaveBalance',
      entityId: balance.id,
    });
    return { ...balance, available: this.available(balance) };
  }

  // —— Requests ——
  async listRequests(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));

    let employeeId = params.employeeId || undefined;
    if (!this.canManageOthers(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    }

    const dateFrom = params.dateFrom ? startOfUtcDay(new Date(params.dateFrom)) : undefined;
    const dateTo = params.dateTo ? startOfUtcDay(new Date(params.dateTo)) : undefined;
    if (dateFrom && Number.isNaN(dateFrom.getTime())) {
      throw new ValidationError('Invalid dateFrom');
    }
    if (dateTo && Number.isNaN(dateTo.getTime())) {
      throw new ValidationError('Invalid dateTo');
    }

    const status = params.status as LeaveRequestStatus | undefined;
    if (
      status &&
      !['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)
    ) {
      throw new ValidationError('Invalid status');
    }

    const { items, total } = await this.repo.listRequests(companyId, {
      page,
      pageSize,
      status: status || undefined,
      employeeId,
      leaveTypeId: params.leaveTypeId || undefined,
      dateFrom,
      dateTo,
    });

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async getRequest(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const request = await this.repo.findRequest(companyId, id);
    if (!request) throw new NotFoundError('Leave request not found');
    if (!this.canManageOthers(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (request.employeeId !== selfId) {
        throw new ForbiddenError('You can only view your own leave requests');
      }
    }
    return request;
  }

  async createRequest(actor: AuthActor, input: CreateLeaveRequestInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveRequestEmployeeId(companyId, actor, input.employeeId);
    const leaveType = await this.repo.findType(companyId, input.leaveTypeId);
    if (!leaveType || !leaveType.isActive) {
      throw new ValidationError('Invalid or inactive leave type');
    }

    const dayType: LeaveDayType = input.dayType ?? 'FULL_DAY';
    if (dayType !== 'FULL_DAY' && !leaveType.allowHalfDay) {
      throw new ValidationError('Half-day leave is not allowed for this leave type');
    }

    const startDate = startOfUtcDay(input.startDate);
    const endDate = startOfUtcDay(input.endDate);
    const policy = await this.repo.upsertPolicy(companyId);

    const noticeDays = daysBetweenInclusive(startOfUtcDay(new Date()), startDate) - 1;
    if (policy.minNoticeDays > 0 && noticeDays < policy.minNoticeDays) {
      throw new ValidationError(
        `Leave must be requested at least ${policy.minNoticeDays} day(s) in advance`,
      );
    }

    const days = await this.calculateDays(companyId, startDate, endDate, dayType);
    await this.assertNoOverlap(companyId, employeeId, startDate, endDate, dayType);

    const year = startDate.getUTCFullYear();
    const status: LeaveRequestStatus = leaveType.requiresApproval ? 'PENDING' : 'APPROVED';

    const requestId = await this.repo.runTransaction(async (tx) => {
      const balance = await this.ensureBalance(
        companyId,
        employeeId,
        leaveType.id,
        year,
        leaveType.maxDaysPerYear,
        tx,
      );

      const available = this.available(balance);
      if (!policy.allowNegativeBalance && days > available) {
        throw new ValidationError(
          `Insufficient leave balance. Available: ${available} day(s), requested: ${days}`,
        );
      }

      await this.assertNoOverlap(companyId, employeeId, startDate, endDate, dayType, undefined, tx);

      const request = await this.repo.createRequest(
        companyId,
        {
          ...input,
          employeeId,
          startDate,
          endDate,
          dayType,
          days,
          status,
        },
        tx,
      );

      await this.repo.adjustBalancePending(balance.id, days, tx);

      if (status === 'APPROVED') {
        await this.repo.movePendingToUsed(balance.id, days, tx);
        await this.repo.updateRequest(
          request.id,
          {
            reviewedBy: actor.id,
            reviewedAt: new Date(),
            reviewNotes: 'Auto-approved (approval not required)',
          },
          tx,
        );
      }

      return request.id;
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.request.create',
      entityType: 'LeaveRequest',
      entityId: requestId,
    });

    return this.repo.findRequest(companyId, requestId);
  }

  async updateRequest(actor: AuthActor, id: string, input: UpdateLeaveRequestInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRequest(companyId, id);
    if (!existing) throw new NotFoundError('Leave request not found');
    if (existing.status !== 'PENDING') {
      throw new ValidationError('Only pending leave requests can be updated');
    }

    if (!this.canManageOthers(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only update your own leave requests');
      }
    }

    const leaveTypeId = input.leaveTypeId ?? existing.leaveTypeId;
    const leaveType = await this.repo.findType(companyId, leaveTypeId);
    if (!leaveType || !leaveType.isActive) throw new ValidationError('Invalid leave type');

    const dayType: LeaveDayType = input.dayType ?? existing.dayType;
    if (dayType !== 'FULL_DAY' && !leaveType.allowHalfDay) {
      throw new ValidationError('Half-day leave is not allowed for this leave type');
    }

    const startDate = startOfUtcDay(input.startDate ?? existing.startDate);
    const endDate = startOfUtcDay(input.endDate ?? existing.endDate);
    const days = await this.calculateDays(companyId, startDate, endDate, dayType);

    await this.assertNoOverlap(
      companyId,
      existing.employeeId,
      startDate,
      endDate,
      dayType,
      existing.id,
    );

    const oldYear = startOfUtcDay(existing.startDate).getUTCFullYear();
    const newYear = startDate.getUTCFullYear();
    const policy = await this.repo.upsertPolicy(companyId);

    await this.repo.runTransaction(async (tx) => {
      const oldBalance = await this.ensureBalance(
        companyId,
        existing.employeeId,
        existing.leaveTypeId,
        oldYear,
        existing.leaveType.maxDaysPerYear,
        tx,
      );
      await this.repo.adjustBalancePending(oldBalance.id, -existing.days, tx);

      const newBalance = await this.ensureBalance(
        companyId,
        existing.employeeId,
        leaveTypeId,
        newYear,
        leaveType.maxDaysPerYear,
        tx,
      );

      // Re-read after releasing old pending (same row when type/year unchanged)
      const refreshed =
        (await this.repo.findBalance(
          companyId,
          existing.employeeId,
          leaveTypeId,
          newYear,
          tx,
        )) ?? newBalance;

      if (!policy.allowNegativeBalance && days > this.available(refreshed)) {
        throw new ValidationError('Insufficient leave balance for the updated request');
      }

      await this.repo.adjustBalancePending(refreshed.id, days, tx);
      await this.repo.updateRequest(
        id,
        {
          ...input,
          leaveTypeId,
          startDate,
          endDate,
          dayType,
          days,
        },
        tx,
      );
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.request.update',
      entityType: 'LeaveRequest',
      entityId: id,
    });
    return this.repo.findRequest(companyId, id);
  }

  async approveRequest(actor: AuthActor, id: string, input: ReviewLeaveRequestInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRequest(companyId, id);
    if (!existing) throw new NotFoundError('Leave request not found');
    if (existing.status !== 'PENDING') {
      throw new ValidationError('Only pending requests can be approved');
    }

    const linked = await this.repo.findEmployeeByUserId(companyId, actor.id);
    if (linked && linked.id === existing.employeeId) {
      throw new ForbiddenError('You cannot approve your own leave request');
    }

    const year = startOfUtcDay(existing.startDate).getUTCFullYear();

    await this.repo.runTransaction(async (tx) => {
      const balance = await this.ensureBalance(
        companyId,
        existing.employeeId,
        existing.leaveTypeId,
        year,
        existing.leaveType.maxDaysPerYear,
        tx,
      );
      await this.repo.movePendingToUsed(balance.id, existing.days, tx);
      await this.repo.updateRequest(
        id,
        {
          status: 'APPROVED',
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        },
        tx,
      );
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.request.approve',
      entityType: 'LeaveRequest',
      entityId: id,
    });
    return this.repo.findRequest(companyId, id);
  }

  async rejectRequest(actor: AuthActor, id: string, input: ReviewLeaveRequestInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRequest(companyId, id);
    if (!existing) throw new NotFoundError('Leave request not found');
    if (existing.status !== 'PENDING') {
      throw new ValidationError('Only pending requests can be rejected');
    }

    const linked = await this.repo.findEmployeeByUserId(companyId, actor.id);
    if (linked && linked.id === existing.employeeId) {
      throw new ForbiddenError('You cannot reject your own leave request');
    }

    const year = startOfUtcDay(existing.startDate).getUTCFullYear();

    await this.repo.runTransaction(async (tx) => {
      const balance = await this.repo.findBalance(
        companyId,
        existing.employeeId,
        existing.leaveTypeId,
        year,
        tx,
      );
      if (balance) {
        await this.repo.adjustBalancePending(balance.id, -existing.days, tx);
      }
      await this.repo.updateRequest(
        id,
        {
          status: 'REJECTED',
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        },
        tx,
      );
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.request.reject',
      entityType: 'LeaveRequest',
      entityId: id,
    });
    return this.repo.findRequest(companyId, id);
  }

  async cancelRequest(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findRequest(companyId, id);
    if (!existing) throw new NotFoundError('Leave request not found');
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      throw new ValidationError('Only pending or approved requests can be cancelled');
    }

    if (!this.canManageOthers(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only cancel your own leave requests');
      }
      if (existing.status === 'APPROVED') {
        throw new ForbiddenError('Approved leave can only be cancelled by HR/managers');
      }
    }

    const year = startOfUtcDay(existing.startDate).getUTCFullYear();

    await this.repo.runTransaction(async (tx) => {
      const balance = await this.repo.findBalance(
        companyId,
        existing.employeeId,
        existing.leaveTypeId,
        year,
        tx,
      );
      if (balance) {
        if (existing.status === 'PENDING') {
          await this.repo.adjustBalancePending(balance.id, -existing.days, tx);
        } else {
          await this.repo.adjustBalanceUsed(balance.id, -existing.days, tx);
        }
      }
      await this.repo.updateRequest(
        id,
        {
          status: 'CANCELLED',
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          reviewNotes: 'Cancelled',
        },
        tx,
      );
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'leave.request.cancel',
      entityType: 'LeaveRequest',
      entityId: id,
    });
    return this.repo.findRequest(companyId, id);
  }

  async mySummary(actor: AuthActor, yearParam?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    const [balances, counts] = await Promise.all([
      this.repo.listBalances(companyId, year, employeeId),
      this.repo.summaryCounts(companyId, year, employeeId),
    ]);

    const byStatus: Record<string, { count: number; days: number }> = {};
    for (const row of counts) {
      byStatus[row.status] = {
        count: row._count._all,
        days: row._sum.days ?? 0,
      };
    }

    return {
      year,
      employeeId,
      balances: balances.map((b) => ({ ...b, available: this.available(b) })),
      pendingRequests: byStatus.PENDING?.count ?? 0,
      approvedRequests: byStatus.APPROVED?.count ?? 0,
      approvedDays: byStatus.APPROVED?.days ?? 0,
      pendingDays: byStatus.PENDING?.days ?? 0,
      remainingDays: balances.reduce((sum, b) => sum + this.available(b), 0),
    };
  }

  async calendar(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const from = startOfUtcDay(params.from ? new Date(params.from) : new Date());
    const to = startOfUtcDay(
      params.to
        ? new Date(params.to)
        : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)),
    );
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ValidationError('Invalid from/to date');
    }

    let employeeId: string | undefined;
    if (!this.canManageOthers(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    }

    const items = await this.repo.listCalendar(companyId, from, to, employeeId);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      items: items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: `${item.employee.firstName} ${item.employee.lastName}`,
        leaveTypeId: item.leaveTypeId,
        leaveTypeName: item.leaveType.name,
        color: item.leaveType.color,
        startDate: item.startDate,
        endDate: item.endDate,
        dayType: item.dayType,
        days: item.days,
        status: item.status,
      })),
    };
  }

  async report(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const year = params.year ? Number(params.year) : new Date().getUTCFullYear();
    if (!Number.isFinite(year)) throw new ValidationError('Invalid year');

    let employeeId: string | undefined;
    if (!this.canManageOthers(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    }

    const rows = await this.repo.summaryCounts(companyId, year, employeeId);
    return {
      year,
      byStatus: rows.map((row) => ({
        status: row.status,
        count: row._count._all,
        days: row._sum.days ?? 0,
      })),
    };
  }
}
