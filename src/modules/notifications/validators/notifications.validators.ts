import { z } from 'zod';

export const notificationCategorySchema = z.enum([
  'SYSTEM',
  'LEAVE',
  'ATTENDANCE',
  'PAYROLL',
  'RECRUITMENT',
  'PERFORMANCE',
  'AI',
  'SECURITY',
  'OTHER',
]);

export const notificationChannelSchema = z.enum(['IN_APP', 'EMAIL', 'PUSH']);

export const notificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED', 'READ']);

export const pushPlatformSchema = z.enum(['WEB', 'IOS', 'ANDROID']);

export const sendNotificationSchema = z.object({
  userId: z.string().cuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  category: notificationCategorySchema.default('SYSTEM'),
  channels: z.array(notificationChannelSchema).min(1).default(['IN_APP']),
  templateCode: z.string().min(1).max(80).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const createTemplateSchema = z.object({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  category: notificationCategorySchema.default('SYSTEM'),
  channel: notificationChannelSchema.default('IN_APP'),
  subject: z.string().max(200).optional().nullable(),
  bodyTemplate: z.string().min(1).max(8000),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const upsertPreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: notificationCategorySchema,
        inAppEnabled: z.boolean(),
        emailEnabled: z.boolean(),
        pushEnabled: z.boolean(),
      }),
    )
    .min(1),
});

export const registerDeviceSchema = z.object({
  token: z.string().min(8).max(512),
  platform: pushPlatformSchema.default('WEB'),
  label: z.string().max(120).optional().nullable(),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type UpsertPreferencesInput = z.infer<typeof upsertPreferencesSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
