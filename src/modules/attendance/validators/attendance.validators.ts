import { z } from 'zod';

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().max(max).optional().nullable(),
  );

const optionalDate = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.date().optional().nullable(),
);

const requiredDate = z.coerce.date();

const attendanceStatus = z.enum([
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEKEND',
  'REMOTE',
  'EARLY_LEAVE',
]);

const attendanceSource = z.enum(['CLOCK', 'MANUAL', 'SYSTEM']);

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

export const createShiftSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().min(1).max(50),
  startTime: timeOfDay,
  endTime: timeOfDay,
  breakMinutes: z.number().int().min(0).max(480).optional(),
  graceMinutes: z.number().int().min(0).max(180).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateShiftSchema = createShiftSchema.partial();

export const createHolidaySchema = z.object({
  name: z.string().min(1).max(200),
  date: requiredDate,
  isOptional: z.boolean().optional(),
  description: optionalString(1000),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export const createAttendanceSchema = z.object({
  employeeId: z.string().min(1),
  date: requiredDate,
  shiftId: optionalString(50),
  checkInAt: optionalDate,
  checkOutAt: optionalDate,
  status: attendanceStatus.optional(),
  workMinutes: z.number().int().min(0).max(24 * 60).optional(),
  overtimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  lateMinutes: z.number().int().min(0).max(24 * 60).optional(),
  notes: optionalString(2000),
  source: attendanceSource.optional(),
});

export const updateAttendanceSchema = createAttendanceSchema
  .omit({ employeeId: true })
  .partial()
  .extend({
    employeeId: z.string().min(1).optional(),
  });

export const clockActionSchema = z.object({
  notes: optionalString(2000),
});

export const createOvertimeSchema = z.object({
  employeeId: z.string().min(1),
  attendanceId: optionalString(50),
  date: requiredDate,
  minutes: z.number().int().min(1).max(24 * 60),
  reason: optionalString(2000),
});

export const reviewOvertimeSchema = z.object({
  reviewNotes: optionalString(2000),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type ClockActionInput = z.infer<typeof clockActionSchema>;
export type CreateOvertimeInput = z.infer<typeof createOvertimeSchema>;
export type ReviewOvertimeInput = z.infer<typeof reviewOvertimeSchema>;
