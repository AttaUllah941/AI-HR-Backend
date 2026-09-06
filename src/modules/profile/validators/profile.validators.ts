import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z.string().max(40).optional().nullable(),
  avatarUrl: z
    .union([z.string().url().max(500), z.literal(''), z.null()])
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/[0-9]/, 'Must include a number'),
});

export const updatePreferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  locale: z.string().min(2).max(20).optional(),
  timezone: z.string().min(1).max(80).optional(),
  dateFormat: z.string().min(2).max(40).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  weekStartsOn: z.coerce.number().int().min(0).max(6).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
