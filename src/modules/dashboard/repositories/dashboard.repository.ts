import { prisma } from '../../../config/database.js';

export class DashboardRepository {
  countUsers(where: { status?: string; deletedAt?: null } = {}): Promise<number> {
    return prisma.user.count({
      where: {
        deletedAt: null,
        ...(where.status ? { status: where.status as never } : {}),
      },
    });
  }

  countCompanies(): Promise<number> {
    return prisma.company.count({ where: { deletedAt: null, isActive: true } });
  }

  countActiveSessions(): Promise<number> {
    return prisma.session.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });
  }

  countMfaEnabledUsers(): Promise<number> {
    return prisma.user.count({
      where: { deletedAt: null, mfaEnabled: true },
    });
  }

  groupUsersByStatus() {
    return prisma.user.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
  }

  async usersCreatedByMonth(months: number) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - (months - 1));

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: start },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return { start, users };
  }

  recentAuditLogs(limit: number) {
    return prisma.auditLog.findMany({
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
