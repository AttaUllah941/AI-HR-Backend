import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { DEFAULT_SECURITY_POLICY } from '../../../utils/security.js';

const notDeleted = { deletedAt: null };

export class SecurityRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, ...notDeleted },
      select: { id: true, companyId: true },
    });
  }

  getOrCreatePolicy(companyId: string) {
    return prisma.companySecurityPolicy.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
  }

  updatePolicy(companyId: string, data: Prisma.CompanySecurityPolicyUpdateInput) {
    return prisma.companySecurityPolicy.update({
      where: { companyId },
      data,
    });
  }

  countUsers(companyId: string) {
    return prisma.user.count({ where: { companyId, ...notDeleted } });
  }

  countMfaEnabled(companyId: string) {
    return prisma.user.count({
      where: { companyId, ...notDeleted, mfaEnabled: true },
    });
  }

  countLockedUsers(companyId: string) {
    return prisma.user.count({
      where: {
        companyId,
        ...notDeleted,
        lockedUntil: { gt: new Date() },
      },
    });
  }

  countPrivilegedWithoutMfa(companyId: string) {
    return prisma.user.count({
      where: {
        companyId,
        ...notDeleted,
        mfaEnabled: false,
        userRoles: {
          some: {
            role: { code: { in: ['SUPER_ADMIN', 'HR_ADMIN'] } },
          },
        },
      },
    });
  }

  countFailedLoginsSince(companyId: string, since: Date) {
    return prisma.loginAttempt.count({
      where: { companyId, success: false, createdAt: { gte: since } },
    });
  }

  listLoginAttempts(
    companyId: string,
    query: { page: number; pageSize: number; email?: string; success?: boolean },
  ) {
    const where: Prisma.LoginAttemptWhereInput = {
      companyId,
      ...(query.email ? { email: { contains: query.email, mode: 'insensitive' } } : {}),
      ...(query.success === undefined ? {} : { success: query.success }),
    };
    return Promise.all([
      prisma.loginAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.loginAttempt.count({ where }),
    ]);
  }

  createLoginAttempt(data: {
    companyId?: string | null;
    userId?: string | null;
    email: string;
    success: boolean;
    reason?: string | null;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.loginAttempt.create({
      data: {
        companyId: data.companyId ?? null,
        userId: data.userId ?? null,
        email: data.email.toLowerCase(),
        success: data.success,
        reason: data.reason ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  createAuditLog(input: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({ data: input });
  }

  getDefaultPolicyShape() {
    return DEFAULT_SECURITY_POLICY;
  }
}
