import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

export const leaveTypeSchema = z.enum(['ANNUAL', 'SICK', 'PERSONAL']);
export const leaveStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

export const leaveListQuerySchema = z.object({
  status: leaveStatusSchema.optional(),
  leaveType: leaveTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const leavePendingQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const leaveHolidaysQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(8),
  from: z.preprocess(blankToUndefined, z.coerce.date().optional()),
});

export const createLeaveRequestSchema = z
  .object({
    employeeId: z.string().min(1),
    leaveType: leaveTypeSchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be on or after startDate',
        path: ['endDate'],
      });
    }
  });

export const updateLeaveRequestSchema = z
  .object({
    leaveType: leaveTypeSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    reason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional().nullable()),
    status: leaveStatusSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be on or after startDate',
        path: ['endDate'],
      });
    }
  });

export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
export type LeavePendingQuery = z.infer<typeof leavePendingQuerySchema>;
export type LeaveHolidaysQuery = z.infer<typeof leaveHolidaysQuerySchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveRequestInput = z.infer<typeof updateLeaveRequestSchema>;
