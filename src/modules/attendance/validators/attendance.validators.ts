import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const attendanceStatusSchema = z.enum(['PRESENT', 'LATE', 'ABSENT', 'REMOTE', 'ON_LEAVE']);

export const attendanceDateQuerySchema = z.object({
  date: z.preprocess(blankToUndefined, z.coerce.date().optional()),
});

export const attendanceListQuerySchema = z.object({
  date: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  status: attendanceStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const attendanceCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const attendanceCheckInsQuerySchema = z.object({
  date: z.preprocess(blankToUndefined, z.coerce.date().optional()),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const createAttendanceSchema = z.object({
  employeeId: z.string().min(1),
  workDate: z.coerce.date(),
  status: attendanceStatusSchema.default('PRESENT'),
  checkInAt: z.preprocess(blankToUndefined, z.coerce.date().optional().nullable()),
  checkOutAt: z.preprocess(blankToUndefined, z.coerce.date().optional().nullable()),
  locationLabel: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
});

export const updateAttendanceSchema = createAttendanceSchema
  .omit({ employeeId: true, workDate: true })
  .partial()
  .extend({
    status: attendanceStatusSchema.optional(),
  });

export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
export type AttendanceCalendarQuery = z.infer<typeof attendanceCalendarQuerySchema>;
export type AttendanceCheckInsQuery = z.infer<typeof attendanceCheckInsQuerySchema>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
