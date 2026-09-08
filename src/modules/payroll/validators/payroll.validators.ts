import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const now = new Date();

export const payrollPeriodQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(now.getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(now.getUTCMonth() + 1),
});

export const payrollListQuerySchema = payrollPeriodQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  departmentId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createPayrollEntrySchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  baseSalary: z.coerce.number().int().nonnegative(),
  bonus: z.coerce.number().int().nonnegative().default(0),
  deductions: z.coerce.number().int().nonnegative().default(0),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});

export const updatePayrollEntrySchema = z.object({
  baseSalary: z.coerce.number().int().nonnegative().optional(),
  bonus: z.coerce.number().int().nonnegative().optional(),
  deductions: z.coerce.number().int().nonnegative().optional(),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional().nullable()),
});

export const runPayrollSchema = payrollPeriodQuerySchema;

export type PayrollPeriodQuery = z.infer<typeof payrollPeriodQuerySchema>;
export type PayrollListQuery = z.infer<typeof payrollListQuerySchema>;
export type CreatePayrollEntryInput = z.infer<typeof createPayrollEntrySchema>;
export type UpdatePayrollEntryInput = z.infer<typeof updatePayrollEntrySchema>;
export type RunPayrollInput = z.infer<typeof runPayrollSchema>;
