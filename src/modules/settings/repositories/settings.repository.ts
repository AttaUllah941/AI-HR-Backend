import type { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { decodeCursor, keysetOrderBy, keysetWhere, type KeysetField } from '../../../utils/cursor.js';

export const AUDIT_KEYSET: KeysetField[] = [
  { key: 'createdAt', dir: 'desc', isDate: true },
  { key: 'id', dir: 'desc' },
];

const auditActorSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  companyId: true,
} as const;

const notDeleted = { deletedAt: null };

export class SettingsRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, ...notDeleted },
      select: { id: true, companyId: true, email: true },
    });
  }

  findCompany(companyId: string) {
    return prisma.company.findFirst({
      where: { id: companyId, ...notDeleted },
    });
  }

  updateCompany(companyId: string, data: Prisma.CompanyUpdateInput) {
    return prisma.company.update({
      where: { id: companyId },
      data,
    });
  }

  getOrCreateSettings(companyId: string) {
    return prisma.companySettings.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
  }

  updateSettings(companyId: string, data: Prisma.CompanySettingsUpdateInput) {
    return prisma.companySettings.update({
      where: { companyId },
      data,
    });
  }

  async ensureSettings(companyId: string) {
    return this.getOrCreateSettings(companyId);
  }

  countUsers(companyId: string, whereExtra: Prisma.UserWhereInput = {}) {
    return prisma.user.count({
      where: { companyId, ...notDeleted, ...whereExtra },
    });
  }

  listUsers(
    companyId: string,
    query: { page: number; pageSize: number; search?: string; status?: UserStatus },
  ) {
    const where: Prisma.UserWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            select: {
              role: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);
  }

  findUserInCompany(companyId: string, userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, companyId, ...notDeleted },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
  }

  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ...notDeleted },
      select: { id: true },
    });
  }

  findRolesByCodes(codes: string[]) {
    return prisma.role.findMany({
      where: { code: { in: codes } },
      select: {
        id: true,
        code: true,
        name: true,
        rolePermissions: { select: { permission: { select: { code: true } } } },
      },
    });
  }

  /** Revokes every active session of a user (used on suspension, deletion and role changes). */
  revokeUserSessions(userId: string) {
    return prisma.session.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  createUser(data: {
    companyId: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    status: UserStatus;
    roleIds: string[];
  }) {
    return prisma.user.create({
      data: {
        companyId: data.companyId,
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? null,
        status: data.status,
        emailVerifiedAt: new Date(),
        userRoles: {
          create: data.roleIds.map((roleId) => ({ roleId })),
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: {
          select: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
  }

  updateUser(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      status?: UserStatus;
      roleIds?: string[];
    },
  ) {
    return prisma.$transaction(async (tx) => {
      if (data.roleIds) {
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userRole.createMany({
          data: data.roleIds.map((roleId) => ({ userId, roleId })),
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            select: {
              role: { select: { id: true, code: true, name: true } },
            },
          },
        },
      });
    });
  }

  softDeleteUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Removes a user that was just created and never used, freeing the unique email for a retry.
   * Falls back to a soft delete (with a tombstoned email) if related rows block the hard delete.
   */
  async discardNewUser(userId: string, email: string) {
    try {
      await prisma.user.delete({ where: { id: userId } });
    } catch {
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          deletedAt: new Date(),
          email: `deleted+${userId}+${email}`,
        },
      });
    }
  }

  getSecurityPolicy(companyId: string) {
    return prisma.companySecurityPolicy.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
  }

  listRoles() {
    return prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        rolePermissions: {
          select: {
            permission: {
              select: { id: true, code: true, module: true, action: true, description: true },
            },
          },
        },
        _count: { select: { userRoles: true } },
      },
    });
  }

  findRoleById(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          select: {
            permission: {
              select: { id: true, code: true, module: true, action: true, description: true },
            },
          },
        },
        _count: { select: { userRoles: true } },
      },
    });
  }

  listPermissions() {
    return prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  findPermissionsByCodes(codes: string[]) {
    return prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
  }

  replaceRolePermissions(roleId: string, permissionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: {
          rolePermissions: {
            select: {
              permission: {
                select: { id: true, code: true, module: true, action: true, description: true },
              },
            },
          },
          _count: { select: { userRoles: true } },
        },
      });
    });
  }

  private auditWhere(
    companyId: string,
    query: { actorId?: string; entityType?: string; search?: string },
  ): Prisma.AuditLogWhereInput {
    return {
      // Indexed (companyId, createdAt); filled by a DB trigger from the actor for every new row.
      companyId,
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { entityType: { contains: query.search, mode: 'insensitive' } },
              { entityId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Offset page (with total). Unchanged response shape for existing clients. */
  listAuditLogs(
    companyId: string,
    query: {
      page: number;
      pageSize: number;
      actorId?: string;
      entityType?: string;
      search?: string;
    },
  ) {
    const where = this.auditWhere(companyId, query);
    return Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: auditActorSelect } },
      }),
      prisma.auditLog.count({ where }),
    ]);
  }

  /** Keyset page (no COUNT): fetches pageSize + 1 rows after the cursor. */
  listAuditLogsCursor(
    companyId: string,
    query: {
      cursor?: string;
      pageSize: number;
      actorId?: string;
      entityType?: string;
      search?: string;
    },
  ) {
    const base = this.auditWhere(companyId, query);
    const after = decodeCursor(query.cursor, AUDIT_KEYSET);
    const where: Prisma.AuditLogWhereInput = after
      ? { AND: [base, keysetWhere(AUDIT_KEYSET, after) as Prisma.AuditLogWhereInput] }
      : base;
    return prisma.auditLog.findMany({
      where,
      orderBy: keysetOrderBy(AUDIT_KEYSET) as Prisma.AuditLogOrderByWithRelationInput[],
      take: query.pageSize + 1,
      include: { actor: { select: auditActorSelect } },
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
}
