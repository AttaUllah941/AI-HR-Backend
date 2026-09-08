import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

export const goalStatusSchema = z.enum([
  'ON_TRACK',
  'AT_RISK',
  'BEHIND',
  'COMPLETED',
  'CANCELLED',
]);

export const performancePeriodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

export const topPerformersQuerySchema = performancePeriodQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(5),
});

export const reviewListQuerySchema = performancePeriodQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  promotionReady: z
    .preprocess(blankToUndefined, z.enum(['true', 'false']).optional())
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createReviewSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
  score: z.coerce.number().min(0).max(5),
  goalCount: z.coerce.number().int().nonnegative().default(0),
  goalsCompletePercent: z.coerce.number().int().min(0).max(100).default(0),
  promotionReady: z.boolean().default(false),
  summary: z.preprocess(blankToUndefined, z.string().trim().max(1000).optional()),
});

export const updateReviewSchema = createReviewSchema
  .omit({ employeeId: true, year: true, quarter: true })
  .partial();

export type PerformancePeriodQuery = z.infer<typeof performancePeriodQuerySchema>;
export type TopPerformersQuery = z.infer<typeof topPerformersQuerySchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
