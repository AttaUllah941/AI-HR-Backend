import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const reviewInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      position: true,
      status: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PerformanceReviewInclude;

export type ReviewWithEmployee = Prisma.PerformanceReviewGetPayload<{
  include: typeof reviewInclude;
}>;

export function currentQuarter(date = new Date()): { year: number; quarter: number } {
  return {
    year: date.getUTCFullYear(),
    quarter: Math.floor(date.getUTCMonth() / 3) + 1,
  };
}

export class PerformanceRepository {
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

  findCycle(companyId: string, year: number, quarter: number) {
    return prisma.performanceCycle.findFirst({
      where: { companyId, year, quarter, deletedAt: null },
    });
  }

  findActiveCycle(companyId: string) {
    return prisma.performanceCycle.findFirst({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }],
    });
  }

  upsertCycle(data: {
    companyId: string;
    year: number;
    quarter: number;
    label?: string;
    previousAvgScore?: number | null;
    previousGoalsOnTrackPercent?: number | null;
  }) {
    const label = data.label ?? `Q${data.quarter}`;
    return prisma.performanceCycle.upsert({
      where: {
        companyId_year_quarter: {
          companyId: data.companyId,
          year: data.year,
          quarter: data.quarter,
        },
      },
      update: {
        deletedAt: null,
        status: 'ACTIVE',
        label,
        ...(data.previousAvgScore !== undefined
          ? { previousAvgScore: data.previousAvgScore }
          : {}),
        ...(data.previousGoalsOnTrackPercent !== undefined
          ? { previousGoalsOnTrackPercent: data.previousGoalsOnTrackPercent }
          : {}),
      },
      create: {
        companyId: data.companyId,
        year: data.year,
        quarter: data.quarter,
        label,
        status: 'ACTIVE',
        previousAvgScore: data.previousAvgScore ?? undefined,
        previousGoalsOnTrackPercent: data.previousGoalsOnTrackPercent ?? undefined,
      },
    });
  }

  findReviewById(companyId: string, id: string) {
    return prisma.performanceReview.findFirst({
      where: { id, companyId, deletedAt: null },
      include: reviewInclude,
    });
  }

  aggregateReviews(cycleId: string) {
    return prisma.performanceReview.aggregate({
      where: { cycleId, deletedAt: null },
      _avg: { score: true },
      _count: { _all: true },
    });
  }

  countPromotionReady(cycleId: string) {
    return prisma.performanceReview.count({
      where: { cycleId, deletedAt: null, promotionReady: true },
    });
  }

  countGoalsByStatus(cycleId: string) {
    return prisma.performanceGoal.groupBy({
      by: ['status'],
      where: { cycleId, deletedAt: null },
      _count: { _all: true },
    });
  }

  listTopPerformers(cycleId: string, take: number) {
    return prisma.performanceReview.findMany({
      where: { cycleId, deletedAt: null },
      include: reviewInclude,
      orderBy: [{ score: 'desc' }, { goalsCompletePercent: 'desc' }],
      take,
    });
  }

  listInsights(companyId: string, cycleId?: string) {
    return prisma.performanceInsight.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(cycleId ? { OR: [{ cycleId }, { cycleId: null }] } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  listReviews(
    companyId: string,
    options: {
      cycleId: string;
      search?: string;
      promotionReady?: boolean;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.PerformanceReviewWhereInput = {
      companyId,
      cycleId: options.cycleId,
      deletedAt: null,
      ...(options.promotionReady !== undefined
        ? { promotionReady: options.promotionReady }
        : {}),
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
      prisma.performanceReview.findMany({
        where,
        include: reviewInclude,
        orderBy: [{ score: 'desc' }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.performanceReview.count({ where }),
    ]);
  }

  upsertReview(data: {
    companyId: string;
    cycleId: string;
    employeeId: string;
    score: number;
    goalCount: number;
    goalsCompletePercent: number;
    promotionReady: boolean;
    summary?: string;
  }) {
    return prisma.performanceReview.upsert({
      where: {
        cycleId_employeeId: {
          cycleId: data.cycleId,
          employeeId: data.employeeId,
        },
      },
      create: {
        companyId: data.companyId,
        cycleId: data.cycleId,
        employeeId: data.employeeId,
        score: data.score,
        goalCount: data.goalCount,
        goalsCompletePercent: data.goalsCompletePercent,
        promotionReady: data.promotionReady,
        summary: data.summary,
      },
      update: {
        score: data.score,
        goalCount: data.goalCount,
        goalsCompletePercent: data.goalsCompletePercent,
        promotionReady: data.promotionReady,
        summary: data.summary,
        deletedAt: null,
      },
      include: reviewInclude,
    });
  }

  updateReview(id: string, data: Prisma.PerformanceReviewUpdateInput) {
    return prisma.performanceReview.update({
      where: { id },
      data,
      include: reviewInclude,
    });
  }

  softDeleteReview(id: string) {
    return prisma.performanceReview.update({
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
