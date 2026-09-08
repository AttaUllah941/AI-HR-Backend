import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import {
  PerformanceRepository,
  currentQuarter,
  type ReviewWithEmployee,
} from '../repositories/performance.repository.js';
import type {
  CreateReviewInput,
  PerformancePeriodQuery,
  ReviewListQuery,
  TopPerformersQuery,
  UpdateReviewInput,
} from '../validators/performance.validators.js';

function toReviewDto(review: ReviewWithEmployee) {
  return {
    id: review.id,
    companyId: review.companyId,
    cycleId: review.cycleId,
    employeeId: review.employeeId,
    score: review.score,
    goalCount: review.goalCount,
    goalsCompletePercent: review.goalsCompletePercent,
    promotionReady: review.promotionReady,
    summary: review.summary,
    employee: {
      id: review.employee.id,
      firstName: review.employee.firstName,
      lastName: review.employee.lastName,
      email: review.employee.email,
      position: review.employee.position,
      initials: `${review.employee.firstName.charAt(0)}${review.employee.lastName.charAt(0)}`.toUpperCase(),
      department: review.employee.department
        ? { id: review.employee.department.id, name: review.employee.department.name }
        : null,
    },
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export class PerformanceService {
  constructor(private readonly repo = new PerformanceRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  private async resolveCycle(companyId: string, query: PerformancePeriodQuery) {
    const fallback = currentQuarter();
    const year = query.year ?? fallback.year;
    const quarter = query.quarter ?? fallback.quarter;

    let cycle = await this.repo.findCycle(companyId, year, quarter);
    if (!cycle) {
      cycle = await this.repo.findActiveCycle(companyId);
    }
    if (!cycle) {
      cycle = await this.repo.upsertCycle({
        companyId,
        year,
        quarter,
        previousAvgScore: 4.1,
        previousGoalsOnTrackPercent: 77,
      });
    }
    return cycle;
  }

  async summary(userId: string, query: PerformancePeriodQuery) {
    const companyId = await this.requireCompanyId(userId);
    const cycle = await this.resolveCycle(companyId, query);
    const [aggregates, promotionReady, goalGroups] = await Promise.all([
      this.repo.aggregateReviews(cycle.id),
      this.repo.countPromotionReady(cycle.id),
      this.repo.countGoalsByStatus(cycle.id),
    ]);

    const totalGoals = goalGroups.reduce((sum, row) => sum + row._count._all, 0);
    const onTrackGoals = goalGroups
      .filter((row) => row.status === 'ON_TRACK' || row.status === 'COMPLETED')
      .reduce((sum, row) => sum + row._count._all, 0);

    const avgScore = aggregates._avg.score != null ? round1(aggregates._avg.score) : 0;
    const goalsOnTrackPercent =
      totalGoals > 0 ? Math.round((onTrackGoals / totalGoals) * 100) : 0;

    const previousAvg = cycle.previousAvgScore ?? avgScore;
    const previousGoals = cycle.previousGoalsOnTrackPercent ?? goalsOnTrackPercent;

    return {
      cycle: {
        id: cycle.id,
        label: cycle.label,
        year: cycle.year,
        quarter: cycle.quarter,
        status: cycle.status,
      },
      avgScore,
      avgScoreDelta: round1(avgScore - previousAvg),
      goalsOnTrackPercent,
      goalsOnTrackDelta: goalsOnTrackPercent - previousGoals,
      promotionReadyCount: promotionReady,
      reviewCount: aggregates._count._all,
    };
  }

  async topPerformers(userId: string, query: TopPerformersQuery) {
    const companyId = await this.requireCompanyId(userId);
    const cycle = await this.resolveCycle(companyId, query);
    const items = await this.repo.listTopPerformers(cycle.id, query.limit);
    return {
      cycle: {
        id: cycle.id,
        label: cycle.label,
        year: cycle.year,
        quarter: cycle.quarter,
      },
      items: items.map(toReviewDto),
    };
  }

  async insights(userId: string, query: PerformancePeriodQuery) {
    const companyId = await this.requireCompanyId(userId);
    const cycle = await this.resolveCycle(companyId, query);
    const items = await this.repo.listInsights(companyId, cycle.id);
    return {
      items: items.map((item) => ({
        id: item.id,
        body: item.body,
        sortOrder: item.sortOrder,
      })),
    };
  }

  async listReviews(userId: string, query: ReviewListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const cycle = await this.resolveCycle(companyId, query);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listReviews(companyId, {
      cycleId: cycle.id,
      search: query.search,
      promotionReady: query.promotionReady,
      skip,
      take: query.pageSize,
    });

    return {
      items: items.map(toReviewDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async createReview(userId: string, input: CreateReviewInput) {
    const companyId = await this.requireCompanyId(userId);
    const employee = await this.repo.findEmployee(companyId, input.employeeId);
    if (!employee) {
      throw new ValidationError('Employee not found');
    }

    const cycle = await this.repo.upsertCycle({
      companyId,
      year: input.year,
      quarter: input.quarter,
    });

    const review = await this.repo.upsertReview({
      companyId,
      cycleId: cycle.id,
      employeeId: input.employeeId,
      score: input.score,
      goalCount: input.goalCount,
      goalsCompletePercent: input.goalsCompletePercent,
      promotionReady: input.promotionReady,
      summary: input.summary,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'performance.review.upsert',
      entityType: 'PerformanceReview',
      entityId: review.id,
    });

    return toReviewDto(review);
  }

  async updateReview(userId: string, id: string, input: UpdateReviewInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findReviewById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Performance review not found');
    }

    const review = await this.repo.updateReview(id, {
      score: input.score,
      goalCount: input.goalCount,
      goalsCompletePercent: input.goalsCompletePercent,
      promotionReady: input.promotionReady,
      summary: input.summary,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'performance.review.update',
      entityType: 'PerformanceReview',
      entityId: review.id,
    });

    return toReviewDto(review);
  }

  async removeReview(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findReviewById(companyId, id);
    if (!existing) {
      throw new NotFoundError('Performance review not found');
    }

    await this.repo.softDeleteReview(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'performance.review.delete',
      entityType: 'PerformanceReview',
      entityId: id,
    });

    return { deleted: true };
  }
}
