import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { requireSameCompanyParam } from './tenant.middleware.js';

function run(user: unknown, companyId: string): unknown {
  let result: unknown = 'not-called';
  requireSameCompanyParam(
    { user, params: { companyId } } as unknown as Request,
    {} as Response,
    (err?: unknown) => {
      result = err ?? 'ok';
    },
  );
  return result;
}

const quantum = { id: 'u1', companyId: 'c1', companySlug: 'quantum-tech-solutions' };

describe('requireSameCompanyParam', () => {
  it('allows the user own company by id or slug', () => {
    assert.equal(run(quantum, 'c1'), 'ok');
    assert.equal(run(quantum, 'Quantum-Tech-Solutions'), 'ok');
  });
  it('rejects another company with 403', () => {
    const err = run(quantum, 'c2') as { statusCode: number };
    assert.equal(err.statusCode, 403);
  });
  it('rejects platform users (no company) and anonymous requests', () => {
    assert.equal((run({ id: 'p', companyId: null, companySlug: null }, 'c1') as { statusCode: number }).statusCode, 403);
    assert.equal((run(undefined, 'c1') as { statusCode: number }).statusCode, 401);
  });
});
