import type {
  ApplicationStatus,
  InterviewStatus,
  JobOpeningStatus,
  OfferStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type {
  AttachResumeInput,
  CompleteInterviewInput,
  CreateApplicationInput,
  CreateCandidateInput,
  CreateInterviewInput,
  CreateJobOpeningInput,
  CreateOfferInput,
  UpdateCandidateInput,
  UpdateInterviewInput,
  UpdateJobOpeningInput,
  UpdateOfferInput,
} from '../validators/recruitment.validators.js';

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

const orgUnitSelect = { id: true, name: true, code: true } as const;

const jobInclude = {
  department: { select: orgUnitSelect },
  designation: { select: orgUnitSelect },
  branch: { select: orgUnitSelect },
  hiringManager: { select: employeeSelect },
  _count: { select: { applications: true } },
} satisfies Prisma.JobOpeningInclude;

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  source: true,
  currentTitle: true,
  currentCompany: true,
  yearsExperience: true,
  linkedinUrl: true,
  portfolioUrl: true,
  resumeUrl: true,
  resumeFileName: true,
  resumeMimeType: true,
  screeningScore: true,
  screeningNotes: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateSelect;

const applicationInclude = {
  jobOpening: {
    select: {
      id: true,
      title: true,
      code: true,
      status: true,
      employmentType: true,
      location: true,
      department: { select: orgUnitSelect },
      designation: { select: orgUnitSelect },
    },
  },
  candidate: { select: candidateSelect },
  offer: true,
  _count: { select: { interviews: true } },
} satisfies Prisma.JobApplicationInclude;

const interviewInclude = {
  application: {
    include: {
      jobOpening: { select: { id: true, title: true, code: true, status: true } },
      candidate: { select: candidateSelect },
    },
  },
  interviewer: { select: employeeSelect },
} satisfies Prisma.InterviewInclude;

const offerInclude = {
  application: {
    include: {
      jobOpening: { select: { id: true, title: true, code: true, status: true } },
      candidate: { select: candidateSelect },
    },
  },
} satisfies Prisma.JobOfferInclude;

export type ListQuery = {
  page: number;
  pageSize: number;
};

export type JobListQuery = ListQuery & {
  status?: JobOpeningStatus;
  departmentId?: string;
  search?: string;
};

export type CandidateListQuery = ListQuery & {
  search?: string;
};

export type ApplicationListQuery = ListQuery & {
  status?: ApplicationStatus;
  jobOpeningId?: string;
  candidateId?: string;
};

export type InterviewListQuery = ListQuery & {
  status?: InterviewStatus;
  applicationId?: string;
};

export type OfferListQuery = ListQuery & {
  status?: OfferStatus;
  applicationId?: string;
};

export class RecruitmentRepository {
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }

  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findEmployeeBasic(companyId: string, employeeId: string) {
    return prisma.employee.findFirst({
      where: { id: employeeId, companyId, ...notDeleted },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });
  }

  findDepartment(companyId: string, id: string) {
    return prisma.department.findFirst({ where: { id, companyId, ...notDeleted }, select: { id: true } });
  }

  findDesignation(companyId: string, id: string) {
    return prisma.designation.findFirst({ where: { id, companyId, ...notDeleted }, select: { id: true } });
  }

  findBranch(companyId: string, id: string) {
    return prisma.branch.findFirst({ where: { id, companyId, ...notDeleted }, select: { id: true } });
  }

  // —— Jobs ——
  async listJobs(companyId: string, query: JobListQuery) {
    const where: Prisma.JobOpeningWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.jobOpening.findMany({
        where,
        include: jobInclude,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.jobOpening.count({ where }),
    ]);
    return { items, total };
  }

  findJob(companyId: string, id: string) {
    return prisma.jobOpening.findFirst({
      where: { id, companyId, ...notDeleted },
      include: jobInclude,
    });
  }

  createJob(companyId: string, data: CreateJobOpeningInput) {
    return prisma.jobOpening.create({
      data: {
        companyId,
        title: data.title.trim(),
        code: data.code.trim().toUpperCase(),
        description: data.description ?? null,
        requirements: data.requirements ?? null,
        employmentType: data.employmentType ?? 'FULL_TIME',
        location: data.location ?? null,
        openings: data.openings ?? 1,
        status: data.status ?? 'DRAFT',
        departmentId: data.departmentId ?? null,
        designationId: data.designationId ?? null,
        branchId: data.branchId ?? null,
        hiringManagerId: data.hiringManagerId ?? null,
        salaryMin: data.salaryMin ?? null,
        salaryMax: data.salaryMax ?? null,
        currency: data.currency ?? 'USD',
        ...(data.status === 'OPEN' ? { publishedAt: new Date() } : {}),
      },
      include: jobInclude,
    });
  }

  updateJob(id: string, data: UpdateJobOpeningInput) {
    return prisma.jobOpening.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.requirements !== undefined ? { requirements: data.requirements } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.openings !== undefined ? { openings: data.openings } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
        ...(data.designationId !== undefined ? { designationId: data.designationId } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
        ...(data.hiringManagerId !== undefined ? { hiringManagerId: data.hiringManagerId } : {}),
        ...(data.salaryMin !== undefined ? { salaryMin: data.salaryMin } : {}),
        ...(data.salaryMax !== undefined ? { salaryMax: data.salaryMax } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
      },
      include: jobInclude,
    });
  }

  updateJobStatus(
    id: string,
    status: JobOpeningStatus,
    timestamps?: { publishedAt?: Date | null; closedAt?: Date | null },
  ) {
    return prisma.jobOpening.update({
      where: { id },
      data: {
        status,
        ...(timestamps?.publishedAt !== undefined ? { publishedAt: timestamps.publishedAt } : {}),
        ...(timestamps?.closedAt !== undefined ? { closedAt: timestamps.closedAt } : {}),
      },
      include: jobInclude,
    });
  }

  softDeleteJob(id: string) {
    return prisma.jobOpening.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
  }

  // —— Candidates ——
  async listCandidates(companyId: string, query: CandidateListQuery) {
    const where: Prisma.CandidateWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { applications: true } } },
      }),
      prisma.candidate.count({ where }),
    ]);
    return { items, total };
  }

  findCandidate(companyId: string, id: string) {
    return prisma.candidate.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        applications: {
          where: notDeleted,
          include: {
            jobOpening: { select: { id: true, title: true, code: true, status: true } },
          },
          orderBy: { appliedAt: 'desc' },
        },
      },
    });
  }

  createCandidate(companyId: string, data: CreateCandidateInput) {
    return prisma.candidate.create({
      data: {
        companyId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone ?? null,
        source: data.source ?? null,
        currentTitle: data.currentTitle ?? null,
        currentCompany: data.currentCompany ?? null,
        yearsExperience: data.yearsExperience ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        portfolioUrl: data.portfolioUrl ?? null,
        resumeUrl: data.resumeUrl ?? null,
        resumeFileName: data.resumeFileName ?? null,
        resumeMimeType: data.resumeMimeType ?? null,
        screeningScore: data.screeningScore ?? null,
        screeningNotes: data.screeningNotes ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  updateCandidate(id: string, data: UpdateCandidateInput) {
    return prisma.candidate.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.currentTitle !== undefined ? { currentTitle: data.currentTitle } : {}),
        ...(data.currentCompany !== undefined ? { currentCompany: data.currentCompany } : {}),
        ...(data.yearsExperience !== undefined ? { yearsExperience: data.yearsExperience } : {}),
        ...(data.linkedinUrl !== undefined ? { linkedinUrl: data.linkedinUrl } : {}),
        ...(data.portfolioUrl !== undefined ? { portfolioUrl: data.portfolioUrl } : {}),
        ...(data.resumeUrl !== undefined ? { resumeUrl: data.resumeUrl } : {}),
        ...(data.resumeFileName !== undefined ? { resumeFileName: data.resumeFileName } : {}),
        ...(data.resumeMimeType !== undefined ? { resumeMimeType: data.resumeMimeType } : {}),
        ...(data.screeningScore !== undefined ? { screeningScore: data.screeningScore } : {}),
        ...(data.screeningNotes !== undefined ? { screeningNotes: data.screeningNotes } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  attachResume(id: string, data: AttachResumeInput) {
    return prisma.candidate.update({
      where: { id },
      data: {
        resumeUrl: data.resumeUrl,
        resumeFileName: data.resumeFileName ?? null,
        resumeMimeType: data.resumeMimeType ?? null,
      },
    });
  }

  softDeleteCandidate(id: string) {
    return prisma.candidate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // —— Applications ——
  async listApplications(companyId: string, query: ApplicationListQuery) {
    const where: Prisma.JobApplicationWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.jobOpeningId ? { jobOpeningId: query.jobOpeningId } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: [{ stageChangedAt: 'desc' }, { appliedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.jobApplication.count({ where }),
    ]);
    return { items, total };
  }

  findApplication(companyId: string, id: string) {
    return prisma.jobApplication.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        ...applicationInclude,
        interviews: {
          where: notDeleted,
          include: { interviewer: { select: employeeSelect } },
          orderBy: { scheduledAt: 'asc' },
        },
      },
    });
  }

  findApplicationByJobCandidate(companyId: string, jobOpeningId: string, candidateId: string) {
    return prisma.jobApplication.findFirst({
      where: { companyId, jobOpeningId, candidateId, ...notDeleted },
      select: { id: true },
    });
  }

  createApplication(companyId: string, data: CreateApplicationInput) {
    return prisma.jobApplication.create({
      data: {
        companyId,
        jobOpeningId: data.jobOpeningId,
        candidateId: data.candidateId,
        coverLetter: data.coverLetter ?? null,
        status: data.status ?? 'APPLIED',
      },
      include: applicationInclude,
    });
  }

  updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    rejectionReason?: string | null,
    db: DbClient = prisma,
  ) {
    return db.jobApplication.update({
      where: { id },
      data: {
        status,
        stageChangedAt: new Date(),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
      },
      include: applicationInclude,
    });
  }

  softDeleteApplication(id: string) {
    return prisma.jobApplication.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  listPipelineApplications(companyId: string, jobOpeningId?: string) {
    return prisma.jobApplication.findMany({
      where: {
        companyId,
        ...notDeleted,
        status: { notIn: ['WITHDRAWN'] },
        ...(jobOpeningId ? { jobOpeningId } : {}),
      },
      include: applicationInclude,
      orderBy: [{ status: 'asc' }, { stageChangedAt: 'desc' }],
    });
  }

  // —— Interviews ——
  async listInterviews(companyId: string, query: InterviewListQuery) {
    const where: Prisma.InterviewWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        include: interviewInclude,
        orderBy: { scheduledAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.interview.count({ where }),
    ]);
    return { items, total };
  }

  findInterview(companyId: string, id: string) {
    return prisma.interview.findFirst({
      where: { id, companyId, ...notDeleted },
      include: interviewInclude,
    });
  }

  createInterview(companyId: string, data: CreateInterviewInput) {
    return prisma.interview.create({
      data: {
        companyId,
        applicationId: data.applicationId,
        type: data.type ?? 'VIDEO',
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes ?? 60,
        locationOrLink: data.locationOrLink ?? null,
        interviewerId: data.interviewerId ?? null,
      },
      include: interviewInclude,
    });
  }

  updateInterview(id: string, data: UpdateInterviewInput) {
    return prisma.interview.update({
      where: { id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.scheduledAt !== undefined ? { scheduledAt: data.scheduledAt } : {}),
        ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
        ...(data.locationOrLink !== undefined ? { locationOrLink: data.locationOrLink } : {}),
        ...(data.interviewerId !== undefined ? { interviewerId: data.interviewerId } : {}),
        ...(data.feedback !== undefined ? { feedback: data.feedback } : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
      },
      include: interviewInclude,
    });
  }

  completeInterview(id: string, data: CompleteInterviewInput) {
    return prisma.interview.update({
      where: { id },
      data: {
        status: data.status ?? 'COMPLETED',
        feedback: data.feedback ?? null,
        rating: data.rating ?? null,
      },
      include: interviewInclude,
    });
  }

  softDeleteInterview(id: string) {
    return prisma.interview.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
  }

  // —— Offers ——
  async listOffers(companyId: string, query: OfferListQuery) {
    const where: Prisma.JobOfferWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.jobOffer.findMany({
        where,
        include: offerInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.jobOffer.count({ where }),
    ]);
    return { items, total };
  }

  findOffer(companyId: string, id: string) {
    return prisma.jobOffer.findFirst({
      where: { id, companyId, ...notDeleted },
      include: offerInclude,
    });
  }

  findOfferByApplication(companyId: string, applicationId: string) {
    return prisma.jobOffer.findFirst({
      where: { companyId, applicationId, ...notDeleted },
      select: { id: true },
    });
  }

  createOffer(companyId: string, data: CreateOfferInput) {
    return prisma.jobOffer.create({
      data: {
        companyId,
        applicationId: data.applicationId,
        title: data.title.trim(),
        salary: data.salary,
        currency: data.currency ?? 'USD',
        startDate: data.startDate ?? null,
        expiresAt: data.expiresAt ?? null,
        notes: data.notes ?? null,
      },
      include: offerInclude,
    });
  }

  updateOffer(id: string, data: UpdateOfferInput) {
    return prisma.jobOffer.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.salary !== undefined ? { salary: data.salary } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: offerInclude,
    });
  }

  sendOffer(id: string) {
    return prisma.jobOffer.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
      include: offerInclude,
    });
  }

  respondOffer(id: string, status: 'ACCEPTED' | 'DECLINED', notes?: string | null) {
    return prisma.jobOffer.update({
      where: { id },
      data: {
        status,
        respondedAt: new Date(),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: offerInclude,
    });
  }

  // —— Summary / Report ——
  jobStatusCounts(companyId: string) {
    return prisma.jobOpening.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { _all: true },
    });
  }

  applicationStatusCounts(companyId: string, jobOpeningId?: string) {
    return prisma.jobApplication.groupBy({
      by: ['status'],
      where: {
        companyId,
        deletedAt: null,
        ...(jobOpeningId ? { jobOpeningId } : {}),
      },
      _count: { _all: true },
    });
  }

  interviewStatusCounts(companyId: string) {
    return prisma.interview.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { _all: true },
    });
  }

  offerStatusCounts(companyId: string) {
    return prisma.jobOffer.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { _all: true },
    });
  }

  countCandidates(companyId: string) {
    return prisma.candidate.count({ where: { companyId, deletedAt: null } });
  }

  countOpenJobs(companyId: string) {
    return prisma.jobOpening.count({
      where: { companyId, deletedAt: null, status: 'OPEN' },
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
