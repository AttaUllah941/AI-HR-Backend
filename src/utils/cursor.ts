/* ------------------------------------------------------------------------------------------ *
 * Cursor (keyset) pagination
 *
 * Offset pagination gets slower the deeper you page and drifts when rows are inserted. Cursor
 * pagination remembers the sort key of the last row instead. Endpoints opt in with `?cursor=`
 * (empty = first page); without it they keep the offset behaviour and response shape.
 * ------------------------------------------------------------------------------------------ */

import { ValidationError } from './app-error.js';

export type CursorDirection = 'asc' | 'desc';

export interface KeysetField {
  /** Prisma field name. */
  key: string;
  dir: CursorDirection;
  /** True for DateTime fields (revived from ISO strings when a cursor is decoded). */
  isDate?: boolean;
}

export class InvalidCursorError extends ValidationError {
  constructor() {
    super('Invalid pagination cursor');
    this.name = 'InvalidCursorError';
  }
}

/** True when the request opted into cursor pagination (`cursor` present, even if empty). */
export function wantsCursor(params: { cursor?: unknown }): boolean {
  return params.cursor !== undefined && params.cursor !== null;
}

export function encodeCursor(values: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null for the empty (first-page) cursor. */
export function decodeCursor(
  cursor: string | undefined,
  fields: KeysetField[],
): Record<string, unknown> | null {
  if (!cursor) {
    return null;
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new InvalidCursorError();
  }
  if (!raw || typeof raw !== 'object') {
    throw new InvalidCursorError();
  }

  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.key];
    if (value === undefined || value === null) {
      throw new InvalidCursorError();
    }
    if (field.isDate) {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        throw new InvalidCursorError();
      }
      out[field.key] = date;
    } else {
      out[field.key] = value;
    }
  }
  return out;
}

/**
 * Builds the Prisma `where` fragment for "rows strictly after this cursor" under the given
 * ordering (all fields together must form a total order, so end with a unique field like id):
 *   (a > A) OR (a = A AND b > B) OR (a = A AND b = B AND c > C) ...
 * `>` becomes `<` for descending fields.
 */
export function keysetWhere(
  fields: KeysetField[],
  after: Record<string, unknown>,
): Record<string, unknown> {
  const clauses = fields.map((field, index) => {
    const equals = fields.slice(0, index).map((prev) => ({ [prev.key]: after[prev.key] }));
    const compare = { [field.key]: { [field.dir === 'desc' ? 'lt' : 'gt']: after[field.key] } };
    return equals.length ? { AND: [...equals, compare] } : compare;
  });
  return { OR: clauses };
}

/** `orderBy` array for the same field list. */
export function keysetOrderBy(fields: KeysetField[]): Array<Record<string, CursorDirection>> {
  return fields.map((field) => ({ [field.key]: field.dir }));
}

function serializeKey(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Trims the over-fetched row (query `take: pageSize + 1`) and builds the response meta.
 * Always inside the existing `pagination` key so the envelope stays `{ items, pagination }`.
 */
export function cursorPage<T extends object>(rows: T[], pageSize: number, fields: KeysetField[]) {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1] as Record<string, unknown> | undefined;
  const nextCursor =
    hasMore && last
      ? encodeCursor(Object.fromEntries(fields.map((f) => [f.key, serializeKey(last[f.key])])))
      : null;
  return {
    items,
    pagination: { mode: 'cursor' as const, pageSize, hasMore, nextCursor },
  };
}
