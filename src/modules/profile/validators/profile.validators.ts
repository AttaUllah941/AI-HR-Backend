import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalAvatarUrl = z.preprocess(
  emptyToUndefined,
  z
    .union([
      z.string().url().max(500),
      z.string().regex(/^\/[\w\-./?=&%]+$/, 'Relative avatar path must start with /').max(500),
      z.null(),
    ])
    .optional(),
);

export const updateProfileSchema = z
  .object({
    firstName: z.string().min(1).max(80).optional(),
    lastName: z.string().min(1).max(80).optional(),
    phone: z.string().max(40).optional().nullable(),
    avatarUrl: optionalAvatarUrl,
  })
  .refine(
    (value) =>
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.phone !== undefined ||
      value.avatarUrl !== undefined,
    { message: 'At least one profile field is required' },
  );

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  // Strength rules come from the shared company password policy (validatePasswordAgainstPolicy).
  newPassword: z.string().min(1).max(128),
});

export const updatePreferencesSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
    locale: z.string().min(2).max(20).optional(),
    timezone: z.string().min(1).max(80).optional(),
    dateFormat: z.string().min(2).max(40).optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    weekStartsOn: z.coerce.number().int().min(0).max(6).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one preference field is required',
  });

export const activityQuerySchema = z.object({
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;
