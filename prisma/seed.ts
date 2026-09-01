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

  const companyId = 'seed-company-zenith';

  const headOffice = await prisma.branch.upsert({
    where: { companyId_code: { companyId, code: 'HO' } },
    update: { name: 'Head Office', city: 'Karachi', country: 'Pakistan', isHeadOffice: true },
    create: {
      companyId,
      name: 'Head Office',
      code: 'HO',
      city: 'Karachi',
      country: 'Pakistan',
      isHeadOffice: true,
    },
  });

  await prisma.branch.upsert({
    where: { companyId_code: { companyId, code: 'LHR' } },
    update: { name: 'Lahore Branch', city: 'Lahore', country: 'Pakistan' },
    create: {
      companyId,
      name: 'Lahore Branch',
      code: 'LHR',
      city: 'Lahore',
      country: 'Pakistan',
    },
  });

  const hrDept = await prisma.department.upsert({
    where: { companyId_code: { companyId, code: 'HR' } },
    update: { name: 'Human Resources', branchId: headOffice.id },
    create: {
      companyId,
      branchId: headOffice.id,
      name: 'Human Resources',
      code: 'HR',
      description: 'People operations and talent',
    },
  });

  const engDept = await prisma.department.upsert({
    where: { companyId_code: { companyId, code: 'ENG' } },
    update: { name: 'Engineering', branchId: headOffice.id },
    create: {
      companyId,
      branchId: headOffice.id,
      name: 'Engineering',
      code: 'ENG',
      description: 'Product and platform engineering',
    },
  });

  await prisma.department.upsert({
    where: { companyId_code: { companyId, code: 'ENG-PLAT' } },
    update: { name: 'Platform', parentId: engDept.id, branchId: headOffice.id },
    create: {
      companyId,
      branchId: headOffice.id,
      parentId: engDept.id,
      name: 'Platform',
      code: 'ENG-PLAT',
      description: 'Platform engineering sub-team',
    },
  });

  await prisma.team.upsert({
    where: { companyId_code: { companyId, code: 'HR-OPS' } },
    update: { name: 'HR Operations', departmentId: hrDept.id },
    create: {
      companyId,
      departmentId: hrDept.id,
      name: 'HR Operations',
      code: 'HR-OPS',
    },
  });

  await prisma.team.upsert({
    where: { companyId_code: { companyId, code: 'ENG-CORE' } },
    update: { name: 'Core Product', departmentId: engDept.id },
    create: {
      companyId,
      departmentId: engDept.id,
      name: 'Core Product',
      code: 'ENG-CORE',
    },
  });

  const designations = [
    { code: 'CEO', name: 'Chief Executive Officer', level: 1 },
    { code: 'DIR', name: 'Director', level: 2 },
    { code: 'MGR', name: 'Manager', level: 3 },
    { code: 'SSE', name: 'Senior Software Engineer', level: 4 },
    { code: 'SE', name: 'Software Engineer', level: 5 },
  ] as const;

  for (const item of designations) {
    await prisma.designation.upsert({
      where: { companyId_code: { companyId, code: item.code } },
      update: { name: item.name, level: item.level },
      create: { companyId, ...item },
    });
  }

  const mgrDesignation = await prisma.designation.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'MGR' } },
  });
  const seDesignation = await prisma.designation.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'SE' } },
  });
  const sseDesignation = await prisma.designation.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'SSE' } },
  });
  const engCoreTeam = await prisma.team.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'ENG-CORE' } },
  });
  const hrOpsTeam = await prisma.team.findUniqueOrThrow({
    where: { companyId_code: { companyId, code: 'HR-OPS' } },
  });

  const manager = await prisma.employee.upsert({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP001' } },
    update: {
      firstName: 'Sara',
      lastName: 'Khan',
      email: 'sara.khan@zenith.local',
      status: 'ACTIVE',
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      branchId: headOffice.id,
      designationId: mgrDesignation.id,
      joinDate: new Date('2020-03-15'),
    },
    create: {
      companyId,
      employeeCode: 'EMP001',
      firstName: 'Sara',
      lastName: 'Khan',
      email: 'sara.khan@zenith.local',
      phone: '+92-300-1110001',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      branchId: headOffice.id,
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      designationId: mgrDesignation.id,
      joinDate: new Date('2020-03-15'),
      workLocation: 'Karachi — Head Office',
      city: 'Karachi',
      country: 'Pakistan',
    },
  });

  const engineer = await prisma.employee.upsert({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP002' } },
    update: {
      firstName: 'Ali',
      lastName: 'Hassan',
      email: 'ali.hassan@zenith.local',
      status: 'ACTIVE',
      managerId: manager.id,
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      branchId: headOffice.id,
      designationId: sseDesignation.id,
      joinDate: new Date('2022-01-10'),
    },
    create: {
      companyId,
      employeeCode: 'EMP002',
      firstName: 'Ali',
      lastName: 'Hassan',
      email: 'ali.hassan@zenith.local',
      phone: '+92-300-1110002',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      branchId: headOffice.id,
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      designationId: sseDesignation.id,
      managerId: manager.id,
      joinDate: new Date('2022-01-10'),
      workLocation: 'Karachi — Head Office',
      city: 'Karachi',
      country: 'Pakistan',
    },
  });

  await prisma.employee.upsert({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP003' } },
    update: {
      firstName: 'Ayesha',
      lastName: 'Malik',
      email: 'ayesha.malik@zenith.local',
      status: 'PROBATION',
      managerId: manager.id,
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      branchId: headOffice.id,
      designationId: seDesignation.id,
      joinDate: new Date('2025-06-01'),
      probationEndDate: new Date('2025-12-01'),
    },
    create: {
      companyId,
      employeeCode: 'EMP003',
      firstName: 'Ayesha',
      lastName: 'Malik',
      email: 'ayesha.malik@zenith.local',
      phone: '+92-300-1110003',
      status: 'PROBATION',
      employmentType: 'FULL_TIME',
      branchId: headOffice.id,
      departmentId: engDept.id,
      teamId: engCoreTeam.id,
      designationId: seDesignation.id,
      managerId: manager.id,
      joinDate: new Date('2025-06-01'),
      probationEndDate: new Date('2025-12-01'),
      workLocation: 'Karachi — Head Office',
      city: 'Karachi',
      country: 'Pakistan',
    },
  });

  await prisma.employee.upsert({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP004' } },
    update: {
      firstName: 'Fatima',
      lastName: 'Qureshi',
      email: 'fatima.qureshi@zenith.local',
      status: 'ACTIVE',
      departmentId: hrDept.id,
      teamId: hrOpsTeam.id,
      branchId: headOffice.id,
      designationId: mgrDesignation.id,
      joinDate: new Date('2019-08-20'),
    },
    create: {
      companyId,
      employeeCode: 'EMP004',
      firstName: 'Fatima',
      lastName: 'Qureshi',
      email: 'fatima.qureshi@zenith.local',
      phone: '+92-300-1110004',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      branchId: headOffice.id,
      departmentId: hrDept.id,
      teamId: hrOpsTeam.id,
      designationId: mgrDesignation.id,
      joinDate: new Date('2019-08-20'),
      workLocation: 'Karachi — Head Office',
      city: 'Karachi',
      country: 'Pakistan',
    },
  });

  const existingContact = await prisma.employeeEmergencyContact.findFirst({
    where: { employeeId: engineer.id, name: 'Hassan Ali' },
  });
  if (!existingContact) {
    await prisma.employeeEmergencyContact.create({
      data: {
        employeeId: engineer.id,
        name: 'Hassan Ali',
        relationship: 'Brother',
        phone: '+92-300-9990001',
        isPrimary: true,
      },
    });
  }

  const existingSkill = await prisma.employeeSkill.findFirst({
    where: { employeeId: engineer.id, name: 'TypeScript' },
  });
  if (!existingSkill) {
    await prisma.employeeSkill.create({
      data: { employeeId: engineer.id, name: 'TypeScript', level: 'Expert', years: 5 },
    });
  }

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
