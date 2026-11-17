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

export const reportExportFormatSchema = z.enum(['CSV', 'PDF', 'JSON', 'XLSX']);

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalIsoDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
);

const optionalCuid = z.preprocess(emptyToUndefined, z.string().cuid().optional());

const optionalYear = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(2000).max(2100).optional(),
);

const optionalMonth = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(12).optional(),
);

const MAX_RANGE_DAYS = 366;

function validateDateRange(
  value: { dateFrom?: string; dateTo?: string },
  ctx: z.RefinementCtx,
) {
  const parse = (raw: string | undefined, path: 'dateFrom' | 'dateTo') => {
    if (!raw) return undefined;
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
      ctx.addIssue({ code: 'custom', path: [path], message: 'Not a valid calendar date' });
      return undefined;
    }
    return parsed;
  };
  const from = parse(value.dateFrom, 'dateFrom');
  const to = parse(value.dateTo, 'dateTo');
  if (from && to) {
    if (from > to) {
      ctx.addIssue({ code: 'custom', path: ['dateFrom'], message: 'dateFrom must be on or before dateTo' });
    } else if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateTo'],
        message: `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
      });
    }
  }
}

export const reportQuerySchema = z
  .object({
    dateFrom: optionalIsoDate,
    dateTo: optionalIsoDate,
    year: optionalYear,
    month: optionalMonth,
    departmentId: optionalCuid,
    employeeId: optionalCuid,
    jobOpeningId: optionalCuid,
  })
  .superRefine(validateDateRange);

export const exportReportSchema = z
  .object({
  reportType: reportTypeSchema,
  format: reportExportFormatSchema.default('CSV'),
  dateFrom: optionalIsoDate,
  dateTo: optionalIsoDate,
  year: optionalYear,
  month: optionalMonth,
  departmentId: optionalCuid,
  employeeId: optionalCuid,
  jobOpeningId: optionalCuid,
  })
  .superRefine(validateDateRange);

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
export type ReportTypeValue = z.infer<typeof reportTypeSchema>;
export type ReportExportFormatValue = z.infer<typeof reportExportFormatSchema>;
