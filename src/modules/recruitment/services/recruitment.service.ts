import type { ApplicationStatus } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { RecruitmentRepository } from '../repositories/recruitment.repository.js';
import type {
  AttachResumeInput,
  CompleteInterviewInput,
  CreateApplicationInput,
  CreateCandidateInput,
  CreateInterviewInput,
  CreateJobOpeningInput,
  CreateOfferInput,
  RespondOfferInput,
  UpdateApplicationStatusInput,
  UpdateCandidateInput,
  UpdateInterviewInput,
  UpdateJobOpeningInput,
  UpdateOfferInput,
} from '../validators/recruitment.validators.js';

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

export class RecruitmentService {
  constructor(private readonly repo = new RecruitmentRepository()) {}

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

  private canApprove(actor: AuthActor): boolean {
    return actor.permissions.includes('recruitment:approve');
  }

  private async validateJobRefs(companyId: string, input: {
    departmentId?: string | null;
    designationId?: string | null;
    branchId?: string | null;
    hiringManagerId?: string | null;
  }) {
    if (input.departmentId) {
      const dept = await this.repo.findDepartment(companyId, input.departmentId);
      if (!dept) throw new ValidationError('Invalid department');
    }
    if (input.designationId) {
      const desig = await this.repo.findDesignation(companyId, input.designationId);
      if (!desig) throw new ValidationError('Invalid designation');
    }
    if (input.branchId) {
      const branch = await this.repo.findBranch(companyId, input.branchId);
      if (!branch) throw new ValidationError('Invalid branch');
    }
    if (input.hiringManagerId) {
      const mgr = await this.repo.findEmployeeBasic(companyId, input.hiringManagerId);
      if (!mgr) throw new ValidationError('Invalid hiring manager');
    }
  }

  // —— Summary / Pipeline / Report ——
  async summary(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const [jobRows, appRows, interviewRows, offerRows, candidates, openJobs] = await Promise.all([
      this.repo.jobStatusCounts(companyId),
      this.repo.applicationStatusCounts(companyId),
      this.repo.interviewStatusCounts(companyId),
      this.repo.offerStatusCounts(companyId),
      this.repo.countCandidates(companyId),
      this.repo.countOpenJobs(companyId),
    ]);

    const jobsByStatus = countsByKey(jobRows);
    const applicationsByStatus = countsByKey(appRows);
    const interviewsByStatus = countsByKey(interviewRows);
    const offersByStatus = countsByKey(offerRows);

    return {
      openJobs,
      totalCandidates: candidates,
      jobsByStatus,
      applicationsByStatus,
      interviewsByStatus,
      offersByStatus,
      activePipeline:
        (applicationsByStatus.APPLIED ?? 0) +
        (applicationsByStatus.SCREENING ?? 0) +
        (applicationsByStatus.INTERVIEW ?? 0) +
        (applicationsByStatus.OFFER ?? 0),
      scheduledInterviews: interviewsByStatus.SCHEDULED ?? 0,
      pendingOffers: (offersByStatus.DRAFT ?? 0) + (offersByStatus.SENT ?? 0),
    };
  }

  async pipeline(actor: AuthActor, jobOpeningId?: string) {
    const companyId = await this.requireCompanyId(actor.id);
    if (jobOpeningId) {
      const job = await this.repo.findJob(companyId, jobOpeningId);
      if (!job) throw new NotFoundError('Job opening not found');
    }

    const applications = await this.repo.listPipelineApplications(companyId, jobOpeningId);
    const stages: Record<string, typeof applications> = {
      APPLIED: [],
      SCREENING: [],
      INTERVIEW: [],
      OFFER: [],
      HIRED: [],
      REJECTED: [],
    };
    for (const app of applications) {
      const bucket = stages[app.status];
      if (bucket) bucket.push(app);
      else {
        stages[app.status] = [app];
      }
    }

    return {
      jobOpeningId: jobOpeningId ?? null,
      stages,
      totals: Object.fromEntries(
        Object.entries(stages).map(([status, items]) => [status, items.length]),
      ),
    };
  }

  async report(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const jobOpeningId = params.jobOpeningId || undefined;
    if (jobOpeningId) {
      const job = await this.repo.findJob(companyId, jobOpeningId);
      if (!job) throw new NotFoundError('Job opening not found');
    }

    const [jobRows, appRows, interviewRows, offerRows] = await Promise.all([
      this.repo.jobStatusCounts(companyId),
      this.repo.applicationStatusCounts(companyId, jobOpeningId),
      this.repo.interviewStatusCounts(companyId),
      this.repo.offerStatusCounts(companyId),
    ]);

    return {
      jobOpeningId: jobOpeningId ?? null,
      jobsByStatus: countsByKey(jobRows),
      applicationsByStatus: countsByKey(appRows),
      interviewsByStatus: countsByKey(interviewRows),
      offersByStatus: countsByKey(offerRows),
    };
  }

