import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InvalidCursorError,
  cursorPage,
  decodeCursor,
  encodeCursor,
  keysetOrderBy,
  keysetWhere,
  wantsCursor,
  type KeysetField,
} from './cursor.js';

describe('cursor pagination', () => {
  const fields: KeysetField[] = [
    { key: 'createdAt', dir: 'desc', isDate: true },
    { key: 'id', dir: 'desc' },
  ];

  it('opts in only when the cursor param is present (empty = first page)', () => {
    assert.equal(wantsCursor({}), false);
    assert.equal(wantsCursor({ cursor: '' }), true);
    assert.equal(wantsCursor({ cursor: 'abc' }), true);
  });

  it('round-trips a cursor and revives dates', () => {
    const at = new Date('2026-01-02T03:04:05.000Z');
    const decoded = decodeCursor(encodeCursor({ createdAt: at.toISOString(), id: 'x1' }), fields);
    assert.deepEqual(decoded, { createdAt: at, id: 'x1' });
  });

  it('treats the empty cursor as the first page', () => {
    assert.equal(decodeCursor('', fields), null);
    assert.equal(decodeCursor(undefined, fields), null);
  });

  it('rejects tampered, incomplete or non-date cursors with a 400', () => {
    assert.throws(() => decodeCursor('not-base64-json!!', fields), InvalidCursorError);
    assert.throws(() => decodeCursor(encodeCursor({ id: 'x' }), fields), InvalidCursorError);
    assert.throws(
      () => decodeCursor(encodeCursor({ createdAt: 'nope', id: 'x' }), fields),
      InvalidCursorError,
    );
    try {
      decodeCursor('###', fields);
    } catch (error) {
      assert.equal((error as InvalidCursorError).statusCode, 400);
    }
  });

  it('builds a strict "after cursor" where clause for a descending order', () => {
    const at = new Date('2026-01-02T00:00:00.000Z');
    assert.deepEqual(keysetWhere(fields, { createdAt: at, id: 'x1' }), {
      OR: [{ createdAt: { lt: at } }, { AND: [{ createdAt: at }, { id: { lt: 'x1' } }] }],
    });
  });

  it('flips the comparison for ascending fields', () => {
    const mixed: KeysetField[] = [
      { key: 'date', dir: 'asc', isDate: true },
      { key: 'id', dir: 'desc' },
    ];
    const d = new Date('2026-03-01T00:00:00.000Z');
    const where = keysetWhere(mixed, { date: d, id: 'a' }) as { OR: Array<Record<string, unknown>> };
    assert.deepEqual(where.OR[0], { date: { gt: d } });
    assert.deepEqual(keysetOrderBy(mixed), [{ date: 'asc' }, { id: 'desc' }]);
  });

  it('trims the over-fetched row and emits the next cursor', () => {
    const rows = [1, 2, 3].map((n) => ({ id: `id${n}`, createdAt: new Date(2026, 0, 10 - n) }));
    const page = cursorPage(rows, 2, fields);
    assert.equal(page.items.length, 2);
    assert.equal(page.pagination.hasMore, true);
    assert.equal(page.pagination.pageSize, 2);
    const next = decodeCursor(page.pagination.nextCursor!, fields)!;
    assert.equal(next['id'], 'id2');
    assert.ok(next['createdAt'] instanceof Date);
  });

  it('has no next cursor on the last page', () => {
    const page = cursorPage([{ id: 'a', createdAt: new Date() }], 5, fields);
    assert.deepEqual(page.pagination, {
      mode: 'cursor',
      pageSize: 5,
      hasMore: false,
      nextCursor: null,
    });
  });
});
