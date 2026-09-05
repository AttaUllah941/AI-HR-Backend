import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { PerformanceRepository } from '../repositories/performance.repository.js';
import type {
  CreateFeedbackInput,
  CreateGoalInput,
  CreateKpiInput,
  CreatePromotionInput,
  CreateReviewCycleInput,
  CreateReviewInput,
  ReviewPromotionInput,
  UpdateGoalInput,
  UpdateKpiInput,
  UpdatePromotionInput,
  UpdateReviewCycleInput,
  UpdateReviewInput,
  UpsertEmployeeKpiInput,
} from '../validators/performance.validators.js';

type AuthActor = { id: string; permissions: string[] };

function paginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

function parsePage(params: Record<string, string | undefined>) {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  return { page, pageSize };
}

function countsByKey(
  rows: { status: string; _count: { _all: number } }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.status] = row._count._all;
  }
  return out;
}

function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function parseYear(yearParam?: string): number {
  const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new ValidationError('Invalid year');
  }
  return year;
}

export class PerformanceService {
  constructor(private readonly repo = new PerformanceRepository()) {}

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

  private canManageCompanyWide(actor: AuthActor): boolean {
    return (
      actor.permissions.includes('performance:create') ||
      actor.permissions.includes('performance:update') ||
      actor.permissions.includes('performance:approve')
    );
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

  private async scopedEmployeeId(
    actor: AuthActor,
    companyId: string,
    requestedId?: string | null,
  ): Promise<string | undefined> {
    if (!this.canManageCompanyWide(actor)) {
      return this.resolveEmployeeId(companyId, actor.id, null);
    }
    if (requestedId) {
      return this.resolveEmployeeId(companyId, actor.id, requestedId);
    }
    return undefined;
  }

  // —— Summary / Report ——
  async summary(actor: AuthActor, yearParam?: string) {
    if (!this.canManageCompanyWide(actor)) {
      return this.mySummary(actor, yearParam);
    }

    const companyId = await this.requireCompanyId(actor.id);
    const year = parseYear(yearParam);

    const [
      goalRows,
      reviewRows,
      promotionRows,
      activeGoals,
      activeCycles,
      pendingPromotions,
      feedbackCount,
      ratingAgg,
    ] = await Promise.all([
      this.repo.goalStatusCounts(companyId, undefined, year),
      this.repo.reviewStatusCounts(companyId, undefined, year),
      this.repo.promotionStatusCounts(companyId),
      this.repo.countActiveGoals(companyId),
      this.repo.countActiveCycles(companyId),
      this.repo.countPendingPromotions(companyId),
      this.repo.countFeedbackReceived(companyId, undefined, year),
      this.repo.avgReviewRating(companyId, undefined, year),
    ]);

    return {
      scope: 'company' as const,
      year,
      activeGoals,
      activeCycles,
      pendingPromotions,
      feedbackCount,
      averageOverallRating: ratingAgg._avg.overallRating ?? null,
      ratedReviewCount: ratingAgg._count._all,
      goalsByStatus: countsByKey(goalRows),
      reviewsByStatus: countsByKey(reviewRows),
      promotionsByStatus: countsByKey(promotionRows),
    };
  }

  async mySummary(actor: AuthActor, yearParam?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    const year = parseYear(yearParam);

    const [
      goalRows,
      reviewRows,
      promotionRows,
      activeGoals,
      pendingPromotions,
      feedbackCount,
      ratingAgg,
    ] = await Promise.all([
      this.repo.goalStatusCounts(companyId, employeeId, year),
      this.repo.reviewStatusCounts(companyId, employeeId, year),
      this.repo.promotionStatusCounts(companyId, employeeId),
      this.repo.countActiveGoals(companyId, employeeId),
      this.repo.countPendingPromotions(companyId, employeeId),
      this.repo.countFeedbackReceived(companyId, employeeId, year),
      this.repo.avgReviewRating(companyId, employeeId, year),
    ]);

    return {
      scope: 'employee' as const,
      year,
      employeeId,
      activeGoals,
      pendingPromotions,
      feedbackReceived: feedbackCount,
      averageOverallRating: ratingAgg._avg.overallRating ?? null,
      ratedReviewCount: ratingAgg._count._all,
      goalsByStatus: countsByKey(goalRows),
      reviewsByStatus: countsByKey(reviewRows),
      promotionsByStatus: countsByKey(promotionRows),
    };
  }

  async report(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const year = parseYear(params.year);
    const employeeId = await this.scopedEmployeeId(actor, companyId, params.employeeId);

    const [goalRows, reviewRows, promotionRows, feedbackCount, ratingAgg] = await Promise.all([
      this.repo.goalStatusCounts(companyId, employeeId, year),
      this.repo.reviewStatusCounts(companyId, employeeId, year),
      this.repo.promotionStatusCounts(companyId, employeeId),
      this.repo.countFeedbackReceived(companyId, employeeId, year),
      this.repo.avgReviewRating(companyId, employeeId, year),
    ]);

    return {
      year,
      employeeId: employeeId ?? null,
      goalsByStatus: countsByKey(goalRows),
      reviewsByStatus: countsByKey(reviewRows),
      promotionsByStatus: countsByKey(promotionRows),
      feedbackCount,
      averageOverallRating: ratingAgg._avg.overallRating ?? null,
      ratedReviewCount: ratingAgg._count._all,
    };
  }

  // —— Goals ——
  async listGoals(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const employeeId = await this.scopedEmployeeId(actor, companyId, params.employeeId);
    const { items, total } = await this.repo.listGoals(companyId, {
      page,
      pageSize,
      status: params.status as never,
      employeeId,
      priority: params.priority as never,
      search: params.search,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getGoal(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const goal = await this.repo.findGoal(companyId, id);
    if (!goal) throw new NotFoundError('Goal not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (goal.employeeId !== selfId) {
        throw new ForbiddenError('You can only view your own goals');
      }
    }
    return goal;
  }

  async createGoal(actor: AuthActor, input: CreateGoalInput) {
    const companyId = await this.requireCompanyId(actor.id);
    let employeeId = input.employeeId ?? null;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }

    const status = input.status ?? 'DRAFT';
    let progress = input.progress !== undefined ? clampProgress(input.progress) : 0;
    if (status === 'COMPLETED') progress = 100;

    const goal = await this.repo.createGoal(companyId, employeeId, {
      ...input,
      progress,
      status,
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.goal.create',
      entityType: 'PerformanceGoal',
      entityId: goal.id,
    });
    return goal;
  }

  async updateGoal(actor: AuthActor, id: string, input: UpdateGoalInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findGoal(companyId, id);
    if (!existing) throw new NotFoundError('Goal not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only update your own goals');
      }
    }

    const status = input.status ?? existing.status;
    let progress =
      input.progress !== undefined ? clampProgress(input.progress) : existing.progress;
    if (status === 'COMPLETED') progress = 100;

    const goal = await this.repo.updateGoal(id, { ...input, progress, status });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.goal.update',
      entityType: 'PerformanceGoal',
      entityId: id,
    });
    return goal;
  }

  async deleteGoal(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findGoal(companyId, id);
    if (!existing) throw new NotFoundError('Goal not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only delete your own goals');
      }
    }
    await this.repo.softDeleteGoal(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.goal.delete',
      entityType: 'PerformanceGoal',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— KPIs ——
  async listKpis(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const isActive =
      params.isActive === undefined
        ? undefined
        : params.isActive === 'true' || params.isActive === '1';
    const { items, total } = await this.repo.listKpis(companyId, {
      page,
      pageSize,
      isActive,
      search: params.search,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async createKpi(actor: AuthActor, input: CreateKpiInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const kpi = await this.repo.createKpi(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'performance.kpi.create',
        entityType: 'PerformanceKpi',
        entityId: kpi.id,
      });
      return kpi;
    } catch (error) {
      this.rethrowUnique(error, 'KPI code already exists');
    }
  }

  async updateKpi(actor: AuthActor, id: string, input: UpdateKpiInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findKpi(companyId, id);
    if (!existing) throw new NotFoundError('KPI not found');
    try {
      const kpi = await this.repo.updateKpi(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'performance.kpi.update',
        entityType: 'PerformanceKpi',
        entityId: id,
      });
      return kpi;
    } catch (error) {
      this.rethrowUnique(error, 'KPI code already exists');
    }
  }

  async deleteKpi(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findKpi(companyId, id);
    if (!existing) throw new NotFoundError('KPI not found');
    await this.repo.softDeleteKpi(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.kpi.delete',
      entityType: 'PerformanceKpi',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— Employee KPIs ——
  async listEmployeeKpis(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const employeeId = await this.scopedEmployeeId(actor, companyId, params.employeeId);
    const year = params.year ? Number(params.year) : undefined;
    if (params.year && (!Number.isFinite(year) || year! < 2000 || year! > 2100)) {
      throw new ValidationError('Invalid year');
    }
    let quarter: number | null | undefined;
    if (params.quarter === 'null' || params.quarter === '') {
      quarter = null;
    } else if (params.quarter !== undefined) {
      quarter = Number(params.quarter);
      if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        throw new ValidationError('Invalid quarter');
      }
    }

    const { items, total } = await this.repo.listEmployeeKpis(companyId, {
      page,
      pageSize,
      employeeId,
      kpiId: params.kpiId,
      year,
      quarter,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async upsertEmployeeKpi(actor: AuthActor, input: UpsertEmployeeKpiInput) {
    const companyId = await this.requireCompanyId(actor.id);
    let employeeId = input.employeeId;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else {
      await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }

    const kpi = await this.repo.findKpi(companyId, input.kpiId);
    if (!kpi) throw new NotFoundError('KPI not found');

    try {
      const record = await this.repo.upsertEmployeeKpi(companyId, {
        ...input,
        employeeId,
      });
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'performance.employee_kpi.upsert',
        entityType: 'EmployeeKpi',
        entityId: record.id,
      });
      return record;
    } catch (error) {
      this.rethrowUnique(error, 'Employee KPI already exists for this period');
    }
  }

  // —— Cycles ——
  async listCycles(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const year = params.year ? Number(params.year) : undefined;
    if (params.year && (!Number.isFinite(year) || year! < 2000 || year! > 2100)) {
      throw new ValidationError('Invalid year');
    }
    const { items, total } = await this.repo.listCycles(companyId, {
      page,
      pageSize,
      status: params.status as never,
      year,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async createCycle(actor: AuthActor, input: CreateReviewCycleInput) {
    const companyId = await this.requireCompanyId(actor.id);
    if (input.endDate < input.startDate) {
      throw new ValidationError('endDate must be on or after startDate');
    }
    const cycle = await this.repo.createCycle(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.cycle.create',
      entityType: 'ReviewCycle',
      entityId: cycle.id,
    });
    return cycle;
  }

  async updateCycle(actor: AuthActor, id: string, input: UpdateReviewCycleInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCycle(companyId, id);
    if (!existing) throw new NotFoundError('Review cycle not found');
    const startDate = input.startDate ?? existing.startDate;
    const endDate = input.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new ValidationError('endDate must be on or after startDate');
    }
    const cycle = await this.repo.updateCycle(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.cycle.update',
      entityType: 'ReviewCycle',
      entityId: id,
    });
    return cycle;
  }

  async deleteCycle(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCycle(companyId, id);
    if (!existing) throw new NotFoundError('Review cycle not found');
    await this.repo.softDeleteCycle(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.cycle.delete',
      entityType: 'ReviewCycle',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async activateCycle(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCycle(companyId, id);
    if (!existing) throw new NotFoundError('Review cycle not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft cycles can be activated');
    }
    const cycle = await this.repo.updateCycleStatus(id, 'ACTIVE');
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.cycle.activate',
      entityType: 'ReviewCycle',
      entityId: id,
    });
    return cycle;
  }

  async closeCycle(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCycle(companyId, id);
    if (!existing) throw new NotFoundError('Review cycle not found');
    if (existing.status !== 'ACTIVE') {
      throw new ValidationError('Only active cycles can be closed');
    }
    const cycle = await this.repo.updateCycleStatus(id, 'CLOSED');
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.cycle.close',
      entityType: 'ReviewCycle',
      entityId: id,
    });
    return cycle;
  }

  // —— Reviews ——
  async listReviews(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const employeeId = await this.scopedEmployeeId(actor, companyId, params.employeeId);
    const { items, total } = await this.repo.listReviews(companyId, {
      page,
      pageSize,
      status: params.status as never,
      employeeId,
      reviewerId: this.canManageCompanyWide(actor) ? params.reviewerId : undefined,
      cycleId: params.cycleId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getReview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const review = await this.repo.findReview(companyId, id);
    if (!review) throw new NotFoundError('Review not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (review.employeeId !== selfId && review.reviewerId !== selfId) {
        throw new ForbiddenError('You can only view your own reviews');
      }
    }
    return review;
  }

  async createReview(actor: AuthActor, input: CreateReviewInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    if (input.reviewerId) {
      await this.resolveEmployeeId(companyId, actor.id, input.reviewerId);
    }
    if (input.cycleId) {
      const cycle = await this.repo.findCycle(companyId, input.cycleId);
      if (!cycle) throw new NotFoundError('Review cycle not found');
    }

    const review = await this.repo.createReview(companyId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.review.create',
      entityType: 'PerformanceReview',
      entityId: review.id,
    });
    return review;
  }

  async updateReview(actor: AuthActor, id: string, input: UpdateReviewInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findReview(companyId, id);
    if (!existing) throw new NotFoundError('Review not found');
    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
      throw new ValidationError('Cannot update a finalized review');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId && existing.reviewerId !== selfId) {
        throw new ForbiddenError('You can only update your own reviews');
      }
    }
    if (input.reviewerId) {
      await this.resolveEmployeeId(companyId, actor.id, input.reviewerId);
    }
    if (input.cycleId) {
      const cycle = await this.repo.findCycle(companyId, input.cycleId);
      if (!cycle) throw new NotFoundError('Review cycle not found');
    }

    const review = await this.repo.updateReview(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.review.update',
      entityType: 'PerformanceReview',
      entityId: id,
    });
    return review;
  }

  async submitReview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findReview(companyId, id);
    if (!existing) throw new NotFoundError('Review not found');
    if (!['DRAFT', 'IN_PROGRESS'].includes(existing.status)) {
      throw new ValidationError('Only draft or in-progress reviews can be submitted');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId && existing.reviewerId !== selfId) {
        throw new ForbiddenError('You can only submit your own reviews');
      }
    }
    const review = await this.repo.submitReview(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.review.submit',
      entityType: 'PerformanceReview',
      entityId: id,
    });
    return review;
  }

  async acknowledgeReview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findReview(companyId, id);
    if (!existing) throw new NotFoundError('Review not found');
    if (existing.status !== 'SUBMITTED') {
      throw new ValidationError('Only submitted reviews can be acknowledged');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('Only the reviewed employee can acknowledge this review');
      }
    }
    const review = await this.repo.acknowledgeReview(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.review.acknowledge',
      entityType: 'PerformanceReview',
      entityId: id,
    });
    return review;
  }

  async completeReview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findReview(companyId, id);
    if (!existing) throw new NotFoundError('Review not found');
    if (!['SUBMITTED', 'ACKNOWLEDGED'].includes(existing.status)) {
      throw new ValidationError('Only submitted or acknowledged reviews can be completed');
    }
    const review = await this.repo.completeReview(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.review.complete',
      entityType: 'PerformanceReview',
      entityId: id,
    });
    return review;
  }

  // —— Feedback ——
  async listFeedback(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);

    let involvingEmployeeId: string | undefined;
    let fromEmployeeId = params.fromEmployeeId;
    let toEmployeeId = params.toEmployeeId;

    if (!this.canManageCompanyWide(actor)) {
      involvingEmployeeId = await this.resolveEmployeeId(companyId, actor.id, null);
      fromEmployeeId = undefined;
      toEmployeeId = undefined;
    }

    const { items, total } = await this.repo.listFeedback(companyId, {
      page,
      pageSize,
      type: params.type as never,
      fromEmployeeId,
      toEmployeeId,
      reviewId: params.reviewId,
      involvingEmployeeId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getFeedback(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const feedback = await this.repo.findFeedback(companyId, id);
    if (!feedback) throw new NotFoundError('Feedback not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (feedback.fromEmployeeId !== selfId && feedback.toEmployeeId !== selfId) {
        throw new ForbiddenError('You can only view feedback you sent or received');
      }
    }
    return feedback;
  }

  async createFeedback(actor: AuthActor, input: CreateFeedbackInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.resolveEmployeeId(companyId, actor.id, input.toEmployeeId);

    let fromEmployeeId = input.fromEmployeeId ?? null;
    if (!this.canManageCompanyWide(actor)) {
      fromEmployeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else {
      fromEmployeeId = await this.resolveEmployeeId(companyId, actor.id, fromEmployeeId);
    }

    if (input.reviewId) {
      const review = await this.repo.findReview(companyId, input.reviewId);
      if (!review) throw new NotFoundError('Review not found');
    }

    const feedback = await this.repo.createFeedback(companyId, fromEmployeeId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.feedback.create',
      entityType: 'PerformanceFeedback',
      entityId: feedback.id,
    });
    return feedback;
  }

  async deleteFeedback(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findFeedback(companyId, id);
    if (!existing) throw new NotFoundError('Feedback not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.fromEmployeeId !== selfId) {
        throw new ForbiddenError('You can only delete feedback you created');
      }
    }
    await this.repo.softDeleteFeedback(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.feedback.delete',
      entityType: 'PerformanceFeedback',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // —— Promotions ——
  async listPromotions(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const employeeId = await this.scopedEmployeeId(actor, companyId, params.employeeId);
    const { items, total } = await this.repo.listPromotions(companyId, {
      page,
      pageSize,
      status: params.status as never,
      employeeId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getPromotion(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const promotion = await this.repo.findPromotion(companyId, id);
    if (!promotion) throw new NotFoundError('Promotion request not found');
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (promotion.employeeId !== selfId) {
        throw new ForbiddenError('You can only view your own promotion requests');
      }
    }
    return promotion;
  }

  async createPromotion(actor: AuthActor, input: CreatePromotionInput) {
    const companyId = await this.requireCompanyId(actor.id);
    let employeeId = input.employeeId ?? null;
    if (!this.canManageCompanyWide(actor)) {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, null);
    } else {
      employeeId = await this.resolveEmployeeId(companyId, actor.id, employeeId);
    }
    if (input.proposedDesignationId) {
      const designation = await this.repo.findDesignation(companyId, input.proposedDesignationId);
      if (!designation) throw new ValidationError('Invalid proposed designation');
    }

    const promotion = await this.repo.createPromotion(companyId, employeeId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.promotion.create',
      entityType: 'PromotionRequest',
      entityId: promotion.id,
    });
    return promotion;
  }

  async updatePromotion(actor: AuthActor, id: string, input: UpdatePromotionInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findPromotion(companyId, id);
    if (!existing) throw new NotFoundError('Promotion request not found');
    if (!['DRAFT', 'PENDING'].includes(existing.status)) {
      throw new ValidationError('Cannot update a finalized promotion request');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only update your own promotion requests');
      }
      if (existing.status !== 'DRAFT') {
        throw new ValidationError('Only draft promotion requests can be updated');
      }
    }
    if (input.employeeId && this.canManageCompanyWide(actor)) {
      await this.resolveEmployeeId(companyId, actor.id, input.employeeId);
    }
    if (input.proposedDesignationId) {
      const designation = await this.repo.findDesignation(companyId, input.proposedDesignationId);
      if (!designation) throw new ValidationError('Invalid proposed designation');
    }

    const promotion = await this.repo.updatePromotion(id, {
      ...input,
      ...(this.canManageCompanyWide(actor) ? {} : { employeeId: undefined }),
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.promotion.update',
      entityType: 'PromotionRequest',
      entityId: id,
    });
    return promotion;
  }

  async submitPromotion(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findPromotion(companyId, id);
    if (!existing) throw new NotFoundError('Promotion request not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft promotion requests can be submitted');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only submit your own promotion requests');
      }
    }
    const promotion = await this.repo.submitPromotion(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.promotion.submit',
      entityType: 'PromotionRequest',
      entityId: id,
    });
    return promotion;
  }

  async reviewPromotion(actor: AuthActor, id: string, input: ReviewPromotionInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findPromotion(companyId, id);
    if (!existing) throw new NotFoundError('Promotion request not found');
    if (existing.status !== 'PENDING') {
      throw new ValidationError('Only pending promotion requests can be reviewed');
    }

    const status = input.approve ? 'APPROVED' : 'REJECTED';

    const promotion = await this.repo.runTransaction(async (tx) => {
      const updated = await this.repo.reviewPromotion(
        id,
        {
          status,
          reviewedBy: actor.id,
          reviewNotes: input.reviewNotes,
          effectiveDate: input.effectiveDate,
        },
        tx,
      );
      if (
        input.approve &&
        existing.proposedDesignationId
      ) {
        await this.repo.updateEmployeeDesignation(
          existing.employeeId,
          existing.proposedDesignationId,
          tx,
        );
      }
      return updated;
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.promotion.review',
      entityType: 'PromotionRequest',
      entityId: id,
      metadata: { status },
    });
    return promotion;
  }

  async withdrawPromotion(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findPromotion(companyId, id);
    if (!existing) throw new NotFoundError('Promotion request not found');
    if (!['DRAFT', 'PENDING'].includes(existing.status)) {
      throw new ValidationError('Only draft or pending promotion requests can be withdrawn');
    }
    if (!this.canManageCompanyWide(actor)) {
      const selfId = await this.resolveEmployeeId(companyId, actor.id, null);
      if (existing.employeeId !== selfId) {
        throw new ForbiddenError('You can only withdraw your own promotion requests');
      }
    }
    const promotion = await this.repo.withdrawPromotion(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'performance.promotion.withdraw',
      entityType: 'PromotionRequest',
      entityId: id,
    });
    return promotion;
  }
}
