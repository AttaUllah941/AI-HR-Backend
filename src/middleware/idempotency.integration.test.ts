/**
 * Database-backed check that the unique (userId, scope, key) index makes concurrent duplicates safe.
 * Skipped unless RUN_DB_TESTS=1:
 *
 *   RUN_DB_TESTS=1 node --import tsx --test src/middleware/idempotency.integration.test.ts
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

const enabled = process.env.RUN_DB_TESTS === '1';

describe('idempotency store against PostgreSQL', { skip: !enabled }, () => {
  const scope = `test.scope.${Date.now()}`;
  const userId = 'idem-test-user';

  after(async () => {
    const { prisma } = await import('../config/database.js');
    await prisma.idempotencyKey.deleteMany({ where: { scope } });
    await prisma.$disconnect();
  });

  it('lets exactly one of several concurrent requests claim a key', async () => {
    const { prismaIdempotencyStore } = await import('./idempotency.middleware.js');
    const args = {
      userId,
      scope,
      key: 'concurrent-key-1',
      requestHash: 'h1',
      expiresAt: new Date(Date.now() + 60_000),
    };

    const results = await Promise.all(Array.from({ length: 8 }, () => prismaIdempotencyStore.begin(args)));
    assert.equal(results.filter((r) => r.created).length, 1, 'exactly one winner');
    for (const r of results.filter((r) => !r.created)) {
      assert.equal((r as { existing: { requestHash: string } }).existing.requestHash, 'h1');
    }
  });

  it('stores the response, replays it, and forgets released keys', async () => {
    const { prismaIdempotencyStore: store } = await import('./idempotency.middleware.js');
    const base = { userId, scope, requestHash: 'h2', expiresAt: new Date(Date.now() + 60_000) };

    await store.begin({ ...base, key: 'replay-key-0001' });
    await store.complete(userId, scope, 'replay-key-0001', 201, { data: { id: 'run1' } });
    const again = await store.begin({ ...base, key: 'replay-key-0001' });
    assert.equal(again.created, false);
    const existing = (again as { existing: { status: string; responseStatus: number; responseBody: unknown } }).existing;
    assert.equal(existing.status, 'COMPLETED');
    assert.equal(existing.responseStatus, 201);
    assert.deepEqual(existing.responseBody, { data: { id: 'run1' } });

    await store.begin({ ...base, key: 'released-key-001' });
    await store.release(userId, scope, 'released-key-001');
    assert.equal((await store.begin({ ...base, key: 'released-key-001' })).created, true);
  });

  it('lets an expired key be claimed again', async () => {
    const { prismaIdempotencyStore: store } = await import('./idempotency.middleware.js');
    const base = { userId, scope, requestHash: 'h3' };
    await store.begin({ ...base, key: 'expired-key-0001', expiresAt: new Date(Date.now() - 1000) });
    const again = await store.begin({ ...base, key: 'expired-key-0001', expiresAt: new Date(Date.now() + 60_000) });
    assert.equal(again.created, true);
  });
});
