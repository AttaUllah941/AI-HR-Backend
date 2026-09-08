import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePagination, paginationMeta } from './pagination.js';

describe('pagination', () => {
  it('defaults page and pageSize', () => {
    assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20, skip: 0 });
  });

  it('clamps invalid values and computes skip', () => {
    // pageSize 0 is falsy → falls back to default (matches prior list-service behavior)
    assert.deepEqual(parsePagination({ page: 0, pageSize: 0 }), {
      page: 1,
      pageSize: 20,
      skip: 0,
    });
    assert.deepEqual(parsePagination({ page: 3, pageSize: 25 }), {
      page: 3,
      pageSize: 25,
      skip: 50,
    });
  });

  it('respects maxPageSize', () => {
    assert.deepEqual(parsePagination({ pageSize: 999 }, { maxPageSize: 50 }), {
      page: 1,
      pageSize: 50,
      skip: 0,
    });
  });

  it('builds pagination metadata', () => {
    assert.deepEqual(paginationMeta(2, 20, 45), {
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    assert.deepEqual(paginationMeta(1, 20, 0), {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });
  });
});
