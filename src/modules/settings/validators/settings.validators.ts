import { z } from 'zod';

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().url().max(500).optional().nullable().or(z.literal('')),
  logoUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  timezone: z.string().min(1).max(80).optional(),
  locale: z.string().min(2).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const updateEmailSettingsSchema = z.object({
  emailProvider: z.enum(['console', 'smtp']).optional(),
  emailFrom: z.string().max(255).optional().nullable(),
  emailSmtpUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
  emailApiKey: z.string().max(500).optional().nullable(),
  clearApiKey: z.boolean().optional(),
});

export const updateStorageSettingsSchema = z.object({
  storageProvider: z.enum(['local', 's3', 'azure', 'gcs']).optional(),
  storageBucket: z.string().max(200).optional().nullable(),
  storageRegion: z.string().max(80).optional().nullable(),
  storagePublicBaseUrl: z.string().url().max(500).optional().nullable().or(z.literal('')),
});

export const updateIntegrationsSchema = z.object({
  integrations: z.record(z.string(), z.unknown()),
});

export const updateSystemSettingsSchema = z.object({
  system: z.record(z.string(), z.unknown()),
});

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(40).optional().nullable(),
  roleCodes: z.array(z.string().min(1)).min(1),
  temporaryPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/, 'Must include a letter')
    .regex(/[0-9]/, 'Must include a number')
    .optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(40).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  roleCodes: z.array(z.string().min(1)).min(1).optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;
export type UpdateStorageSettingsInput = z.infer<typeof updateStorageSettingsSchema>;
export type UpdateIntegrationsInput = z.infer<typeof updateIntegrationsSchema>;
export type UpdateSystemSettingsInput = z.infer<typeof updateSystemSettingsSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
