import type { Prisma, SessionStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const userAuthInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
  employee: {
    select: {
      id: true,
      employeeCode: true,
      department: { select: { id: true, name: true, code: true } },
      designation: { select: { id: true, name: true, code: true } },
      branch: { select: { id: true, name: true, code: true } },
      status: true,
      joinDate: true,
      workLocation: true,
    },
  },
  preference: true,
} satisfies Prisma.UserInclude;

export class ProfileRepository {
  findUser(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userAuthInclude,
    });
  }

  findUserAuth(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        passwordChangedAt: true,
        mfaEnabled: true,
      },
    });
  }

  updateUser(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      avatarUrl?: string | null;
      passwordHash?: string;
      passwordChangedAt?: Date;
    },
  ) {
    return prisma.user.update({
      where: { id: userId },
      data,
      include: userAuthInclude,
    });
  }

  getOrCreatePreferences(userId: string) {
    return prisma.userPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  updatePreferences(
    userId: string,
    data: Partial<{
      theme: string;
      locale: string;
      timezone: string;
      dateFormat: string;
      timeFormat: string;
      weekStartsOn: number;
    }>,
  ) {
    return prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findSession(userId: string, sessionId: string) {
    return prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
  }

  revokeSession(sessionId: string) {
    return prisma.session.update({
      where: { id: sessionId },
      data: { status: 'REVOKED' as SessionStatus, revokedAt: new Date() },
    });
  }

  revokeOtherSessions(userId: string, keepSessionId?: string | null) {
    return prisma.session.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  listActivity(userId: string, take = 30) {
    return prisma.auditLog.findMany({
      where: {
        OR: [{ actorId: userId }, { entityId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });
  }

  createAuditLog(data: {
    actorId: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        entityType: data.entityType ?? 'User',
        entityId: data.entityId ?? data.actorId,
        metadata: data.metadata ?? undefined,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }
}
