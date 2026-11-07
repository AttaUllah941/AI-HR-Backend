/**
 * Database-backed check that keyset pagination visits every row exactly once, newest first.
 * Skipped unless RUN_DB_TESTS=1 (needs a migrated, seeded database in DATABASE_URL):
 *
 *   RUN_DB_TESTS=1 node --import tsx --test src/utils/cursor.integration.test.ts
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

const enabled = process.env.RUN_DB_TESTS === '1';

describe('cursor pagination against PostgreSQL', { skip: !enabled }, () => {
  after(async () => {
    const { prisma } = await import('../config/database.js');
    await prisma.$disconnect();
  });

  async function walk<T extends { id: string }>(
    fetchPage: (cursor: string) => Promise<{
      items: T[];
      pagination: { hasMore: boolean; nextCursor: string | null };
    }>,
  ) {
    const seen: T[] = [];
    let cursor = '';
    for (let guard = 0; guard < 1000; guard += 1) {
      const page = await fetchPage(cursor);
      seen.push(...page.items);
      if (!page.pagination.hasMore) {
        break;
      }
      cursor = page.pagination.nextCursor!;
    }
    return seen;
  }

  it('audit logs: every row once, newest first, across pages', async () => {
    const { prisma } = await import('../config/database.js');
    const { SettingsRepository, AUDIT_KEYSET } = await import(
      '../modules/settings/repositories/settings.repository.js'
    );
    const { cursorPage } = await import('./cursor.js');
    const repo = new SettingsRepository();

    const company = await prisma.auditLog.findFirst({
      where: { companyId: { not: null } },
      select: { companyId: true },
    });
    assert.ok(company?.companyId, 'needs at least one audit log with a companyId');
    const companyId = company.companyId;
    const expected = await prisma.auditLog.count({ where: { companyId } });

    const rows = await walk(async (cursor) =>
      cursorPage(await repo.listAuditLogsCursor(companyId, { cursor, pageSize: 37 }), 37, AUDIT_KEYSET),
    );

    assert.equal(rows.length, expected);
    assert.equal(new Set(rows.map((r) => r.id)).size, expected, 'no duplicates');
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i - 1].createdAt >= rows[i].createdAt, 'newest first');
    }
  });

  it('notifications: every row once, newest first', async () => {
    const { prisma } = await import('../config/database.js');
    const { NotificationsRepository, NOTIFICATION_KEYSET } = await import(
      '../modules/notifications/repositories/notifications.repository.js'
    );
    const { cursorPage } = await import('./cursor.js');
    const repo = new NotificationsRepository();

    // Pick the user with the fewest notifications so the walk crosses several pages quickly.
    const smallest = await prisma.notification.groupBy({
      by: ['companyId', 'userId'],
      where: { deletedAt: null, channel: 'IN_APP' },
      _count: { _all: true },
      orderBy: { _count: { id: 'asc' } },
      take: 1,
    });
    assert.ok(smallest[0], 'needs at least one in-app notification');
    const { companyId, userId } = smallest[0];
    const expected = await prisma.notification.count({
      where: { companyId, userId, deletedAt: null, channel: 'IN_APP' },
    });

    const rows = await walk(async (cursor) =>
      cursorPage(
        await repo.listForUserCursor(companyId, userId, { cursor, pageSize: 41, channel: 'IN_APP' }),
        41,
        NOTIFICATION_KEYSET,
      ),
    );
    assert.equal(rows.length, expected);
    assert.equal(new Set(rows.map((r) => r.id)).size, expected, 'no duplicates');
  });

  for (const sortDir of ['desc', 'asc'] as const) {
    it(`attendance (${sortDir} by date): every row once, in order`, async () => {
      const { prisma } = await import('../config/database.js');
      const { AttendanceRepository, attendanceKeyset } = await import(
        '../modules/attendance/repositories/attendance.repository.js'
      );
      const { cursorPage } = await import('./cursor.js');
      const repo = new AttendanceRepository();

      const sample = await prisma.attendanceRecord.findFirst({
        where: { deletedAt: null },
        select: { companyId: true, employeeId: true },
      });
      assert.ok(sample, 'needs at least one attendance record');
      // One employee keeps the walk short while still crossing several pages (pageSize 7).
      const employeeId = sample.employeeId;
      const expected = await prisma.attendanceRecord.count({
        where: { companyId: sample.companyId, employeeId, deletedAt: null },
      });

      const rows = await walk(async (cursor) =>
        cursorPage(
          await repo.listAttendanceCursor(sample.companyId, {
            cursor,
            pageSize: 7,
            employeeId,
            sortDir,
          } as never),
          7,
          attendanceKeyset(sortDir),
        ),
      );
      assert.equal(rows.length, expected);
      assert.equal(new Set(rows.map((r) => r.id)).size, expected, 'no duplicates');
      for (let i = 1; i < rows.length; i += 1) {
        const [prev, next] = [rows[i - 1].date.getTime(), rows[i].date.getTime()];
        assert.ok(sortDir === 'desc' ? prev >= next : prev <= next, 'ordered by date');
      }
    });
  }

  it('rejects a tampered cursor with a 400', async () => {
    const { SettingsRepository } = await import(
      '../modules/settings/repositories/settings.repository.js'
    );
    const repo = new SettingsRepository();
    await assert.rejects(
      async () => repo.listAuditLogsCursor('any', { cursor: 'garbage!!', pageSize: 5 }),
      (error: { statusCode?: number }) => error.statusCode === 400,
    );
  });
});
