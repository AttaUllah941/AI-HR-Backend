import type { PrismaClient } from '@prisma/client';

// Generated from the permission matrix in prisma/seed.ts so every seed uses the same RBAC.
// PLATFORM_SUPER_ADMIN is platform-level (no company) and is authorised by role in the platform module.
export const ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full platform access' },
  { code: 'HR_ADMIN', name: 'HR Admin', description: 'Full HR administration' },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'HR operations management' },
  { code: 'RECRUITER', name: 'Recruiter', description: 'Recruitment pipeline access' },
  { code: 'MANAGER', name: 'Manager', description: 'Team management access' },
  { code: 'EMPLOYEE', name: 'Employee', description: 'Self-service employee access' },
] as const;

export const ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT', 'MANAGE'] as const;

export const MODULES = [
  'dashboard',
  'organization',
  'employees',
  'attendance',
  'leave',
  'payroll',
  'recruitment',
  'performance',
  'ai',
  'reports',
  'notifications',
  'settings',
  'files',
  'users',
  'roles',
] as const;

/** Permission codes granted per role (roles:manage is Super Admin only). */
export const ROLE_PERMISSION_CODES: Record<string, 'ALL' | string[]> = {
  SUPER_ADMIN: 'ALL',
  HR_ADMIN: 'ALL', // filtered below to exclude roles:manage
  HR_MANAGER: [
    'dashboard:view',
    'organization:view',
    'organization:create',
    'organization:update',
    'employees:view',
    'employees:create',
    'employees:update',
    'attendance:view',
    'attendance:create',
    'attendance:update',
    'attendance:approve',
    'attendance:export',
    'leave:view',
    'leave:create',
    'leave:update',
    'leave:approve',
    'leave:export',
    'payroll:view',
    'payroll:create',
    'payroll:update',
    'payroll:approve',
    'payroll:delete',
    'payroll:export',
    'recruitment:view',
    'recruitment:create',
    'recruitment:update',
    'recruitment:approve',
    'recruitment:delete',
    'performance:view',
    'performance:create',
    'performance:update',
    'performance:approve',
    'ai:view',
    'ai:create',
    'ai:delete',
    'reports:view',
    'reports:export',
    'notifications:view',
    'notifications:manage',
    'files:view',
    'files:create',
    'files:update',
    'files:delete',
    'users:view',
    'users:create',
    'users:update',
    'roles:view',
    'settings:view',
    'settings:update',
  ],
  RECRUITER: [
    'dashboard:view',
    'employees:view',
    'recruitment:view',
    'recruitment:create',
    'recruitment:update',
    'recruitment:approve',
    'recruitment:delete',
    'ai:view',
    'ai:create',
    'ai:delete',
    'reports:view',
    'notifications:view',
    'files:view',
    'files:create',
    'files:update',
  ],
  MANAGER: [
    'dashboard:view',
    'organization:view',
    'employees:view',
    'attendance:view',
    'attendance:approve',
    'leave:view',
    'leave:approve',
    'payroll:view',
    'performance:view',
    'performance:create',
    'performance:update',
    'performance:approve',
    'ai:view',
    'reports:view',
    'notifications:view',
    'files:view',
  ],
  EMPLOYEE: [
    'dashboard:view',
    'attendance:view',
    'attendance:create',
    'leave:view',
    'leave:create',
    'payroll:view',
    'performance:view',
    'notifications:view',
    'files:view',
    'ai:view',
  ],
};

export const PLATFORM_ROLE = {
  code: 'PLATFORM_SUPER_ADMIN',
  name: 'Platform Super Admin',
  description: 'Manages companies and the platform; belongs to no tenant',
} as const;

/** Idempotently creates roles, permissions and role-permission grants. Never deletes users or data. */
export async function ensureRbac(prisma: PrismaClient): Promise<void> {
  for (const role of [...ROLES, PLATFORM_ROLE]) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, isSystem: true },
      create: { ...role, isSystem: true },
    });
  }
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      const code = `${module}:${action}`.toLowerCase();
      await prisma.permission.upsert({
        where: { code },
        update: { module, action, description: `${action} access for ${module}` },
        create: { code, module, action, description: `${action} access for ${module}` },
      });
    }
  }
  const allPermissions = await prisma.permission.findMany();
  const byCode = new Map(allPermissions.map((p) => [p.code, p]));
  for (const roleDef of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleDef.code } });
    const grant = ROLE_PERMISSION_CODES[roleDef.code];
    let permissions = allPermissions;
    if (grant === 'ALL') {
      if (roleDef.code === 'HR_ADMIN') permissions = allPermissions.filter((p) => p.code !== 'roles:manage');
    } else {
      permissions = grant.map((c) => byCode.get(c)).filter((p): p is (typeof allPermissions)[number] => Boolean(p));
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
}
