import { z } from 'zod';

export const fileCategories = [
  'GENERAL',
  'EMPLOYEE_DOCUMENT',
  'RESUME',
  'AVATAR',
  'POLICY',
  'OTHER',
] as const;

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalCuid = z.preprocess(emptyToUndefined, z.string().cuid().optional());

const optionalNullableCuid = z.preprocess(
  emptyToUndefined,
  z.union([z.string().cuid(), z.null()]).optional(),
);

export const listFilesQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(fileCategories).optional()),
  employeeId: optionalCuid,
  candidateId: optionalCuid,
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

/** Multipart text fields after multer. */
export const uploadFileFieldsSchema = z.object({
  category: z.preprocess(
    emptyToUndefined,
    z.enum(fileCategories).optional().default('GENERAL'),
  ),
  title: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  description: z.preprocess(emptyToUndefined, z.string().max(2000).optional()),
  employeeId: optionalCuid,
  candidateId: optionalCuid,
});

export const updateFileSchema = z
  .object({
    title: z.string().max(200).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    category: z.enum(fileCategories).optional(),
    employeeId: optionalNullableCuid,
    candidateId: optionalNullableCuid,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one file field is required',
  });

export type ListFilesQueryInput = z.infer<typeof listFilesQuerySchema>;
export type UploadFileFieldsInput = z.infer<typeof uploadFileFieldsSchema>;
export type UpdateFileInput = z.infer<typeof updateFileSchema>;
