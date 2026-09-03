import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const requiredDate = z.coerce.date();
const leaveDayType = z.enum(['FULL_DAY', 'HALF_DAY_AM', 'HALF_DAY_PM']);
const leaveRequestStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  description: optionalString(1000),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Color must be a hex value like #3b82f6')
    .optional(),
  isPaid: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  allowHalfDay: z.boolean().optional(),
  maxDaysPerYear: z.number().int().min(0).max(365).optional(),
  carryForwardDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const updateLeavePolicySchema = z.object({
  allowNegativeBalance: z.boolean().optional(),
  countWeekends: z.boolean().optional(),
  countHolidays: z.boolean().optional(),
  minNoticeDays: z.number().int().min(0).max(90).optional(),
});

export const upsertLeaveBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  entitled: z.number().min(0).max(365).optional(),
  carriedForward: z.number().min(0).max(365).optional(),
});

export const createLeaveRequestSchema = z.object({
  employeeId: optionalString(50),
  leaveTypeId: z.string().min(1),
  startDate: requiredDate,
  endDate: requiredDate,
  dayType: leaveDayType.optional(),
  reason: optionalString(2000),
});

export const updateLeaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1).optional(),
  startDate: requiredDate.optional(),
  endDate: requiredDate.optional(),
  dayType: leaveDayType.optional(),
  reason: optionalString(2000),
});

export const reviewLeaveRequestSchema = z.object({
  reviewNotes: optionalString(2000),
});

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type UpdateLeavePolicyInput = z.infer<typeof updateLeavePolicySchema>;
export type UpsertLeaveBalanceInput = z.infer<typeof upsertLeaveBalanceSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveRequestInput = z.infer<typeof updateLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;
export type LeaveRequestStatusInput = z.infer<typeof leaveRequestStatus>;
