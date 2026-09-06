import type { Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../../config/database.js';

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
      select: { id: true, code: true, name: true },
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
    const where: Prisma.AuditLogWhereInput = {
      actor: { companyId },
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

    return Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              companyId: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);
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
