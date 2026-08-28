import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const ROLES = [
  { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full platform access' },
  { code: 'HR_ADMIN', name: 'HR Admin', description: 'Full HR administration' },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'HR operations management' },
  { code: 'RECRUITER', name: 'Recruiter', description: 'Recruitment pipeline access' },
  { code: 'MANAGER', name: 'Manager', description: 'Team management access' },
  { code: 'EMPLOYEE', name: 'Employee', description: 'Self-service employee access' },
] as const;

const ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT', 'MANAGE'] as const;

const MODULES = [
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
const ROLE_PERMISSION_CODES: Record<string, 'ALL' | string[]> = {
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
    'payroll:export',
    'recruitment:view',
    'recruitment:create',
    'recruitment:update',
    'recruitment:approve',
    'performance:view',
    'performance:create',
    'performance:update',
    'performance:approve',
    'ai:view',
    'ai:create',
    'reports:view',
    'reports:export',
    'notifications:view',
    'notifications:manage',
    'files:view',
    'files:create',
    'files:update',
    'files:delete',
    'users:view',
    'users:update',
    'settings:view',
  ],
  RECRUITER: [
    'dashboard:view',
    'employees:view',
    'recruitment:view',
    'recruitment:create',
    'recruitment:update',
    'recruitment:manage',
    'ai:view',
    'ai:create',
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

async function grantPermissions(roleId: string, permissionIds: string[]): Promise<void> {
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId, permissionId },
      },
      update: {},
      create: { roleId, permissionId },
    });
  }
}

async function seed(): Promise<void> {
  console.log('Seeding roles and permissions...');

  for (const role of ROLES) {
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
        create: {
          code,
          module,
          action,
          description: `${action} access for ${module}`,
        },
      });
    }
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionByCode = new Map(allPermissions.map((p) => [p.code, p]));

  for (const roleDef of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleDef.code } });
    const grant = ROLE_PERMISSION_CODES[roleDef.code];

    let permissions = allPermissions;
    if (grant === 'ALL') {
      if (roleDef.code === 'HR_ADMIN') {
        permissions = allPermissions.filter((p) => p.code !== 'roles:manage');
      }
    } else {
      permissions = grant
        .map((code) => permissionByCode.get(code))
        .filter((p): p is (typeof allPermissions)[number] => Boolean(p));
    }

    // Replace role permissions so re-seed corrects matrices
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await grantPermissions(
      role.id,
      permissions.map((p) => p.id),
    );
  }

  await prisma.company.upsert({
    where: { id: 'seed-company-zenith' },
    update: { name: 'Zenith Enterprises' },
    create: {
      id: 'seed-company-zenith',
      name: 'Zenith Enterprises',
      legalName: 'Zenith Enterprises Pvt Ltd',
      email: 'hr@zenith.local',
      timezone: 'Asia/Karachi',
      locale: 'en-US',
    },
  });

  const hrAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'HR_ADMIN' } });

  const { hash } = await import('bcryptjs');
  const passwordHash = await hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@zenith.local' },
    update: {
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      firstName: 'Zenith',
      lastName: 'Admin',
      companyId: 'seed-company-zenith',
    },
    create: {
      email: 'admin@zenith.local',
      passwordHash,
      firstName: 'Zenith',
      lastName: 'Admin',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      companyId: 'seed-company-zenith',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: hrAdmin.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: hrAdmin.id,
    },
  });

  console.log('Seed completed successfully.');
  console.log('Demo admin: admin@zenith.local / Password123! (local/dev only)');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
