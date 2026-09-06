import { z } from 'zod';

export const reportTypeSchema = z.enum([
  'OVERVIEW',
  'ATTENDANCE',
  'LEAVE',
  'PAYROLL',
  'RECRUITMENT',
  'PERFORMANCE',
  'EMPLOYEES',
]);

export const reportExportFormatSchema = z.enum(['CSV', 'PDF', 'JSON']);

export const reportQuerySchema = z.object({
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  departmentId: z.string().cuid().optional(),
  employeeId: z.string().cuid().optional(),
  jobOpeningId: z.string().cuid().optional(),
});

export const exportReportSchema = z.object({
  reportType: reportTypeSchema,
  format: reportExportFormatSchema.default('CSV'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  departmentId: z.string().cuid().optional(),
  employeeId: z.string().cuid().optional(),
  jobOpeningId: z.string().cuid().optional(),
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
export type ReportTypeValue = z.infer<typeof reportTypeSchema>;
export type ReportExportFormatValue = z.infer<typeof reportExportFormatSchema>;
