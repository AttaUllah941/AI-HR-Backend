import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const requiredDate = z.coerce.date();
const goalStatus = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']);
const goalPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const reviewCycleStatus = z.enum(['DRAFT', 'ACTIVE', 'CLOSED']);
const reviewStatus = z.enum([
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'ACKNOWLEDGED',
  'COMPLETED',
  'CANCELLED',
]);
const feedbackType = z.enum(['PEER', 'MANAGER', 'SELF', 'UPWARD', 'GENERAL']);
const promotionStatus = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']);
const rating = z.number().min(0).max(5);

export const createGoalSchema = z.object({
  employeeId: optionalString(50),
  title: z.string().min(1).max(200),
  description: optionalString(5000),
  targetValue: z.number().min(0).max(1_000_000).optional().nullable(),
  currentValue: z.number().min(0).max(1_000_000).optional(),
  unit: optionalString(50),
  progress: z.number().min(0).max(100).optional(),
  priority: goalPriority.optional(),
  status: goalStatus.optional(),
  startDate: requiredDate.optional().nullable(),
  dueDate: requiredDate.optional().nullable(),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ employeeId: true });

export const createKpiSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  description: optionalString(1000),
  unit: optionalString(50),
  targetDefault: z.number().min(0).max(1_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateKpiSchema = createKpiSchema.partial();

export const upsertEmployeeKpiSchema = z.object({
  employeeId: z.string().min(1),
  kpiId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4).optional().nullable(),
  targetValue: z.number().min(0).max(1_000_000).optional(),
  actualValue: z.number().min(0).max(1_000_000).optional(),
  score: z.number().min(0).max(100).optional().nullable(),
  notes: optionalString(2000),
});

export const createReviewCycleSchema = z.object({
  name: z.string().min(1).max(200),
  year: z.number().int().min(2000).max(2100),
  startDate: requiredDate,
  endDate: requiredDate,
  status: reviewCycleStatus.optional(),
});

export const updateReviewCycleSchema = createReviewCycleSchema.partial();

export const createReviewSchema = z.object({
  employeeId: z.string().min(1),
  reviewerId: optionalString(50),
  cycleId: optionalString(50),
  selfRating: rating.optional().nullable(),
  managerRating: rating.optional().nullable(),
  overallRating: rating.optional().nullable(),
  selfComments: optionalString(5000),
  managerComments: optionalString(5000),
  status: reviewStatus.optional(),
});

export const updateReviewSchema = z.object({
  reviewerId: optionalString(50),
  cycleId: optionalString(50),
  selfRating: rating.optional().nullable(),
  managerRating: rating.optional().nullable(),
  overallRating: rating.optional().nullable(),
  selfComments: optionalString(5000),
  managerComments: optionalString(5000),
  status: reviewStatus.optional(),
});

export const createFeedbackSchema = z.object({
  toEmployeeId: z.string().min(1),
  fromEmployeeId: optionalString(50),
  type: feedbackType.optional(),
  rating: rating.optional().nullable(),
  content: z.string().min(1).max(5000),
  isAnonymous: z.boolean().optional(),
  reviewId: optionalString(50),
});

export const createPromotionSchema = z.object({
  employeeId: optionalString(50),
  proposedDesignationId: optionalString(50),
  proposedTitle: optionalString(200),
  reason: z.string().min(1).max(5000),
  effectiveDate: requiredDate.optional().nullable(),
  status: promotionStatus.optional(),
});

export const updatePromotionSchema = createPromotionSchema.partial();

export const reviewPromotionSchema = z.object({
  approve: z.boolean(),
  reviewNotes: optionalString(2000),
  effectiveDate: requiredDate.optional().nullable(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateKpiInput = z.infer<typeof createKpiSchema>;
export type UpdateKpiInput = z.infer<typeof updateKpiSchema>;
export type UpsertEmployeeKpiInput = z.infer<typeof upsertEmployeeKpiSchema>;
export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;
export type UpdateReviewCycleInput = z.infer<typeof updateReviewCycleSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
export type ReviewPromotionInput = z.infer<typeof reviewPromotionSchema>;
