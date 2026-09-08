import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

export const jobStatusSchema = z.enum(['DRAFT', 'OPEN', 'CLOSED', 'FILLED']);
export const candidateStageSchema = z.enum([
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
]);

export const jobListQuerySchema = z.object({
  status: jobStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(160),
  departmentId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  locationLabel: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  description: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  status: jobStatusSchema.default('OPEN'),
  openingsCount: z.coerce.number().int().positive().max(100).default(1),
});

export const updateJobSchema = createJobSchema.partial();

export const candidateListQuerySchema = z.object({
  stage: candidateStageSchema.optional(),
  jobOpeningId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const createCandidateSchema = z.object({
  jobOpeningId: z.string().min(1),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  locationLabel: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
  stage: candidateStageSchema.default('APPLIED'),
  score: z.coerce.number().int().min(0).max(100).optional(),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});

export const updateCandidateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(200).optional(),
  locationLabel: z.preprocess(blankToUndefined, z.string().trim().max(120).optional().nullable()),
  stage: candidateStageSchema.optional(),
  score: z.coerce.number().int().min(0).max(100).optional().nullable(),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional().nullable()),
  jobOpeningId: z.string().min(1).optional(),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
