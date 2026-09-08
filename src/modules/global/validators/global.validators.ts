import { z } from 'zod';

export const searchTypes = [
  'employees',
  'departments',
  'branches',
  'candidates',
  'jobs',
  'files',
  'users',
] as const;

export const globalSearchSchema = z.object({
  q: z.string().min(1).max(200),
  types: z.string().optional(), // comma-separated
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
  sortBy: z.enum(['relevance', 'title', 'updatedAt', 'type']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  departmentId: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
});

export const createBookmarkSchema = z.object({
  title: z.string().min(1).max(200),
  route: z.string().min(1).max(500),
  entityType: z.string().max(80).optional().nullable(),
  entityId: z.string().max(80).optional().nullable(),
  query: z.string().max(200).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
});

export const updateBookmarkSchema = createBookmarkSchema.partial();

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
