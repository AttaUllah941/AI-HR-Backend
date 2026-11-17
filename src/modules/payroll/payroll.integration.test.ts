/**
 * Database-backed check of the payroll state machine (batch inserts + transactional audit rows).
 * Skipped unless RUN_DB_TESTS=1 (needs a migrated, seeded database in DATABASE_URL):
 *
 *   RUN_DB_TESTS=1 node --import tsx --test src/modules/payroll/payroll.integration.test.ts
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

const enabled = process.env.RUN_DB_TESTS === '1';

describe('payroll run lifecycle against PostgreSQL', { skip: !enabled }, () => {
  after(async () => {
    const { prisma } = await import('../../config/database.js');
    await prisma.$disconnect();
  });

  it('process → approve → mark paid writes entries, lines, payslips and audit rows atomically', async () => {
    const { prisma } = await import('../../config/database.js');
    const { PayrollService } = await import('./services/payroll.service.js');
    const service = new PayrollService();

    const admin = await prisma.user.findFirst({ where: { email: 'admin@zenith.local' } });
    assert.ok(admin?.companyId, 'seed the database first (npm run prisma:seed)');
    const companyId = admin.companyId;
    // A second approver is needed because the processor may not approve their own run.
    const superAdmin = await prisma.user.findFirst({ where: { email: 'superadmin@zenith.local' } });
    assert.ok(superAdmin, 'needs the seeded super admin');

    const employees = await prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      take: 3,
      select: { id: true },
    });
    assert.ok(employees.length >= 2, 'needs a few employees');

    const year = 2099;
    const month = 1 + Math.floor(Math.random() * 12);
    const run = await prisma.payrollRun.create({
      data: { companyId, year, month, title: `integration ${Date.now()}` },
    });
    const structures = await Promise.all(
      employees.map((e, index) =>
        prisma.salaryStructure.create({
          data: {
            companyId,
            employeeId: e.id,
            basicSalary: 1000 * (index + 1),
            effectiveFrom: new Date('2098-01-01'),
          },
        }),
      ),
    );

    try {
      const actor = (user: { id: string }, roles: string[]) =>
        ({ id: user.id, roles, permissions: ['payroll:update', 'payroll:approve', 'payroll:view'] }) as never;

      await service.processRun(actor(admin, ['HR_ADMIN']), run.id);

      const entries = await prisma.payrollEntry.findMany({ where: { payrollRunId: run.id } });
      const payslips = await prisma.payslip.findMany({ where: { year, month, companyId } });
      // The seeded company may have other active salary structures; ours must all be included.
      const firstCount = entries.length;
      for (const e of employees) {
        assert.ok(entries.some((entry) => entry.employeeId === e.id), 'entry for each test employee');
      }
      assert.ok(payslips.length >= firstCount);
      for (const entry of entries) {
        assert.ok(payslips.some((p) => p.payrollEntryId === entry.id), 'each entry has its payslip');
      }

      // The audit row is written in the same transaction as the status change.
      const processed = await prisma.auditLog.count({
        where: { action: 'payroll.run.process', entityId: run.id },
      });
      assert.equal(processed, 1);
      assert.equal((await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, 'COMPLETED');

      // Processing again replaces entries instead of duplicating them.
      await service.processRun(actor(admin, ['HR_ADMIN']), run.id);
      assert.equal(await prisma.payrollEntry.count({ where: { payrollRunId: run.id } }), firstCount);

      await service.approveRun(actor(superAdmin, ['SUPER_ADMIN']), run.id);
      assert.equal(
        await prisma.auditLog.count({ where: { action: 'payroll.run.approve', entityId: run.id } }),
        1,
      );

      await service.markRunPaid(actor(superAdmin, ['SUPER_ADMIN']), run.id);
      const paid = await prisma.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
      assert.equal(paid.status, 'PAID');
      assert.equal(await prisma.payslip.count({ where: { year, month, companyId, status: 'PAID' } }), firstCount);
    } finally {
      await prisma.payslip.deleteMany({ where: { year, month, companyId } });
      await prisma.payrollRun.delete({ where: { id: run.id } });
      await prisma.salaryStructure.deleteMany({ where: { id: { in: structures.map((s) => s.id) } } });
      await prisma.auditLog.deleteMany({ where: { entityId: run.id } });
    }
  });
});
