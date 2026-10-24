import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalUrlOrEmpty = z.preprocess(
  emptyToUndefined,
  z.union([z.string().url().max(500), z.null()]).optional(),
);

const optionalLogoUrl = z.preprocess(
  emptyToUndefined,
  z
    .union([
      z.string().url().max(500),
      z.string().regex(/^\/[\w\-./?=&%]+$/, 'Relative logo path must start with /').max(500),
      z.null(),
    ])
    .optional(),
);

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.union([z.string().email().max(255), z.null()]).optional(),
);

export const updateCompanySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    legalName: z.string().max(200).optional().nullable(),
    email: optionalEmail,
    phone: z.string().max(40).optional().nullable(),
    website: optionalUrlOrEmpty,
    logoUrl: optionalLogoUrl,
    timezone: z.string().min(1).max(80).optional(),
    locale: z.string().min(2).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one company field is required',
  });

export const updateEmailSettingsSchema = z
  .object({
    emailProvider: z.enum(['console', 'smtp']).optional(),
    emailFrom: z.string().max(255).optional().nullable(),
    emailSmtpUrl: optionalUrlOrEmpty,
    emailApiKey: z.string().max(500).optional().nullable(),
    clearApiKey: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one email setting is required',
  });

export const updateStorageSettingsSchema = z
  .object({
    storageProvider: z.enum(['local', 's3', 'azure', 'gcs']).optional(),
    storageBucket: z.string().max(200).optional().nullable(),
    storageRegion: z.string().max(80).optional().nullable(),
    storagePublicBaseUrl: optionalUrlOrEmpty,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one storage setting is required',
  });

const MAX_SETTINGS_JSON_BYTES = 20 * 1024;

const boundedJsonRecord = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= MAX_SETTINGS_JSON_BYTES, {
    message: `Value must be at most ${MAX_SETTINGS_JSON_BYTES / 1024}KB when serialized`,
  });

export const updateIntegrationsSchema = z.object({
  integrations: boundedJsonRecord,
});

export const updateSystemSettingsSchema = z.object({
  system: boundedJsonRecord,
});

export const createUserSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase()),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(40).optional().nullable(),
  roleCodes: z.array(z.string().min(1)).min(1),
  // Strength is checked against the company's password policy in the service.
  temporaryPassword: z.string().min(1).max(128).optional(),
});

export const updateUserSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(40).optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    roleCodes: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one user field is required',
  });

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)),
});

export const listUsersQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  ),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

export const listAuditLogsQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  entityType: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
  actorId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;
export type UpdateStorageSettingsInput = z.infer<typeof updateStorageSettingsSchema>;
export type UpdateIntegrationsInput = z.infer<typeof updateIntegrationsSchema>;
export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type ListAuditLogsQueryInput = z.infer<typeof listAuditLogsQuerySchema>;
