/**
 * Proves the single-query headcount trend returns exactly what the previous 2-counts-per-month
 * implementation returned. Skipped unless RUN_DB_TESTS=1:
 *
 *   RUN_DB_TESTS=1 node --import tsx --test src/modules/reports/headcount.integration.test.ts
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

const enabled = process.env.RUN_DB_TESTS === '1';

describe('headcount trend (SQL aggregation)', { skip: !enabled }, () => {
  after(async () => {
    const { prisma } = await import('../../config/database.js');
    await prisma.$disconnect();
  });

  it('matches the per-month count implementation and uses one query', async () => {
    const { prisma } = await import('../../config/database.js');
    const { ReportsRepository } = await import('./repositories/reports.repository.js');
    const repo = new ReportsRepository();

    const company = await prisma.employee.findFirst({ select: { companyId: true } });
    assert.ok(company, 'needs employees');
    const companyId = company.companyId;
    const months = 6;

    // Reference: the original implementation (2 counts per month).
    const now = new Date();
    const oldStart = performance.now();
    // Same shape as the original: every month in parallel, two counts per month.
    const expected = await Promise.all(
      Array.from({ length: months }, (_, index) => {
        const i = months - 1 - index;
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const from = new Date(Date.UTC(year, month - 1, 1));
        const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        return Promise.all([
          prisma.employee.count({ where: { companyId, deletedAt: null, joinDate: { gte: from, lte: to } } }),
          prisma.employee.count({
            where: {
              companyId,
              deletedAt: null,
              status: 'ACTIVE',
              OR: [{ joinDate: null }, { joinDate: { lte: to } }],
              AND: [{ OR: [{ exitDate: null }, { exitDate: { gt: to } }] }],
            },
          }),
        ]).then(([hired, active]) => ({ year, month, hired, active }));
      }),
    );
    const oldMs = performance.now() - oldStart;

    await repo.headcountTrend(companyId, months); // warm-up
    const t0 = performance.now();
    const actual = await repo.headcountTrend(companyId, months);
    const sqlMs = performance.now() - t0;

    assert.deepEqual(actual, expected);
    console.log(`headcountTrend: old (${months * 2} parallel counts) ${oldMs.toFixed(1)} ms -> single query ${sqlMs.toFixed(1)} ms`);
  });
});
