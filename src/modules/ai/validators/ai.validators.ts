import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

export const assistantChatSchema = z.object({
  conversationId: optionalString(50),
  message: z.string().min(1).max(4000),
  title: optionalString(200),
});

export const resumeScreeningSchema = z.object({
  candidateId: z.string().min(1),
  jobOpeningId: optionalString(50),
  notes: optionalString(2000),
});

export const appraisalSchema = z.object({
  employeeId: z.string().min(1),
  reviewId: optionalString(50),
  periodLabel: optionalString(100),
});

export const policyGenerateSchema = z.object({
  topic: z.string().min(3).max(200),
  audience: optionalString(100),
  tone: z.enum(['formal', 'friendly', 'strict']).optional(),
  additionalContext: optionalString(3000),
});

export const insightsSchema = z.object({
  focus: z
    .enum(['workforce', 'attendance', 'leave', 'recruitment', 'performance', 'payroll'])
    .optional(),
});

export const recommendationsSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
});

export type AssistantChatInput = z.infer<typeof assistantChatSchema>;
export type ResumeScreeningInput = z.infer<typeof resumeScreeningSchema>;
export type AppraisalInput = z.infer<typeof appraisalSchema>;
export type PolicyGenerateInput = z.infer<typeof policyGenerateSchema>;
export type InsightsInput = z.infer<typeof insightsSchema>;
export type RecommendationsInput = z.infer<typeof recommendationsSchema>;
