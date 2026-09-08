import type { CandidateStage, JobOpeningStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const jobInclude = {
  department: { select: { id: true, name: true } },
  _count: { select: { candidates: { where: { deletedAt: null } } } },
} satisfies Prisma.JobOpeningInclude;

const candidateInclude = {
  jobOpening: {
    select: {
      id: true,
      title: true,
      locationLabel: true,
      status: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.CandidateInclude;

export type JobOpeningWithRelations = Prisma.JobOpeningGetPayload<{ include: typeof jobInclude }>;
export type CandidateWithJob = Prisma.CandidateGetPayload<{ include: typeof candidateInclude }>;

export class RecruitmentRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findDepartment(companyId: string, departmentId: string) {
    return prisma.department.findFirst({
      where: { id: departmentId, companyId, deletedAt: null },
    });
  }

  findJob(companyId: string, id: string) {
    return prisma.jobOpening.findFirst({
      where: { id, companyId, deletedAt: null },
      include: jobInclude,
    });
  }

  findCandidate(companyId: string, id: string) {
    return prisma.candidate.findFirst({
      where: { id, companyId, deletedAt: null },
      include: candidateInclude,
    });
  }

  countOpenJobs(companyId: string) {
    return prisma.jobOpening.count({
      where: { companyId, status: 'OPEN', deletedAt: null },
    });
  }

  countActiveCandidates(companyId: string) {
    return prisma.candidate.count({
      where: {
        companyId,
        deletedAt: null,
        stage: { notIn: ['REJECTED'] },
      },
    });
  }

  groupCandidatesByStage(companyId: string) {
    return prisma.candidate.groupBy({
      by: ['stage'],
      where: { companyId, deletedAt: null, stage: { not: 'REJECTED' } },
      _count: { _all: true },
    });
  }

  listPipeline(companyId: string) {
    return prisma.candidate.findMany({
      where: {
        companyId,
        deletedAt: null,
        stage: { in: ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'] },
      },
      include: candidateInclude,
      orderBy: [{ score: 'desc' }, { appliedAt: 'desc' }],
    });
  }

  listJobs(
    companyId: string,
    options: {
      status?: JobOpeningStatus;
      search?: string;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.JobOpeningWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: 'insensitive' } },
              { locationLabel: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.jobOpening.findMany({
        where,
        include: jobInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.jobOpening.count({ where }),
    ]);
  }

  createJob(data: {
    companyId: string;
    title: string;
    departmentId?: string;
    locationLabel?: string;
    description?: string;
    status: JobOpeningStatus;
    openingsCount: number;
  }) {
    return prisma.jobOpening.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        departmentId: data.departmentId,
        locationLabel: data.locationLabel,
        description: data.description,
        status: data.status,
        openingsCount: data.openingsCount,
      },
      include: jobInclude,
    });
  }

  updateJob(id: string, data: Prisma.JobOpeningUpdateInput) {
    return prisma.jobOpening.update({
      where: { id },
      data,
      include: jobInclude,
    });
  }

  softDeleteJob(id: string) {
    return prisma.jobOpening.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CLOSED' },
    });
  }

  listCandidates(
    companyId: string,
    options: {
      stage?: CandidateStage;
      jobOpeningId?: string;
      search?: string;
      skip: number;
      take: number;
    },
  ) {
    const where: Prisma.CandidateWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.stage ? { stage: options.stage } : {}),
      ...(options.jobOpeningId ? { jobOpeningId: options.jobOpeningId } : {}),
      ...(options.search
        ? {
            OR: [
              { firstName: { contains: options.search, mode: 'insensitive' } },
              { lastName: { contains: options.search, mode: 'insensitive' } },
              { email: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.candidate.findMany({
        where,
        include: candidateInclude,
        orderBy: [{ appliedAt: 'desc' }],
        skip: options.skip,
        take: options.take,
      }),
      prisma.candidate.count({ where }),
    ]);
  }

  createCandidate(data: {
    companyId: string;
    jobOpeningId: string;
    firstName: string;
    lastName: string;
    email: string;
    locationLabel?: string;
    stage: CandidateStage;
    score?: number;
    notes?: string;
  }) {
    return prisma.candidate.create({
      data: {
        companyId: data.companyId,
        jobOpeningId: data.jobOpeningId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        locationLabel: data.locationLabel,
        stage: data.stage,
        score: data.score,
        notes: data.notes,
      },
      include: candidateInclude,
    });
  }

  updateCandidate(id: string, data: Prisma.CandidateUpdateInput) {
    return prisma.candidate.update({
      where: { id },
      data,
      include: candidateInclude,
    });
  }

  softDeleteCandidate(id: string) {
    return prisma.candidate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  listAppliedForScreening(companyId: string) {
    return prisma.candidate.findMany({
      where: { companyId, deletedAt: null, stage: 'APPLIED' },
      include: candidateInclude,
      orderBy: { appliedAt: 'asc' },
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
