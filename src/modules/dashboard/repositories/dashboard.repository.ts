import { prisma } from '../../../config/database.js';

export class DashboardRepository {
  countUsers(companyId: string, where: { status?: string } = {}): Promise<number> {
    return prisma.user.count({
      where: {
        companyId,
        deletedAt: null,
        ...(where.status ? { status: where.status as never } : {}),
      },
    });
  }

  countActiveSessions(companyId: string): Promise<number> {
    return prisma.session.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        user: { companyId },
      },
    });
  }

  // AuditLog has no companyId column; scope through the actor's company.
  recentAuditLogs(companyId: string, limit: number) {
    return prisma.auditLog.findMany({
      where: { actor: { companyId } },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async attendanceByDay(companyId: string, from: Date, to: Date) {
    const rows = await prisma.attendanceRecord.groupBy({
      by: ['date', 'status'],
      where: { companyId, deletedAt: null, date: { gte: from, lte: to } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ date: row.date, status: row.status as string, count: row._count._all }));
  }

  countPendingLeave(companyId: string): Promise<number> {
    return prisma.leaveRequest.count({ where: { companyId, deletedAt: null, status: 'PENDING' } });
  }

  latestPayrollRun(companyId: string) {
    return prisma.payrollRun.findFirst({
      where: { companyId, deletedAt: null },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true, status: true },
    });
  }

  countOpenPositions(companyId: string): Promise<number> {
    return prisma.jobOpening.count({ where: { companyId, deletedAt: null, status: 'OPEN' } });
  }

  async applicationsByStatus(companyId: string) {
    const rows = await prisma.jobApplication.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status as string, count: row._count._all }));
  }

  async averageReviewRating(companyId: string): Promise<number | null> {
    const agg = await prisma.performanceReview.aggregate({
      where: { companyId, deletedAt: null, overallRating: { not: null } },
      _avg: { overallRating: true },
    });
    return agg._avg.overallRating ?? null;
  }

  async employeeJoinDates(companyId: string, since: Date) {
    const [before, rows] = await Promise.all([
      prisma.employee.count({
        where: { companyId, deletedAt: null, joinDate: { lt: since } },
      }),
      prisma.employee.findMany({
        where: { companyId, deletedAt: null, joinDate: { gte: since } },
        select: { joinDate: true },
      }),
    ]);
    return { before, joinDates: rows.map((r) => r.joinDate!).filter(Boolean) };
  }

  recentNotificationsForUser(userId: string, limit: number) {
    return prisma.auditLog.findMany({
      where: {
        OR: [{ actorId: userId }, { entityId: userId }],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        metadata: true,
      },
    });
  }

  findUserCompany(userId: string) {
    return prisma.user
      .findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          company: {
            select: { id: true, name: true },
          },
        },
      })
      .then((row) => row?.company ?? null);
  }

  async organizationCountsForUser(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });

    if (!user?.companyId) {
      return { departments: 0, teams: 0, departmentBreakdown: [] as Array<{ name: string }> };
    }

    const [departments, teams, departmentBreakdown] = await Promise.all([
      prisma.department.count({ where: { companyId: user.companyId, deletedAt: null } }),
      prisma.team.count({ where: { companyId: user.companyId, deletedAt: null } }),
      prisma.department.findMany({
        where: { companyId: user.companyId, deletedAt: null, parentId: null },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: 6,
      }),
    ]);

    return { departments, teams, departmentBreakdown };
  }

  async employeeCountsForCompany(companyId: string) {
    const [total, active, byDepartment] = await Promise.all([
      prisma.employee.count({ where: { companyId, deletedAt: null } }),
      prisma.employee.count({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
      }),
      prisma.employee.groupBy({
        by: ['departmentId'],
        where: { companyId, deletedAt: null, departmentId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const departmentIds = byDepartment
      .map((row) => row.departmentId)
      .filter((id): id is string => Boolean(id));

    const departments =
      departmentIds.length > 0
        ? await prisma.department.findMany({
            where: { id: { in: departmentIds } },
            select: { id: true, name: true },
          })
        : [];

    const departmentMap = new Map(departments.map((d) => [d.id, d.name]));

    return {
      total,
      active,
      departmentBreakdown: byDepartment.map((row) => ({
        name: departmentMap.get(row.departmentId!) ?? 'Unassigned',
        count: row._count._all,
      })),
    };
  }
}
