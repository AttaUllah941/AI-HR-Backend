import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const requiredDate = z.coerce.date();
const employmentType = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'CONSULTANT']);
const jobStatus = z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED']);
const applicationStatus = z.enum([
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
]);
const interviewType = z.enum(['PHONE', 'VIDEO', 'ONSITE', 'TECHNICAL', 'HR', 'FINAL']);
const interviewStatus = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const offerStatus = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED']);

export const createJobOpeningSchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  description: optionalString(5000),
  requirements: optionalString(5000),
  employmentType: employmentType.optional(),
  location: optionalString(200),
  openings: z.number().int().min(1).max(100).optional(),
  status: jobStatus.optional(),
  departmentId: optionalString(50),
  designationId: optionalString(50),
  branchId: optionalString(50),
  hiringManagerId: optionalString(50),
  salaryMin: z.number().min(0).max(10_000_000).optional().nullable(),
  salaryMax: z.number().min(0).max(10_000_000).optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
});

export const updateJobOpeningSchema = createJobOpeningSchema.partial();

export const createCandidateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: optionalString(50),
  source: optionalString(100),
  currentTitle: optionalString(150),
  currentCompany: optionalString(150),
  yearsExperience: z.number().min(0).max(60).optional().nullable(),
  linkedinUrl: optionalString(500),
  portfolioUrl: optionalString(500),
  resumeUrl: optionalString(1000),
  resumeFileName: optionalString(255),
  resumeMimeType: optionalString(100),
  screeningScore: z.number().min(0).max(100).optional().nullable(),
  screeningNotes: optionalString(2000),
  notes: optionalString(5000),
});

export const updateCandidateSchema = createCandidateSchema.partial();

export const attachResumeSchema = z.object({
  resumeUrl: z.string().min(1).max(1000),
  resumeFileName: optionalString(255),
  resumeMimeType: optionalString(100),
});

export const createApplicationSchema = z.object({
  jobOpeningId: z.string().min(1),
  candidateId: z.string().min(1),
  coverLetter: optionalString(5000),
  status: applicationStatus.optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: applicationStatus,
  rejectionReason: optionalString(2000),
});

export const createInterviewSchema = z.object({
  applicationId: z.string().min(1),
  type: interviewType.optional(),
  scheduledAt: requiredDate,
  durationMinutes: z.number().int().min(15).max(480).optional(),
  locationOrLink: optionalString(500),
  interviewerId: optionalString(50),
});

export const updateInterviewSchema = z.object({
  type: interviewType.optional(),
  status: interviewStatus.optional(),
  scheduledAt: requiredDate.optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  locationOrLink: optionalString(500),
  interviewerId: optionalString(50),
  feedback: optionalString(5000),
  rating: z.number().min(0).max(5).optional().nullable(),
});

export const completeInterviewSchema = z.object({
  feedback: optionalString(5000),
  rating: z.number().min(0).max(5).optional().nullable(),
  status: z.enum(['COMPLETED', 'NO_SHOW', 'CANCELLED']).optional(),
});

export const createOfferSchema = z.object({
  applicationId: z.string().min(1),
  title: z.string().min(1).max(200),
  salary: z.number().min(0).max(10_000_000),
  currency: z.string().min(1).max(10).optional(),
  startDate: requiredDate.optional().nullable(),
  expiresAt: requiredDate.optional().nullable(),
  notes: optionalString(2000),
});

export const updateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  salary: z.number().min(0).max(10_000_000).optional(),
  currency: z.string().min(1).max(10).optional(),
  startDate: requiredDate.optional().nullable(),
  expiresAt: requiredDate.optional().nullable(),
  notes: optionalString(2000),
  status: offerStatus.optional(),
});

export const respondOfferSchema = z.object({
  accept: z.boolean(),
  notes: optionalString(2000),
});

export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>;
export type UpdateJobOpeningInput = z.infer<typeof updateJobOpeningSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type AttachResumeInput = z.infer<typeof attachResumeSchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;
export type CompleteInterviewInput = z.infer<typeof completeInterviewSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
export type RespondOfferInput = z.infer<typeof respondOfferSchema>;