  // —— Jobs ——
  async listJobs(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listJobs(companyId, {
      page,
      pageSize,
      status: params.status as never,
      departmentId: params.departmentId,
      search: params.search,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getJob(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const job = await this.repo.findJob(companyId, id);
    if (!job) throw new NotFoundError('Job opening not found');
    return job;
  }

  async createJob(actor: AuthActor, input: CreateJobOpeningInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.validateJobRefs(companyId, input);
    if (
      input.salaryMin != null &&
      input.salaryMax != null &&
      input.salaryMin > input.salaryMax
    ) {
      throw new ValidationError('salaryMin cannot exceed salaryMax');
    }
    try {
      const job = await this.repo.createJob(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.job.create',
        entityType: 'JobOpening',
        entityId: job.id,
      });
      return job;
    } catch (error) {
      this.rethrowUnique(error, 'Job opening code already exists');
    }
  }

  async updateJob(actor: AuthActor, id: string, input: UpdateJobOpeningInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findJob(companyId, id);
    if (!existing) throw new NotFoundError('Job opening not found');
    await this.validateJobRefs(companyId, input);
    const salaryMin = input.salaryMin !== undefined ? input.salaryMin : existing.salaryMin;
    const salaryMax = input.salaryMax !== undefined ? input.salaryMax : existing.salaryMax;
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
      throw new ValidationError('salaryMin cannot exceed salaryMax');
    }
    try {
      const job = await this.repo.updateJob(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.job.update',
        entityType: 'JobOpening',
        entityId: id,
      });
      return job;
    } catch (error) {
      this.rethrowUnique(error, 'Job opening code already exists');
    }
  }

  async deleteJob(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findJob(companyId, id);
    if (!existing) throw new NotFoundError('Job opening not found');
    await this.repo.softDeleteJob(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.job.delete',
      entityType: 'JobOpening',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async publishJob(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const job = await this.repo.findJob(companyId, id);
    if (!job) throw new NotFoundError('Job opening not found');
    if (job.status !== 'DRAFT' && job.status !== 'ON_HOLD') {
      throw new ValidationError('Only draft or on-hold jobs can be published');
    }
    const updated = await this.repo.updateJobStatus(id, 'OPEN', {
      publishedAt: job.publishedAt ?? new Date(),
      closedAt: null,
    });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.job.publish',
      entityType: 'JobOpening',
      entityId: id,
    });
    return updated;
  }

