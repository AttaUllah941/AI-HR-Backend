import { z } from 'zod';

/** Hard ceiling for any list endpoint. */
export const MAX_PAGE_SIZE = 100;

export const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

/** `?page=` (1-based). Blank means "not provided". */
export const pageQuery = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional());

/** `?pageSize=` capped at MAX_PAGE_SIZE. Blank means "not provided". */
export const pageSizeQuery = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
);

/**
 * `?cursor=` opts a list endpoint into cursor (keyset) pagination.
 * Present-but-empty (`?cursor=`) means "first page"; omit it to keep offset pagination.
 */
export const cursorQuery = z.string().max(512).optional();

/** Offset pagination: page + pageSize. */
export const paginationQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery,
});

/** Cursor pagination: cursor + pageSize. */
export const cursorQuerySchema = z.object({
  cursor: cursorQuery,
  pageSize: pageSizeQuery,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;
