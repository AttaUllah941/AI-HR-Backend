import type {
  FeedbackType,
  GoalPriority,
  GoalStatus,
  Prisma,
  PromotionStatus,
  ReviewCycleStatus,
  ReviewStatus,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type {
  CreateFeedbackInput,
  CreateGoalInput,
  CreateKpiInput,
  CreatePromotionInput,
  CreateReviewCycleInput,
  CreateReviewInput,
  UpdateGoalInput,
  UpdateKpiInput,
  UpdatePromotionInput,
  UpdateReviewCycleInput,
  UpdateReviewInput,
  UpsertEmployeeKpiInput,
} from '../validators/performance.validators.js';

const notDeleted = { deletedAt: null };

type DbClient = Prisma.TransactionClient | typeof prisma;

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EmployeeSelect;

const goalInclude = {
  employee: { select: employeeSelect },
} satisfies Prisma.PerformanceGoalInclude;

const kpiInclude = {
  _count: { select: { employeeKpis: true } },
} satisfies Prisma.PerformanceKpiInclude;

const employeeKpiInclude = {
  employee: { select: employeeSelect },
  kpi: {
    select: {
      id: true,
      name: true,
      code: true,
      unit: true,
      targetDefault: true,
      isActive: true,
    },
  },
} satisfies Prisma.EmployeeKpiInclude;

const cycleInclude = {
  _count: { select: { reviews: true } },
} satisfies Prisma.ReviewCycleInclude;

const reviewInclude = {
  employee: { select: employeeSelect },
  reviewer: { select: employeeSelect },
  cycle: {
    select: {
      id: true,
      name: true,
      year: true,
      status: true,
      startDate: true,
      endDate: true,
    },
  },
} satisfies Prisma.PerformanceReviewInclude;

const feedbackInclude = {
  fromEmployee: { select: employeeSelect },
  toEmployee: { select: employeeSelect },
  review: { select: { id: true, status: true, cycleId: true } },
} satisfies Prisma.PerformanceFeedbackInclude;

const promotionInclude = {
  employee: { select: employeeSelect },
  proposedDesignation: { select: { id: true, name: true, code: true } },
} satisfies Prisma.PromotionRequestInclude;

export type ListQuery = {
  page: number;
  pageSize: number;
};

export type GoalListQuery = ListQuery & {
  status?: GoalStatus;
  employeeId?: string;
  priority?: GoalPriority;
  search?: string;
};

export type KpiListQuery = ListQuery & {
  isActive?: boolean;
  search?: string;
};

export type EmployeeKpiListQuery = ListQuery & {
  employeeId?: string;
  kpiId?: string;
  year?: number;
  quarter?: number | null;
};

export type CycleListQuery = ListQuery & {
  status?: ReviewCycleStatus;
  year?: number;
};

export type ReviewListQuery = ListQuery & {
  status?: ReviewStatus;
  employeeId?: string;
  reviewerId?: string;
  cycleId?: string;
};

export type FeedbackListQuery = ListQuery & {
  type?: FeedbackType;
  fromEmployeeId?: string;
  toEmployeeId?: string;
  reviewId?: string;
  /** Restrict to feedback involving this employee (from or to). */
  involvingEmployeeId?: string;
};

export type PromotionListQuery = ListQuery & {
  status?: PromotionStatus;
  employeeId?: string;
};

export class PerformanceRepository {
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }

  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findEmployeeByUserId(companyId: string, userId: string) {
    return prisma.employee.findFirst({
      where: { companyId, userId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  findEmployeeBasic(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, designationId: true },
    });
  }

  findDesignation(companyId: string, id: string) {
    return prisma.designation.findFirst({
      where: { id, companyId, ...notDeleted },
      select: { id: true },
    });
  }

  updateEmployeeDesignation(employeeId: string, designationId: string, db: DbClient = prisma) {
    return db.employee.update({
      where: { id: employeeId },
      data: { designationId },
    });
  }

  // —— Goals ——
  async listGoals(companyId: string, query: GoalListQuery) {
    const where: Prisma.PerformanceGoalWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.performanceGoal.findMany({
        where,
        include: goalInclude,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.performanceGoal.count({ where }),
    ]);
    return { items, total };
  }

  findGoal(companyId: string, id: string) {
    return prisma.performanceGoal.findFirst({
      where: { id, companyId, ...notDeleted },
      include: goalInclude,
    });
  }

  createGoal(companyId: string, employeeId: string, data: CreateGoalInput) {
    return prisma.performanceGoal.create({
      data: {
        companyId,
        employeeId,
        title: data.title.trim(),
        description: data.description ?? null,
        targetValue: data.targetValue ?? null,
        currentValue: data.currentValue ?? 0,
        unit: data.unit ?? null,
        progress: data.progress ?? 0,
        priority: data.priority ?? 'MEDIUM',
        status: data.status ?? 'DRAFT',
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
      },
      include: goalInclude,
    });
  }

  updateGoal(id: string, data: UpdateGoalInput & { progress?: number; status?: GoalStatus }) {
    return prisma.performanceGoal.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.targetValue !== undefined ? { targetValue: data.targetValue } : {}),
        ...(data.currentValue !== undefined ? { currentValue: data.currentValue } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.progress !== undefined ? { progress: data.progress } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      },
      include: goalInclude,
    });
  }

  softDeleteGoal(id: string) {
    return prisma.performanceGoal.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
  }

  // —— KPIs ——
  async listKpis(companyId: string, query: KpiListQuery) {
    const where: Prisma.PerformanceKpiWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.performanceKpi.findMany({
        where,
        include: kpiInclude,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.performanceKpi.count({ where }),
    ]);
    return { items, total };
  }

  findKpi(companyId: string, id: string) {
    return prisma.performanceKpi.findFirst({
      where: { id, companyId, ...notDeleted },
      include: kpiInclude,
    });
  }

  createKpi(companyId: string, data: CreateKpiInput) {
    return prisma.performanceKpi.create({
      data: {
        companyId,
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        description: data.description ?? null,
        unit: data.unit ?? null,
        targetDefault: data.targetDefault ?? null,
        isActive: data.isActive ?? true,
      },
      include: kpiInclude,
    });
  }

  updateKpi(id: string, data: UpdateKpiInput) {
    return prisma.performanceKpi.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.targetDefault !== undefined ? { targetDefault: data.targetDefault } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: kpiInclude,
    });
  }

  softDeleteKpi(id: string) {
    return prisma.performanceKpi.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // —— Employee KPIs ——
  async listEmployeeKpis(companyId: string, query: EmployeeKpiListQuery) {
    const where: Prisma.EmployeeKpiWhereInput = {
      companyId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.kpiId ? { kpiId: query.kpiId } : {}),
      ...(query.year !== undefined ? { year: query.year } : {}),
      ...(query.quarter !== undefined
        ? query.quarter === null
          ? { quarter: null }
          : { quarter: query.quarter }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.employeeKpi.findMany({
        where,
        include: employeeKpiInclude,
        orderBy: [{ year: 'desc' }, { quarter: 'asc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.employeeKpi.count({ where }),
    ]);
    return { items, total };
  }

  findEmployeeKpiByKey(
    companyId: string,
    employeeId: string,
    kpiId: string,
    year: number,
    quarter: number | null,
  ) {
    return prisma.employeeKpi.findFirst({
      where: {
        companyId,
        employeeId,
        kpiId,
        year,
        quarter,
      },
      include: employeeKpiInclude,
    });
  }

  upsertEmployeeKpi(companyId: string, data: UpsertEmployeeKpiInput) {
    const quarter = data.quarter ?? null;
    const payload = {
      targetValue: data.targetValue ?? 0,
      actualValue: data.actualValue ?? 0,
      score: data.score ?? null,
      notes: data.notes ?? null,
    };

    if (quarter !== null) {
      return prisma.employeeKpi.upsert({
        where: {
          employeeId_kpiId_year_quarter: {
            employeeId: data.employeeId,
            kpiId: data.kpiId,
            year: data.year,
            quarter,
          },
        },
        create: {
          companyId,
          employeeId: data.employeeId,
          kpiId: data.kpiId,
          year: data.year,
          quarter,
          ...payload,
        },
        update: {
          ...(data.targetValue !== undefined ? { targetValue: data.targetValue } : {}),
          ...(data.actualValue !== undefined ? { actualValue: data.actualValue } : {}),
          ...(data.score !== undefined ? { score: data.score } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
        include: employeeKpiInclude,
      });
    }

    // Nullable quarter: compound upsert is unreliable with NULL — find then update/create.
    return this.findEmployeeKpiByKey(
      companyId,
      data.employeeId,
      data.kpiId,
      data.year,
      null,
    ).then(async (existing) => {
      if (existing) {
        return prisma.employeeKpi.update({
          where: { id: existing.id },
          data: {
            ...(data.targetValue !== undefined ? { targetValue: data.targetValue } : {}),
            ...(data.actualValue !== undefined ? { actualValue: data.actualValue } : {}),
            ...(data.score !== undefined ? { score: data.score } : {}),
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
          include: employeeKpiInclude,
        });
      }
      return prisma.employeeKpi.create({
        data: {
          companyId,
          employeeId: data.employeeId,
          kpiId: data.kpiId,
          year: data.year,
          quarter: null,
          ...payload,
        },
        include: employeeKpiInclude,
      });
    });
  }

  // —— Review cycles ——
  async listCycles(companyId: string, query: CycleListQuery) {
    const where: Prisma.ReviewCycleWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.year !== undefined ? { year: query.year } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.reviewCycle.findMany({
        where,
        include: cycleInclude,
        orderBy: [{ year: 'desc' }, { startDate: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.reviewCycle.count({ where }),
    ]);
    return { items, total };
  }

  findCycle(companyId: string, id: string) {
    return prisma.reviewCycle.findFirst({
      where: { id, companyId, ...notDeleted },
      include: cycleInclude,
    });
  }

  createCycle(companyId: string, data: CreateReviewCycleInput) {
    return prisma.reviewCycle.create({
      data: {
        companyId,
        name: data.name.trim(),
        year: data.year,
        startDate: data.startDate,
        endDate: data.endDate,
        status: data.status ?? 'DRAFT',
      },
      include: cycleInclude,
    });
  }

  updateCycle(id: string, data: UpdateReviewCycleInput) {
    return prisma.reviewCycle.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.year !== undefined ? { year: data.year } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: cycleInclude,
    });
  }

  updateCycleStatus(id: string, status: ReviewCycleStatus) {
    return prisma.reviewCycle.update({
      where: { id },
      data: { status },
      include: cycleInclude,
    });
  }

  softDeleteCycle(id: string) {
    return prisma.reviewCycle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // —— Reviews ——
  async listReviews(companyId: string, query: ReviewListQuery) {
    const where: Prisma.PerformanceReviewWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.reviewerId ? { reviewerId: query.reviewerId } : {}),
      ...(query.cycleId ? { cycleId: query.cycleId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where,
        include: reviewInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.performanceReview.count({ where }),
    ]);
    return { items, total };
  }

  findReview(companyId: string, id: string) {
    return prisma.performanceReview.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        ...reviewInclude,
        feedback: {
          where: notDeleted,
          include: {
            fromEmployee: { select: employeeSelect },
            toEmployee: { select: employeeSelect },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  createReview(companyId: string, data: CreateReviewInput) {
    return prisma.performanceReview.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        reviewerId: data.reviewerId ?? null,
        cycleId: data.cycleId ?? null,
        selfRating: data.selfRating ?? null,
        managerRating: data.managerRating ?? null,
        overallRating: data.overallRating ?? null,
        selfComments: data.selfComments ?? null,
        managerComments: data.managerComments ?? null,
        status: data.status ?? 'DRAFT',
      },
      include: reviewInclude,
    });
  }

  updateReview(id: string, data: UpdateReviewInput) {
    return prisma.performanceReview.update({
      where: { id },
      data: {
        ...(data.reviewerId !== undefined ? { reviewerId: data.reviewerId } : {}),
        ...(data.cycleId !== undefined ? { cycleId: data.cycleId } : {}),
        ...(data.selfRating !== undefined ? { selfRating: data.selfRating } : {}),
        ...(data.managerRating !== undefined ? { managerRating: data.managerRating } : {}),
        ...(data.overallRating !== undefined ? { overallRating: data.overallRating } : {}),
        ...(data.selfComments !== undefined ? { selfComments: data.selfComments } : {}),
        ...(data.managerComments !== undefined ? { managerComments: data.managerComments } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: reviewInclude,
    });
  }

  submitReview(id: string) {
    return prisma.performanceReview.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      include: reviewInclude,
    });
  }

  acknowledgeReview(id: string) {
    return prisma.performanceReview.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      include: reviewInclude,
    });
  }

  completeReview(id: string) {
    return prisma.performanceReview.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: reviewInclude,
    });
  }

  // —— Feedback ——
  async listFeedback(companyId: string, query: FeedbackListQuery) {
    const where: Prisma.PerformanceFeedbackWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.type ? { type: query.type } : {}),
      ...(query.fromEmployeeId ? { fromEmployeeId: query.fromEmployeeId } : {}),
      ...(query.toEmployeeId ? { toEmployeeId: query.toEmployeeId } : {}),
      ...(query.reviewId ? { reviewId: query.reviewId } : {}),
      ...(query.involvingEmployeeId
        ? {
            OR: [
              { fromEmployeeId: query.involvingEmployeeId },
              { toEmployeeId: query.involvingEmployeeId },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.performanceFeedback.findMany({
        where,
        include: feedbackInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.performanceFeedback.count({ where }),
    ]);
    return { items, total };
  }

  findFeedback(companyId: string, id: string) {
    return prisma.performanceFeedback.findFirst({
      where: { id, companyId, ...notDeleted },
      include: feedbackInclude,
    });
  }

  createFeedback(
    companyId: string,
    fromEmployeeId: string,
    data: CreateFeedbackInput,
  ) {
    return prisma.performanceFeedback.create({
      data: {
        companyId,
        fromEmployeeId,
        toEmployeeId: data.toEmployeeId,
        type: data.type ?? 'GENERAL',
        rating: data.rating ?? null,
        content: data.content.trim(),
        isAnonymous: data.isAnonymous ?? false,
        reviewId: data.reviewId ?? null,
      },
      include: feedbackInclude,
    });
  }

  softDeleteFeedback(id: string) {
    return prisma.performanceFeedback.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // —— Promotions ——
  async listPromotions(companyId: string, query: PromotionListQuery) {
    const where: Prisma.PromotionRequestWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.promotionRequest.findMany({
        where,
        include: promotionInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.promotionRequest.count({ where }),
    ]);
    return { items, total };
  }

  findPromotion(companyId: string, id: string) {
    return prisma.promotionRequest.findFirst({
      where: { id, companyId, ...notDeleted },
      include: promotionInclude,
    });
  }

  createPromotion(companyId: string, employeeId: string, data: CreatePromotionInput) {
    return prisma.promotionRequest.create({
      data: {
        companyId,
        employeeId,
        proposedDesignationId: data.proposedDesignationId ?? null,
        proposedTitle: data.proposedTitle ?? null,
        reason: data.reason.trim(),
        effectiveDate: data.effectiveDate ?? null,
        status: data.status ?? 'DRAFT',
      },
      include: promotionInclude,
    });
  }

  updatePromotion(id: string, data: UpdatePromotionInput) {
    return prisma.promotionRequest.update({
      where: { id },
      data: {
        ...(data.employeeId ? { employeeId: data.employeeId } : {}),
        ...(data.proposedDesignationId !== undefined
          ? { proposedDesignationId: data.proposedDesignationId }
          : {}),
        ...(data.proposedTitle !== undefined ? { proposedTitle: data.proposedTitle } : {}),
        ...(data.reason !== undefined ? { reason: data.reason.trim() } : {}),
        ...(data.effectiveDate !== undefined ? { effectiveDate: data.effectiveDate } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: promotionInclude,
    });
  }

  submitPromotion(id: string) {
    return prisma.promotionRequest.update({
      where: { id },
      data: { status: 'PENDING' },
      include: promotionInclude,
    });
  }

  reviewPromotion(
    id: string,
    data: {
      status: 'APPROVED' | 'REJECTED';
      reviewedBy: string;
      reviewNotes?: string | null;
      effectiveDate?: Date | null;
    },
    db: DbClient = prisma,
  ) {
    return db.promotionRequest.update({
      where: { id },
      data: {
        status: data.status,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: data.reviewNotes ?? null,
        ...(data.effectiveDate !== undefined ? { effectiveDate: data.effectiveDate } : {}),
      },
      include: promotionInclude,
    });
  }

  withdrawPromotion(id: string) {
    return prisma.promotionRequest.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
      include: promotionInclude,
    });
  }

  // —— Summary / Report ——
  goalStatusCounts(companyId: string, employeeId?: string, year?: number) {
    return prisma.performanceGoal.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
        ...(year
          ? {
              OR: [
                { startDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
                { dueDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } },
                { AND: [{ startDate: null }, { dueDate: null }] },
              ],
            }
          : {}),
      },
      _count: { _all: true },
    });
  }

  reviewStatusCounts(companyId: string, employeeId?: string, year?: number) {
    return prisma.performanceReview.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
        ...(year
          ? {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
            }
          : {}),
      },
      _count: { _all: true },
    });
  }

  promotionStatusCounts(companyId: string, employeeId?: string) {
    return prisma.promotionRequest.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
      },
      _count: { _all: true },
    });
  }

  countActiveGoals(companyId: string, employeeId?: string) {
    return prisma.performanceGoal.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(employeeId ? { employeeId } : {}),
      },
    });
  }

  countActiveCycles(companyId: string) {
    return prisma.reviewCycle.count({
      where: { companyId, deletedAt: null, status: 'ACTIVE' },
    });
  }

  countPendingPromotions(companyId: string, employeeId?: string) {
    return prisma.promotionRequest.count({
      where: {
        companyId,
        deletedAt: null,
        status: 'PENDING',
        ...(employeeId ? { employeeId } : {}),
      },
    });
  }

  countFeedbackReceived(companyId: string, toEmployeeId?: string, year?: number) {
    return prisma.performanceFeedback.count({
      where: {
        companyId,
        deletedAt: null,
        ...(toEmployeeId ? { toEmployeeId } : {}),
        ...(year
          ? {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
            }
          : {}),
      },
    });
  }

  avgReviewRating(companyId: string, employeeId?: string, year?: number) {
    return prisma.performanceReview.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ['SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'] },
        overallRating: { not: null },
        ...(employeeId ? { employeeId } : {}),
        ...(year
          ? {
              createdAt: {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${year + 1}-01-01`),
              },
            }
          : {}),
      },
      _avg: { overallRating: true },
      _count: { _all: true },
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
