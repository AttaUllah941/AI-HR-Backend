import type { AiFeature, AiMessageRole, AiRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const notDeleted = { deletedAt: null };

const employeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  employmentType: true,
  status: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
} satisfies Prisma.EmployeeSelect;

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  currentTitle: true,
  currentCompany: true,
  yearsExperience: true,
  resumeUrl: true,
  resumeFileName: true,
  screeningScore: true,
  screeningNotes: true,
  notes: true,
  source: true,
} satisfies Prisma.CandidateSelect;

const jobSelect = {
  id: true,
  title: true,
  code: true,
  description: true,
  requirements: true,
  employmentType: true,
  location: true,
  status: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
} satisfies Prisma.JobOpeningSelect;

const conversationInclude = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { messages: true } },
} satisfies Prisma.AiConversationInclude;

export type ListQuery = {
  page: number;
  pageSize: number;
};

export class AiRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  // —— Context loaders ——

  findCandidate(companyId: string, id: string) {
    return prisma.candidate.findFirst({
      where: { id, companyId, ...notDeleted },
      select: candidateSelect,
    });
  }

  findJobOpening(companyId: string, id: string) {
    return prisma.jobOpening.findFirst({
      where: { id, companyId, ...notDeleted },
      select: jobSelect,
    });
  }

  findEmployee(companyId: string, id: string) {
    return prisma.employee.findFirst({
      where: { id, companyId, ...notDeleted },
      select: employeeSelect,
    });
  }

  findEmployeeGoals(companyId: string, employeeId: string, take = 20) {
    return prisma.performanceGoal.findMany({
      where: { companyId, employeeId, ...notDeleted },
      orderBy: { updatedAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        description: true,
        progress: true,
        status: true,
        priority: true,
        targetValue: true,
        currentValue: true,
        unit: true,
      },
    });
  }

  findEmployeeKpis(companyId: string, employeeId: string, take = 20) {
    return prisma.employeeKpi.findMany({
      where: { companyId, employeeId },
      orderBy: [{ year: 'desc' }, { updatedAt: 'desc' }],
      take,
      select: {
        id: true,
        year: true,
        quarter: true,
        targetValue: true,
        actualValue: true,
        score: true,
        notes: true,
        kpi: { select: { id: true, name: true, code: true, unit: true } },
      },
    });
  }

  findPerformanceReview(companyId: string, id: string) {
    return prisma.performanceReview.findFirst({
      where: { id, companyId, ...notDeleted },
      select: {
        id: true,
        status: true,
        selfRating: true,
        managerRating: true,
        overallRating: true,
        selfComments: true,
        managerComments: true,
        employeeId: true,
        cycle: { select: { id: true, name: true, year: true, status: true } },
      },
    });
  }

  updateCandidateScreening(
    id: string,
    data: { screeningScore?: number | null; screeningNotes?: string | null },
  ) {
    return prisma.candidate.update({
      where: { id },
      data: {
        ...(data.screeningScore !== undefined ? { screeningScore: data.screeningScore } : {}),
        ...(data.screeningNotes !== undefined ? { screeningNotes: data.screeningNotes } : {}),
      },
      select: candidateSelect,
    });
  }

  // —— Company insight counts ——

  async companyInsightCounts(companyId: string) {
    const [
      employees,
      activeEmployees,
      openJobs,
      candidates,
      applications,
      pendingLeave,
      goalsActive,
      reviewsOpen,
      attendanceToday,
    ] = await Promise.all([
      prisma.employee.count({ where: { companyId, ...notDeleted } }),
      prisma.employee.count({
        where: { companyId, ...notDeleted, status: 'ACTIVE' },
      }),
      prisma.jobOpening.count({
        where: { companyId, ...notDeleted, status: 'OPEN' },
      }),
      prisma.candidate.count({ where: { companyId, ...notDeleted } }),
      prisma.jobApplication.count({ where: { companyId, ...notDeleted } }),
      prisma.leaveRequest.count({
        where: { companyId, ...notDeleted, status: 'PENDING' },
      }),
      prisma.performanceGoal.count({
        where: { companyId, ...notDeleted, status: 'ACTIVE' },
      }),
      prisma.performanceReview.count({
        where: {
          companyId,
          ...notDeleted,
          status: { in: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED'] },
        },
      }),
      prisma.attendanceRecord.count({
        where: {
          companyId,
          ...notDeleted,
          date: {
            gte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
          },
        },
      }),
    ]);

    return {
      employees,
      activeEmployees,
      openJobs,
      candidates,
      applications,
      pendingLeave,
      goalsActive,
      reviewsOpen,
      attendanceToday,
    };
  }

  // —— Usage logs ——

  createUsageLog(data: {
    companyId: string;
    userId?: string | null;
    feature: AiFeature;
    provider: string;
    model?: string | null;
    status: AiRequestStatus;
    promptTokens?: number | null;
    completionTokens?: number | null;
    latencyMs?: number | null;
    errorMessage?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.aiUsageLog.create({
      data: {
        companyId: data.companyId,
        userId: data.userId ?? null,
        feature: data.feature,
        provider: data.provider,
        model: data.model ?? null,
        status: data.status,
        promptTokens: data.promptTokens ?? null,
        completionTokens: data.completionTokens ?? null,
        latencyMs: data.latencyMs ?? null,
        errorMessage: data.errorMessage ?? null,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  usageCountsByFeature(companyId: string) {
    return prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { companyId },
      _count: { _all: true },
    });
  }

  usageStatusCounts(companyId: string) {
    return prisma.aiUsageLog.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { _all: true },
    });
  }

  // —— Conversations / messages ——

  listConversations(companyId: string, userId: string, query: ListQuery) {
    const where: Prisma.AiConversationWhereInput = {
      companyId,
      userId,
      ...notDeleted,
    };
    return Promise.all([
      prisma.aiConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          _count: { select: { messages: true } },
        },
      }),
      prisma.aiConversation.count({ where }),
    ]);
  }

  findConversation(companyId: string, id: string, userId?: string) {
    return prisma.aiConversation.findFirst({
      where: {
        id,
        companyId,
        ...notDeleted,
        ...(userId ? { userId } : {}),
      },
      include: conversationInclude,
    });
  }

  createConversation(data: {
    companyId: string;
    userId: string;
    title?: string | null;
  }) {
    return prisma.aiConversation.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        title: data.title ?? null,
      },
    });
  }

  touchConversation(id: string, title?: string | null) {
    return prisma.aiConversation.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        updatedAt: new Date(),
      },
    });
  }

  softDeleteConversation(id: string) {
    return prisma.aiConversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  createMessage(data: {
    conversationId: string;
    role: AiMessageRole;
    content: string;
  }) {
    return prisma.aiMessage.create({
      data: {
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
      },
    });
  }

  listMessages(conversationId: string) {
    return prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // —— Generations ——

  createGeneration(data: {
    companyId: string;
    userId?: string | null;
    feature: AiFeature;
    status?: AiRequestStatus;
    input: Prisma.InputJsonValue;
    output: Prisma.InputJsonValue;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    provider?: string | null;
    model?: string | null;
  }) {
    return prisma.aiGeneration.create({
      data: {
        companyId: data.companyId,
        userId: data.userId ?? null,
        feature: data.feature,
        status: data.status ?? 'SUCCESS',
        input: data.input,
        output: data.output,
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
        provider: data.provider ?? null,
        model: data.model ?? null,
      },
    });
  }

  listGenerations(
    companyId: string,
    query: ListQuery & {
      feature?: AiFeature;
      featureIn?: AiFeature[];
      userId?: string;
    },
  ) {
    const where: Prisma.AiGenerationWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.feature ? { feature: query.feature } : {}),
      ...(query.featureIn ? { feature: { in: query.featureIn } } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    return Promise.all([
      prisma.aiGeneration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.aiGeneration.count({ where }),
    ]);
  }

  findGeneration(
    companyId: string,
    id: string,
    opts?: { userId?: string; featureIn?: AiFeature[] },
  ) {
    return prisma.aiGeneration.findFirst({
      where: {
        id,
        companyId,
        ...notDeleted,
        ...(opts?.userId ? { userId: opts.userId } : {}),
        ...(opts?.featureIn ? { feature: { in: opts.featureIn } } : {}),
      },
    });
  }

  findLatestGeneration(companyId: string, feature: AiFeature) {
    return prisma.aiGeneration.findFirst({
      where: { companyId, feature, ...notDeleted, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });
  }

  softDeleteGeneration(id: string) {
    return prisma.aiGeneration.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  countConversations(companyId: string, userId?: string) {
    return prisma.aiConversation.count({
      where: {
        companyId,
        ...notDeleted,
        ...(userId ? { userId } : {}),
      },
    });
  }

  countGenerations(
    companyId: string,
    opts?: { userId?: string; featureIn?: AiFeature[] },
  ) {
    return prisma.aiGeneration.count({
      where: {
        companyId,
        ...notDeleted,
        ...(opts?.userId ? { userId: opts.userId } : {}),
        ...(opts?.featureIn ? { feature: { in: opts.featureIn } } : {}),
      },
    });
  }

  recentGenerations(
    companyId: string,
    take = 10,
    opts?: { userId?: string; featureIn?: AiFeature[] },
  ) {
    return prisma.aiGeneration.findMany({
      where: {
        companyId,
        ...notDeleted,
        ...(opts?.userId ? { userId: opts.userId } : {}),
        ...(opts?.featureIn ? { feature: { in: opts.featureIn } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        feature: true,
        status: true,
        relatedEntityType: true,
        relatedEntityId: true,
        provider: true,
        model: true,
        createdAt: true,
        output: true,
      },
    });
  }
}
