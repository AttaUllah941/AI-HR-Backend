import type { Prisma, SessionStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const userAuthInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAuth = Prisma.UserGetPayload<{ include: typeof userAuthInclude }>;

export class AuthRepository {
  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: userAuthInclude,
    });
  }

  findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userAuthInclude,
    });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    companyId?: string;
    status?: UserStatus;
    roleCode: string;
  }) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: data.roleCode } });

    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        companyId: data.companyId,
        status: data.status ?? 'PENDING_VERIFICATION',
        userRoles: {
          create: [{ roleId: role.id }],
        },
      },
      include: userAuthInclude,
    });
  }

  createCompany(name: string) {
    return prisma.company.create({
      data: { name },
    });
  }

  updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
      include: userAuthInclude,
    });
  }

  createSession(data: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        status: 'ACTIVE',
      },
    });
  }

  findSessionById(id: string) {
    return prisma.session.findUnique({ where: { id } });
  }

  findActiveSession(userId: string, refreshTokenHash: string) {
    return prisma.session.findFirst({
      where: {
        userId,
        refreshTokenHash,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });
  }

  updateSession(
    id: string,
    data: { refreshTokenHash?: string; expiresAt?: Date; status?: SessionStatus; revokedAt?: Date },
  ) {
    return prisma.session.update({
      where: { id },
      data,
    });
  }

  revokeUserSessions(userId: string) {
    return prisma.session.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findPasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  markPasswordResetUsed(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findEmailVerificationToken(tokenHash: string) {
    return prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  markEmailVerificationUsed(id: string) {
    return prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  createAuditLog(data: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.auditLog.create({ data });
  }
}
