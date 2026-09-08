import { ForbiddenError, NotFoundError, ValidationError } from '../../../utils/app-error.js';
import {
  RecruitmentRepository,
  type CandidateWithJob,
  type JobOpeningWithRelations,
} from '../repositories/recruitment.repository.js';
import type {
  CandidateListQuery,
  CreateCandidateInput,
  CreateJobInput,
  JobListQuery,
  UpdateCandidateInput,
  UpdateJobInput,
} from '../validators/recruitment.validators.js';

const PIPELINE_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'] as const;

function toJobDto(job: JobOpeningWithRelations) {
  return {
    id: job.id,
    companyId: job.companyId,
    title: job.title,
    locationLabel: job.locationLabel,
    description: job.description,
    status: job.status,
    openingsCount: job.openingsCount,
    candidateCount: job._count.candidates,
    department: job.department
      ? { id: job.department.id, name: job.department.name }
      : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toCandidateDto(candidate: CandidateWithJob) {
  return {
    id: candidate.id,
    companyId: candidate.companyId,
    jobOpeningId: candidate.jobOpeningId,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    email: candidate.email,
    locationLabel: candidate.locationLabel,
    stage: candidate.stage,
    score: candidate.score,
    notes: candidate.notes,
    appliedAt: candidate.appliedAt,
    initials: `${candidate.firstName.charAt(0)}${candidate.lastName.charAt(0)}`.toUpperCase(),
    jobOpening: {
      id: candidate.jobOpening.id,
      title: candidate.jobOpening.title,
      locationLabel: candidate.jobOpening.locationLabel,
      status: candidate.jobOpening.status,
      department: candidate.jobOpening.department
        ? {
            id: candidate.jobOpening.department.id,
            name: candidate.jobOpening.department.name,
          }
        : null,
    },
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
}

function pseudoScore(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000;
  }
  return 70 + (hash % 26);
}

export class RecruitmentService {
  constructor(private readonly repo = new RecruitmentRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  async summary(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const [openRoles, candidatesInFlight, stageGroups] = await Promise.all([
      this.repo.countOpenJobs(companyId),
      this.repo.countActiveCandidates(companyId),
      this.repo.groupCandidatesByStage(companyId),
    ]);

    const stageCounts = Object.fromEntries(
      PIPELINE_STAGES.map((stage) => [stage, 0]),
    ) as Record<(typeof PIPELINE_STAGES)[number], number>;

    for (const group of stageGroups) {
      if (group.stage in stageCounts) {
        stageCounts[group.stage as (typeof PIPELINE_STAGES)[number]] = group._count._all;
      }
    }

    return { openRoles, candidatesInFlight, stageCounts };
  }

  async pipeline(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const items = await this.repo.listPipeline(companyId);
    const columns = PIPELINE_STAGES.map((stage) => {
      const stageItems = items
        .filter((item) => item.stage === stage)
        .map(toCandidateDto);
      return {
        stage,
        label: stage.charAt(0) + stage.slice(1).toLowerCase(),
        count: stageItems.length,
        items: stageItems,
      };
    });

    return { columns };
  }

  async listJobs(userId: string, query: JobListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listJobs(companyId, {
      status: query.status,
      search: query.search,
      skip,
      take: query.pageSize,
    });

    return {
      items: items.map(toJobDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async createJob(userId: string, input: CreateJobInput) {
    const companyId = await this.requireCompanyId(userId);
    if (input.departmentId) {
      const department = await this.repo.findDepartment(companyId, input.departmentId);
      if (!department) {
        throw new ValidationError('Department not found');
      }
    }

    const job = await this.repo.createJob({
      companyId,
      title: input.title,
      departmentId: input.departmentId,
      locationLabel: input.locationLabel,
      description: input.description,
      status: input.status,
      openingsCount: input.openingsCount,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.job.create',
      entityType: 'JobOpening',
      entityId: job.id,
    });

    return toJobDto(job);
  }

  async updateJob(userId: string, id: string, input: UpdateJobInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findJob(companyId, id);
    if (!existing) {
      throw new NotFoundError('Job opening not found');
    }

    if (input.departmentId) {
      const department = await this.repo.findDepartment(companyId, input.departmentId);
      if (!department) {
        throw new ValidationError('Department not found');
      }
    }

    const job = await this.repo.updateJob(id, {
      title: input.title,
      locationLabel: input.locationLabel,
      description: input.description,
      status: input.status,
      openingsCount: input.openingsCount,
      ...(input.departmentId !== undefined
        ? input.departmentId
          ? { department: { connect: { id: input.departmentId } } }
          : { department: { disconnect: true } }
        : {}),
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.job.update',
      entityType: 'JobOpening',
      entityId: job.id,
    });

    return toJobDto(job);
  }

  async removeJob(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findJob(companyId, id);
    if (!existing) {
      throw new NotFoundError('Job opening not found');
    }

    await this.repo.softDeleteJob(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.job.delete',
      entityType: 'JobOpening',
      entityId: id,
    });

    return { deleted: true };
  }

  async listCandidates(userId: string, query: CandidateListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listCandidates(companyId, {
      stage: query.stage,
      jobOpeningId: query.jobOpeningId,
      search: query.search,
      skip,
      take: query.pageSize,
    });

    return {
      items: items.map(toCandidateDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async createCandidate(userId: string, input: CreateCandidateInput) {
    const companyId = await this.requireCompanyId(userId);
    const job = await this.repo.findJob(companyId, input.jobOpeningId);
    if (!job) {
      throw new ValidationError('Job opening not found');
    }

    const candidate = await this.repo.createCandidate({
      companyId,
      jobOpeningId: input.jobOpeningId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      locationLabel: input.locationLabel,
      stage: input.stage,
      score: input.score,
      notes: input.notes,
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.candidate.create',
      entityType: 'Candidate',
      entityId: candidate.id,
    });

    return toCandidateDto(candidate);
  }

  async updateCandidate(userId: string, id: string, input: UpdateCandidateInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findCandidate(companyId, id);
    if (!existing) {
      throw new NotFoundError('Candidate not found');
    }

    if (input.jobOpeningId) {
      const job = await this.repo.findJob(companyId, input.jobOpeningId);
      if (!job) {
        throw new ValidationError('Job opening not found');
      }
    }

    const candidate = await this.repo.updateCandidate(id, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      locationLabel: input.locationLabel === null ? null : input.locationLabel,
      stage: input.stage,
      score: input.score === null ? null : input.score,
      notes: input.notes === null ? null : input.notes,
      ...(input.jobOpeningId
        ? { jobOpening: { connect: { id: input.jobOpeningId } } }
        : {}),
    });

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.candidate.update',
      entityType: 'Candidate',
      entityId: candidate.id,
    });

    return toCandidateDto(candidate);
  }

  async removeCandidate(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findCandidate(companyId, id);
    if (!existing) {
      throw new NotFoundError('Candidate not found');
    }

    await this.repo.softDeleteCandidate(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.candidate.delete',
      entityType: 'Candidate',
      entityId: id,
    });

    return { deleted: true };
  }

  async aiScreen(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const applied = await this.repo.listAppliedForScreening(companyId);
    const updated = [];

    for (const candidate of applied) {
      const score = candidate.score ?? pseudoScore(candidate.id + candidate.email);
      const next = await this.repo.updateCandidate(candidate.id, {
        stage: 'SCREENING',
        score,
      });
      updated.push(toCandidateDto(next));
    }

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'recruitment.ai_screen',
      entityType: 'Candidate',
      metadata: { screened: updated.length },
    });

    return { screened: updated.length, items: updated };
  }
}
