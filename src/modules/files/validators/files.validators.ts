import { z } from 'zod';

export const fileCategories = [
  'GENERAL',
  'EMPLOYEE_DOCUMENT',
  'RESUME',
  'AVATAR',
  'POLICY',
  'OTHER',
] as const;

export const updateFileSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(fileCategories).optional(),
  employeeId: z.string().min(1).optional().nullable(),
  candidateId: z.string().min(1).optional().nullable(),
});

export type UpdateFileInput = z.infer<typeof updateFileSchema>;
