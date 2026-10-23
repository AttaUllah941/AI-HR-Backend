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

export const employeeStatusFilters = [
  'DRAFT',
  'ACTIVE',
  'ON_LEAVE',
  'PROBATION',
  'NOTICE_PERIOD',
  'TERMINATED',
  'RESIGNED',
  'INACTIVE',
] as const;

export const fileCategoryFilters = [
  'GENERAL',
  'EMPLOYEE_DOCUMENT',
  'RESUME',
  'AVATAR',
  'POLICY',
  'OTHER',
] as const;

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalBool = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const SAFE_ROUTE = /^\/[A-Za-z0-9\-._~/?=&%#:@!$'()*+,;]*$/;

function isSafeInternalRoute(route: string): boolean {
  if (!SAFE_ROUTE.test(route)) return false;
  if (route.includes('//') || route.includes('\\')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(route);
  } catch {
    return false;
  }
  // Encoded slashes/backslashes must not smuggle in a protocol-relative or backslash redirect.
  return !decoded.includes('\\') && !decoded.includes('//') && !decoded.includes('://');
}

const appRouteSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(isSafeInternalRoute, {
    message: 'Bookmark route must be an internal path starting with a single /',
  });

export const globalSearchSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().min(1).max(200)),
  types: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(50).optional(),
  ),
  sortBy: z.preprocess(
    emptyToUndefined,
    z.enum(['relevance', 'title', 'updatedAt', 'type']).optional(),
  ),
  sortDir: z.preprocess(emptyToUndefined, z.enum(['asc', 'desc']).optional()),
  departmentId: z.preprocess(emptyToUndefined, z.string().cuid().optional()),
  status: z.preprocess(emptyToUndefined, z.enum(employeeStatusFilters).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(fileCategoryFilters).optional()),
  /** When false, skip writing to recent-searches (e.g. command palette). Default true. */
  saveRecent: optionalBool,
});

export const createBookmarkSchema = z.object({
  title: z.string().min(1).max(200),
  route: appRouteSchema,
  entityType: z.string().max(80).optional().nullable(),
  entityId: z.string().max(80).optional().nullable(),
  query: z.string().max(200).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
});

export const updateBookmarkSchema = createBookmarkSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one bookmark field is required',
  });

export type GlobalSearchInput = z.infer<typeof globalSearchSchema>;
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