  async closeJob(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const job = await this.repo.findJob(companyId, id);
    if (!job) throw new NotFoundError('Job opening not found');
    if (job.status !== 'OPEN' && job.status !== 'ON_HOLD') {
      throw new ValidationError('Only open or on-hold jobs can be closed');
    }
    const updated = await this.repo.updateJobStatus(id, 'CLOSED', { closedAt: new Date() });
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.job.close',
      entityType: 'JobOpening',
      entityId: id,
    });
    return updated;
  }

  async holdJob(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const job = await this.repo.findJob(companyId, id);
    if (!job) throw new NotFoundError('Job opening not found');
    if (job.status !== 'OPEN') {
      throw new ValidationError('Only open jobs can be put on hold');
    }
    const updated = await this.repo.updateJobStatus(id, 'ON_HOLD');
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.job.hold',
      entityType: 'JobOpening',
      entityId: id,
    });
    return updated;
  }

  // —— Candidates ——
  async listCandidates(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listCandidates(companyId, {
      page,
      pageSize,
      search: params.search,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getCandidate(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const candidate = await this.repo.findCandidate(companyId, id);
    if (!candidate) throw new NotFoundError('Candidate not found');
    return candidate;
  }

  async createCandidate(actor: AuthActor, input: CreateCandidateInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const candidate = await this.repo.createCandidate(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.candidate.create',
        entityType: 'Candidate',
        entityId: candidate.id,
      });
      return candidate;
    } catch (error) {
      this.rethrowUnique(error, 'A candidate with this email already exists');
    }
  }

  async updateCandidate(actor: AuthActor, id: string, input: UpdateCandidateInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCandidate(companyId, id);
    if (!existing) throw new NotFoundError('Candidate not found');
    try {
      const candidate = await this.repo.updateCandidate(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.candidate.update',
        entityType: 'Candidate',
        entityId: id,
      });
      return candidate;
    } catch (error) {
      this.rethrowUnique(error, 'A candidate with this email already exists');
    }
  }

  async deleteCandidate(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCandidate(companyId, id);
    if (!existing) throw new NotFoundError('Candidate not found');
    await this.repo.softDeleteCandidate(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.candidate.delete',
      entityType: 'Candidate',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async attachResume(actor: AuthActor, id: string, input: AttachResumeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCandidate(companyId, id);
    if (!existing) throw new NotFoundError('Candidate not found');
    const candidate = await this.repo.attachResume(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.candidate.attach_resume',
      entityType: 'Candidate',
      entityId: id,
    });
    return candidate;
  }

  async updateScreening(
    actor: AuthActor,
    id: string,
    input: Pick<UpdateCandidateInput, 'screeningScore' | 'screeningNotes'>,
  ) {
    return this.updateCandidate(actor, id, input);
  }

  // —— Applications ——
  async listApplications(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listApplications(companyId, {
      page,
      pageSize,
      status: params.status as never,
      jobOpeningId: params.jobOpeningId,
      candidateId: params.candidateId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getApplication(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const application = await this.repo.findApplication(companyId, id);
    if (!application) throw new NotFoundError('Application not found');
    return application;
  }

  async createApplication(actor: AuthActor, input: CreateApplicationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const job = await this.repo.findJob(companyId, input.jobOpeningId);
    if (!job) throw new NotFoundError('Job opening not found');
    if (job.status !== 'OPEN') {
      throw new ValidationError('Candidates can only apply to open job openings');
    }
    const candidate = await this.repo.findCandidate(companyId, input.candidateId);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const duplicate = await this.repo.findApplicationByJobCandidate(
      companyId,
      input.jobOpeningId,
      input.candidateId,
    );
    if (duplicate) {
      throw new ConflictError('This candidate has already applied to this job');
    }

    try {
      const application = await this.repo.createApplication(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.application.create',
        entityType: 'JobApplication',
        entityId: application.id,
      });
      return application;
    } catch (error) {
      this.rethrowUnique(error, 'This candidate has already applied to this job');
    }
  }

  async updateApplicationStatus(
    actor: AuthActor,
    id: string,
    input: UpdateApplicationStatusInput,
  ) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findApplication(companyId, id);
    if (!existing) throw new NotFoundError('Application not found');

    if (input.status === 'HIRED' && !this.canApprove(actor)) {
      throw new ForbiddenError('Approving hire requires recruitment:approve');
    }

    if (input.status === 'REJECTED' && existing.status === 'REJECTED') {
      throw new ValidationError('Application is already rejected');
    }

    const application = await this.repo.updateApplicationStatus(
      id,
      input.status,
      input.status === 'REJECTED' ? (input.rejectionReason ?? null) : undefined,
    );
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.application.status',
      entityType: 'JobApplication',
      entityId: id,
      metadata: { status: input.status },
    });
    return application;
  }

  async rejectApplication(
    actor: AuthActor,
    id: string,
    input: { rejectionReason?: string | null },
  ) {
    return this.updateApplicationStatus(actor, id, {
      status: 'REJECTED',
      rejectionReason: input.rejectionReason,
    });
  }

  // —— Interviews ——
  async listInterviews(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listInterviews(companyId, {
      page,
      pageSize,
      status: params.status as never,
      applicationId: params.applicationId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getInterview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const interview = await this.repo.findInterview(companyId, id);
    if (!interview) throw new NotFoundError('Interview not found');
    return interview;
  }

  async createInterview(actor: AuthActor, input: CreateInterviewInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const application = await this.repo.findApplication(companyId, input.applicationId);
    if (!application) throw new NotFoundError('Application not found');
    if (['HIRED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
      throw new ValidationError('Cannot schedule interview for this application status');
    }
    if (input.interviewerId) {
      const interviewer = await this.repo.findEmployeeBasic(companyId, input.interviewerId);
      if (!interviewer) throw new ValidationError('Invalid interviewer');
    }

    const interview = await this.repo.createInterview(companyId, input);

    if (application.status !== 'INTERVIEW' && application.status !== 'OFFER') {
      await this.repo.updateApplicationStatus(application.id, 'INTERVIEW' as ApplicationStatus);
    }

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.interview.create',
      entityType: 'Interview',
      entityId: interview.id,
    });
    return interview;
  }

  async updateInterview(actor: AuthActor, id: string, input: UpdateInterviewInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findInterview(companyId, id);
    if (!existing) throw new NotFoundError('Interview not found');
    if (input.interviewerId) {
      const interviewer = await this.repo.findEmployeeBasic(companyId, input.interviewerId);
      if (!interviewer) throw new ValidationError('Invalid interviewer');
    }
    const interview = await this.repo.updateInterview(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.interview.update',
      entityType: 'Interview',
      entityId: id,
    });
    return interview;
  }

  async deleteInterview(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findInterview(companyId, id);
    if (!existing) throw new NotFoundError('Interview not found');
    await this.repo.softDeleteInterview(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.interview.delete',
      entityType: 'Interview',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async completeInterview(actor: AuthActor, id: string, input: CompleteInterviewInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findInterview(companyId, id);
    if (!existing) throw new NotFoundError('Interview not found');
    if (existing.status !== 'SCHEDULED') {
      throw new ValidationError('Only scheduled interviews can be completed');
    }
    const interview = await this.repo.completeInterview(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.interview.complete',
      entityType: 'Interview',
      entityId: id,
      metadata: { status: interview.status },
    });
    return interview;
  }

  // —— Offers ——
  async listOffers(actor: AuthActor, params: Record<string, string | undefined>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePage(params);
    const { items, total } = await this.repo.listOffers(companyId, {
      page,
      pageSize,
      status: params.status as never,
      applicationId: params.applicationId,
    });
    return { items, pagination: paginationMeta(page, pageSize, total) };
  }

  async getOffer(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const offer = await this.repo.findOffer(companyId, id);
    if (!offer) throw new NotFoundError('Offer not found');
    return offer;
  }

  async createOffer(actor: AuthActor, input: CreateOfferInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const application = await this.repo.findApplication(companyId, input.applicationId);
    if (!application) throw new NotFoundError('Application not found');
    if (['REJECTED', 'WITHDRAWN', 'HIRED'].includes(application.status)) {
      throw new ValidationError('Cannot create an offer for this application status');
    }

    const existingOffer = await this.repo.findOfferByApplication(companyId, input.applicationId);
    if (existingOffer) {
      throw new ConflictError('An offer already exists for this application');
    }

    try {
      const offer = await this.repo.createOffer(companyId, input);
      if (application.status !== 'OFFER' && application.status !== 'HIRED') {
        await this.repo.updateApplicationStatus(application.id, 'OFFER');
      }
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'recruitment.offer.create',
        entityType: 'JobOffer',
        entityId: offer.id,
      });
      return offer;
    } catch (error) {
      this.rethrowUnique(error, 'An offer already exists for this application');
    }
  }

  async updateOffer(actor: AuthActor, id: string, input: UpdateOfferInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findOffer(companyId, id);
    if (!existing) throw new NotFoundError('Offer not found');
    if (existing.status !== 'DRAFT' && input.status === undefined) {
      // Allow limited updates on non-draft only via explicit status or notes already handled
    }
    if (['ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'].includes(existing.status)) {
      throw new ValidationError('Cannot update a finalized offer');
    }
    const offer = await this.repo.updateOffer(id, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.offer.update',
      entityType: 'JobOffer',
      entityId: id,
    });
    return offer;
  }

  async sendOffer(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findOffer(companyId, id);
    if (!existing) throw new NotFoundError('Offer not found');
    if (existing.status !== 'DRAFT') {
      throw new ValidationError('Only draft offers can be sent');
    }
    const offer = await this.repo.sendOffer(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.offer.send',
      entityType: 'JobOffer',
      entityId: id,
    });
    return offer;
  }

  async respondOffer(actor: AuthActor, id: string, input: RespondOfferInput) {
    if (!this.canApprove(actor)) {
      throw new ForbiddenError('Responding to offers requires recruitment:approve');
    }
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findOffer(companyId, id);
    if (!existing) throw new NotFoundError('Offer not found');
    if (existing.status !== 'SENT') {
      throw new ValidationError('Only sent offers can be accepted or declined');
    }

    const status = input.accept ? 'ACCEPTED' : 'DECLINED';
    const offer = await this.repo.respondOffer(id, status, input.notes);

    if (input.accept) {
      await this.repo.updateApplicationStatus(existing.applicationId, 'HIRED');
    }

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'recruitment.offer.respond',
      entityType: 'JobOffer',
      entityId: id,
      metadata: { status },
    });
    return offer;
  }
}
