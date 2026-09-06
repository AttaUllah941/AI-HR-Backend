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

  await prisma.companySettings.upsert({
    where: { companyId: 'seed-company-zenith' },
    update: {},
    create: {
      companyId: 'seed-company-zenith',
      emailProvider: 'console',
      emailFrom: 'noreply@zenith.local',
      storageProvider: 'local',
      system: {
        maintenanceMode: false,
        allowSelfRegistration: false,
        defaultTimezone: 'Asia/Karachi',
        defaultLocale: 'en-US',
      },
      integrations: {},
    },
  });

  const hrAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'HR_ADMIN' } });
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });

  const { hash } = await import('bcryptjs');
  const passwordHash = await hash('Password123!', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@zenith.local' },
    update: {
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      firstName: 'Zenith',
      lastName: 'SuperAdmin',
      companyId: 'seed-company-zenith',
    },
    create: {
      email: 'superadmin@zenith.local',
      passwordHash,
      firstName: 'Zenith',
      lastName: 'SuperAdmin',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      companyId: 'seed-company-zenith',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
    },
  });

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

  const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: 'EMPLOYEE' } });

  const employeeUser = await prisma.user.upsert({
    where: { email: 'employee@zenith.local' },
    update: {
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      firstName: 'Ali',
      lastName: 'Hassan',
      companyId: 'seed-company-zenith',
    },
    create: {
      email: 'employee@zenith.local',
      passwordHash,
      firstName: 'Ali',
      lastName: 'Hassan',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      companyId: 'seed-company-zenith',
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: employeeUser.id,
        roleId: employeeRole.id,
      },
    },
    update: {},
    create: {
      userId: employeeUser.id,
      roleId: employeeRole.id,
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

  const lahoreBranch = await prisma.branch.upsert({
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

  for (const cidr of ['127.0.0.1', '::1', '192.168.0.0/16']) {
    await prisma.branchAllowedIp.upsert({
      where: { branchId_cidr: { branchId: headOffice.id, cidr } },
      update: { isActive: true },
      create: { branchId: headOffice.id, cidr },
    });
  }
  for (const cidr of ['10.0.0.0/8', '127.0.0.1', '::1']) {
    await prisma.branchAllowedIp.upsert({
      where: { branchId_cidr: { branchId: lahoreBranch.id, cidr } },
      update: { isActive: true },
      create: { branchId: lahoreBranch.id, cidr },
    });
  }

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
      userId: employeeUser.id,
    },
    create: {
      companyId,
      userId: employeeUser.id,
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
      userId: admin.id,
    },
    create: {
      companyId,
      userId: admin.id,
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

  const hrEmployee = await prisma.employee.findUniqueOrThrow({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP004' } },
  });
  const ayesha = await prisma.employee.findUniqueOrThrow({
    where: { companyId_employeeCode: { companyId, employeeCode: 'EMP003' } },
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

  const generalShift = await prisma.shift.upsert({
    where: { companyId_code: { companyId, code: 'GEN' } },
    update: {
      name: 'General Shift',
      startTime: '09:00',
      endTime: '18:00',
      isDefault: true,
      isActive: true,
    },
    create: {
      companyId,
      name: 'General Shift',
      code: 'GEN',
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      graceMinutes: 15,
      isDefault: true,
    },
  });

  await prisma.shift.upsert({
    where: { companyId_code: { companyId, code: 'FLEX' } },
    update: { name: 'Flexible Hours', startTime: '10:00', endTime: '19:00' },
    create: {
      companyId,
      name: 'Flexible Hours',
      code: 'FLEX',
      startTime: '10:00',
      endTime: '19:00',
      breakMinutes: 60,
      graceMinutes: 30,
    },
  });

  const holidayDate = new Date(Date.UTC(new Date().getUTCFullYear(), 7, 14));
  await prisma.holiday.upsert({
    where: { companyId_date: { companyId, date: holidayDate } },
    update: { name: 'Independence Day' },
    create: {
      companyId,
      name: 'Independence Day',
      date: holidayDate,
      description: 'Pakistan Independence Day',
    },
  });

  const today = new Date();
  const dayUtc = (offset: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    return d;
  };

  const seedAttendance = async (
    employeeId: string,
    day: Date,
    status: 'PRESENT' | 'LATE' | 'ABSENT' | 'REMOTE',
    checkInHour: number | null,
    checkOutHour: number | null,
    lateMinutes = 0,
  ) => {
    const existing = await prisma.attendanceRecord.findFirst({
      where: { companyId, employeeId, date: day },
    });
    if (existing) return;
    const checkInAt =
      checkInHour === null
        ? null
        : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), checkInHour, lateMinutes, 0));
    const checkOutAt =
      checkOutHour === null
        ? null
        : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), checkOutHour, 0, 0));
    const workMinutes =
      checkInAt && checkOutAt
        ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000) - 60)
        : 0;
    await prisma.attendanceRecord.create({
      data: {
        companyId,
        employeeId,
        date: day,
        shiftId: generalShift.id,
        checkInAt,
        checkOutAt,
        status,
        workMinutes,
        overtimeMinutes: workMinutes > 480 ? workMinutes - 480 : 0,
        lateMinutes,
        source: 'SYSTEM',
      },
    });
  };

  await seedAttendance(manager.id, dayUtc(0), 'PRESENT', 9, 18);
  await seedAttendance(engineer.id, dayUtc(0), 'LATE', 9, 18, 25);
  await seedAttendance(ayesha.id, dayUtc(0), 'REMOTE', 10, 18);
  await seedAttendance(hrEmployee.id, dayUtc(1), 'PRESENT', 9, 18);
  await seedAttendance(engineer.id, dayUtc(1), 'PRESENT', 9, 18);
  await seedAttendance(ayesha.id, dayUtc(1), 'ABSENT', null, null);

  const overtimeExists = await prisma.overtimeRequest.findFirst({
    where: { companyId, employeeId: engineer.id, status: 'PENDING' },
  });
  if (!overtimeExists) {
    await prisma.overtimeRequest.create({
      data: {
        companyId,
        employeeId: engineer.id,
        date: dayUtc(0),
        minutes: 90,
        reason: 'Release hotfix support',
        status: 'PENDING',
      },
    });
  }

  // —— Phase 7 Leave ——
  await prisma.leavePolicy.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      allowNegativeBalance: false,
      countWeekends: false,
      countHolidays: false,
      minNoticeDays: 0,
    },
  });

  const annualLeave = await prisma.leaveType.upsert({
    where: { companyId_code: { companyId, code: 'ANNUAL' } },
    update: { name: 'Annual Leave', isActive: true },
    create: {
      companyId,
      name: 'Annual Leave',
      code: 'ANNUAL',
      description: 'Paid annual vacation leave',
      color: '#3b82f6',
      isPaid: true,
      requiresApproval: true,
      allowHalfDay: true,
      maxDaysPerYear: 20,
      carryForwardDays: 5,
    },
  });

  const sickLeave = await prisma.leaveType.upsert({
    where: { companyId_code: { companyId, code: 'SICK' } },
    update: { name: 'Sick Leave', isActive: true },
    create: {
      companyId,
      name: 'Sick Leave',
      code: 'SICK',
      description: 'Medical / sick leave',
      color: '#ef4444',
      isPaid: true,
      requiresApproval: true,
      allowHalfDay: true,
      maxDaysPerYear: 10,
      carryForwardDays: 0,
    },
  });

  const casualLeave = await prisma.leaveType.upsert({
    where: { companyId_code: { companyId, code: 'CASUAL' } },
    update: { name: 'Casual Leave', isActive: true },
    create: {
      companyId,
      name: 'Casual Leave',
      code: 'CASUAL',
      description: 'Short-notice personal leave',
      color: '#22c55e',
      isPaid: true,
      requiresApproval: false,
      allowHalfDay: true,
      maxDaysPerYear: 5,
      carryForwardDays: 0,
    },
  });

  const leaveYear = new Date().getUTCFullYear();
  const seedBalance = async (employeeId: string, leaveTypeId: string, entitled: number) => {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year: leaveYear },
      },
      update: { entitled },
      create: {
        companyId,
        employeeId,
        leaveTypeId,
        year: leaveYear,
        entitled,
        used: 0,
        pending: 0,
        carriedForward: 0,
      },
    });
  };

  for (const emp of [manager, engineer, ayesha, hrEmployee]) {
    await seedBalance(emp.id, annualLeave.id, 20);
    await seedBalance(emp.id, sickLeave.id, 10);
    await seedBalance(emp.id, casualLeave.id, 5);
  }

  const pendingLeave = await prisma.leaveRequest.findFirst({
    where: { companyId, employeeId: engineer.id, status: 'PENDING', deletedAt: null },
  });
  if (!pendingLeave) {
    // dayUtc(n) = today − n days; start must be on or before end
    const start = dayUtc(6);
    const end = dayUtc(5);
    await prisma.leaveRequest.create({
      data: {
        companyId,
        employeeId: engineer.id,
        leaveTypeId: annualLeave.id,
        startDate: start,
        endDate: end,
        dayType: 'FULL_DAY',
        days: 2,
        reason: 'Family event',
        status: 'PENDING',
      },
    });
    await prisma.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: engineer.id,
          leaveTypeId: annualLeave.id,
          year: leaveYear,
        },
      },
      data: { pending: { increment: 2 } },
    });
  }

  // —— Phase 8 Payroll ——
  const upsertComponent = async (input: {
    code: string;
    name: string;
    kind: 'ALLOWANCE' | 'DEDUCTION' | 'BONUS' | 'TAX';
    calcType?: 'FIXED' | 'PERCENT_OF_BASIC';
    defaultValue: number;
    isTaxable?: boolean;
  }) =>
    prisma.salaryComponent.upsert({
      where: { companyId_code: { companyId, code: input.code } },
      update: {
        name: input.name,
        kind: input.kind,
        calcType: input.calcType ?? 'FIXED',
        defaultValue: input.defaultValue,
        isTaxable: input.isTaxable ?? true,
        isActive: true,
        deletedAt: null,
      },
      create: {
        companyId,
        code: input.code,
        name: input.name,
        kind: input.kind,
        calcType: input.calcType ?? 'FIXED',
        defaultValue: input.defaultValue,
        isTaxable: input.isTaxable ?? true,
        isActive: true,
      },
    });

  const housing = await upsertComponent({
    code: 'HRA',
    name: 'Housing Allowance',
    kind: 'ALLOWANCE',
    calcType: 'PERCENT_OF_BASIC',
    defaultValue: 40,
    isTaxable: true,
  });
  const transport = await upsertComponent({
    code: 'TRANSPORT',
    name: 'Transport Allowance',
    kind: 'ALLOWANCE',
    calcType: 'FIXED',
    defaultValue: 150,
    isTaxable: false,
  });
  const medical = await upsertComponent({
    code: 'MEDICAL',
    name: 'Medical Allowance',
    kind: 'ALLOWANCE',
    calcType: 'FIXED',
    defaultValue: 100,
    isTaxable: false,
  });
  const pf = await upsertComponent({
    code: 'PF',
    name: 'Provident Fund',
    kind: 'DEDUCTION',
    calcType: 'PERCENT_OF_BASIC',
    defaultValue: 5,
    isTaxable: false,
  });
  const performanceBonus = await upsertComponent({
    code: 'PERF_BONUS',
    name: 'Performance Bonus',
    kind: 'BONUS',
    calcType: 'FIXED',
    defaultValue: 0,
    isTaxable: true,
  });

  const taxYear = new Date().getUTCFullYear();
  await prisma.taxSetting.upsert({
    where: { companyId },
    update: {
      taxYear,
      standardRate: 10,
      personalAllowance: 12_000,
      notes: 'Demo flat-rate tax settings',
    },
    create: {
      companyId,
      taxYear,
      standardRate: 10,
      personalAllowance: 12_000,
      notes: 'Demo flat-rate tax settings',
    },
  });

  const seedStructure = async (
    employeeId: string,
    basicSalary: number,
    extras: { componentId: string; value: number }[],
  ) => {
    const existing = await prisma.salaryStructure.findFirst({
      where: { companyId, employeeId, deletedAt: null, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      await prisma.salaryStructureItem.deleteMany({ where: { salaryStructureId: existing.id } });
      await prisma.salaryStructure.update({
        where: { id: existing.id },
        data: {
          basicSalary,
          currency: 'USD',
          effectiveFrom: new Date(`${taxYear}-01-01T00:00:00.000Z`),
          isActive: true,
        },
      });
      if (extras.length) {
        await prisma.salaryStructureItem.createMany({
          data: extras.map((item) => ({
            salaryStructureId: existing.id,
            componentId: item.componentId,
            value: item.value,
          })),
        });
      }
      return existing;
    }
    return prisma.salaryStructure.create({
      data: {
        companyId,
        employeeId,
        basicSalary,
        currency: 'USD',
        effectiveFrom: new Date(`${taxYear}-01-01T00:00:00.000Z`),
        isActive: true,
        components: {
          create: extras.map((item) => ({
            componentId: item.componentId,
            value: item.value,
          })),
        },
      },
    });
  };

  const commonComponents = (bonus = 0) => [
    { componentId: housing.id, value: 40 },
    { componentId: transport.id, value: 150 },
    { componentId: medical.id, value: 100 },
    { componentId: pf.id, value: 5 },
    ...(bonus > 0 ? [{ componentId: performanceBonus.id, value: bonus }] : []),
  ];

  await seedStructure(manager.id, 6000, commonComponents(200));
  await seedStructure(engineer.id, 4500, commonComponents(150));
  await seedStructure(ayesha.id, 3200, commonComponents());
  await seedStructure(hrEmployee.id, 5500, commonComponents(100));

  const prevMonthDate = new Date();
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  const completedYear = prevMonthDate.getUTCFullYear();
  const completedMonth = prevMonthDate.getUTCMonth() + 1;
  const draftMonthDate = new Date();
  const draftYear = draftMonthDate.getUTCFullYear();
  const draftMonth = draftMonthDate.getUTCMonth() + 1;

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const ensureCompletedRun = async () => {
    let run = await prisma.payrollRun.findFirst({
      where: {
        companyId,
        year: completedYear,
        month: completedMonth,
        deletedAt: null,
      },
    });
    if (!run) {
      run = await prisma.payrollRun.create({
        data: {
          companyId,
          year: completedYear,
          month: completedMonth,
          title: `Payroll ${completedYear}-${String(completedMonth).padStart(2, '0')}`,
          status: 'DRAFT',
          notes: 'Seeded completed payroll run',
        },
      });
    }

    const entryCount = await prisma.payrollEntry.count({ where: { payrollRunId: run.id } });
    if (entryCount > 0) {
      if (run.status === 'DRAFT') {
        await prisma.payrollRun.update({
          where: { id: run.id },
          data: { status: 'COMPLETED', processedAt: new Date() },
        });
      }
      return;
    }

    const structures = await prisma.salaryStructure.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      include: { components: { include: { component: true } } },
    });
    if (!structures.length) return;

    const tax = await prisma.taxSetting.findUnique({ where: { companyId } });
    const rate = tax?.standardRate ?? 10;
    const allowanceMonthly = (tax?.personalAllowance ?? 12_000) / 12;

    for (const structure of structures) {
      const basic = round2(structure.basicSalary);
      let totalAllowances = 0;
      let totalBonuses = 0;
      let totalDeductions = 0;
      let totalTax = 0;
      let taxableAllowances = 0;
      let hasTaxComponent = false;
      const lines: {
        componentId: string | null;
        kind: 'ALLOWANCE' | 'DEDUCTION' | 'BONUS' | 'TAX';
        label: string;
        amount: number;
      }[] = [];

      for (const item of structure.components) {
        const c = item.component;
        if (!c.isActive || c.deletedAt) continue;
        const amount =
          c.calcType === 'PERCENT_OF_BASIC'
            ? round2((basic * item.value) / 100)
            : round2(item.value);
        if (amount === 0) continue;
        lines.push({ componentId: c.id, kind: c.kind, label: c.name, amount });
        if (c.kind === 'ALLOWANCE') {
          totalAllowances = round2(totalAllowances + amount);
          if (c.isTaxable) taxableAllowances = round2(taxableAllowances + amount);
        } else if (c.kind === 'BONUS') {
          totalBonuses = round2(totalBonuses + amount);
        } else if (c.kind === 'DEDUCTION') {
          totalDeductions = round2(totalDeductions + amount);
        } else if (c.kind === 'TAX') {
          totalTax = round2(totalTax + amount);
          hasTaxComponent = true;
        }
      }

      if (rate > 0 && !hasTaxComponent) {
        const taxable = Math.max(0, round2(basic + taxableAllowances + totalBonuses - allowanceMonthly));
        const incomeTax = round2((taxable * rate) / 100);
        if (incomeTax > 0) {
          lines.push({
            componentId: null,
            kind: 'TAX',
            label: 'Income Tax',
            amount: incomeTax,
          });
          totalTax = round2(totalTax + incomeTax);
        }
      }

      const grossPay = round2(basic + totalAllowances + totalBonuses);
      const netPay = round2(grossPay - totalDeductions - totalTax);

      const entry = await prisma.payrollEntry.create({
        data: {
          companyId,
          payrollRunId: run.id,
          employeeId: structure.employeeId,
          basicSalary: basic,
          totalAllowances,
          totalBonuses,
          totalDeductions,
          totalTax,
          grossPay,
          netPay,
          lines: { create: lines },
        },
      });

      await prisma.payslip.create({
        data: {
          companyId,
          employeeId: structure.employeeId,
          payrollEntryId: entry.id,
          year: completedYear,
          month: completedMonth,
          basicSalary: basic,
          totalAllowances,
          totalBonuses,
          totalDeductions,
          totalTax,
          grossPay,
          netPay,
          currency: structure.currency,
          status: 'GENERATED',
        },
      });
    }

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
  };

  await ensureCompletedRun();

  const draftExists = await prisma.payrollRun.findFirst({
    where: {
      companyId,
      year: draftYear,
      month: draftMonth,
      deletedAt: null,
    },
  });
  if (!draftExists && !(draftYear === completedYear && draftMonth === completedMonth)) {
    await prisma.payrollRun.create({
      data: {
        companyId,
        year: draftYear,
        month: draftMonth,
        title: `Payroll ${draftYear}-${String(draftMonth).padStart(2, '0')}`,
        status: 'DRAFT',
        notes: 'Seeded draft payroll run',
      },
    });
  }

  // —— Phase 9 Recruitment ——
  const openJob = await prisma.jobOpening.upsert({
    where: { companyId_code: { companyId, code: 'ENG-SSE-01' } },
    update: {
      title: 'Senior Software Engineer',
      description: 'Build and scale Zenith HR platform services.',
      requirements: '5+ years TypeScript/Node, PostgreSQL, REST APIs.',
      employmentType: 'FULL_TIME',
      location: 'Karachi — Hybrid',
      openings: 2,
      status: 'OPEN',
      departmentId: engDept.id,
      designationId: sseDesignation.id,
      branchId: headOffice.id,
      hiringManagerId: manager.id,
      salaryMin: 4500,
      salaryMax: 6500,
      currency: 'USD',
      publishedAt: new Date(),
      closedAt: null,
      deletedAt: null,
    },
    create: {
      companyId,
      title: 'Senior Software Engineer',
      code: 'ENG-SSE-01',
      description: 'Build and scale Zenith HR platform services.',
      requirements: '5+ years TypeScript/Node, PostgreSQL, REST APIs.',
      employmentType: 'FULL_TIME',
      location: 'Karachi — Hybrid',
      openings: 2,
      status: 'OPEN',
      departmentId: engDept.id,
      designationId: sseDesignation.id,
      branchId: headOffice.id,
      hiringManagerId: manager.id,
      salaryMin: 4500,
      salaryMax: 6500,
      currency: 'USD',
      publishedAt: new Date(),
    },
  });

  await prisma.jobOpening.upsert({
    where: { companyId_code: { companyId, code: 'HR-BP-01' } },
    update: {
      title: 'HR Business Partner',
      description: 'Partner with leaders on talent and employee experience.',
      requirements: '3+ years HRBP experience; strong communication.',
      employmentType: 'FULL_TIME',
      location: 'Karachi — Head Office',
      openings: 1,
      status: 'DRAFT',
      departmentId: hrDept.id,
      designationId: mgrDesignation.id,
      branchId: headOffice.id,
      hiringManagerId: hrEmployee.id,
      salaryMin: 3500,
      salaryMax: 5000,
      currency: 'USD',
      publishedAt: null,
      closedAt: null,
      deletedAt: null,
    },
    create: {
      companyId,
      title: 'HR Business Partner',
      code: 'HR-BP-01',
      description: 'Partner with leaders on talent and employee experience.',
      requirements: '3+ years HRBP experience; strong communication.',
      employmentType: 'FULL_TIME',
      location: 'Karachi — Head Office',
      openings: 1,
      status: 'DRAFT',
      departmentId: hrDept.id,
      designationId: mgrDesignation.id,
      branchId: headOffice.id,
      hiringManagerId: hrEmployee.id,
      salaryMin: 3500,
      salaryMax: 5000,
      currency: 'USD',
    },
  });

  const upsertCandidate = async (input: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    source: string;
    currentTitle: string;
    currentCompany: string;
    yearsExperience: number;
    resumeFileName: string;
    screeningScore?: number;
    screeningNotes?: string;
  }) =>
    prisma.candidate.upsert({
      where: { companyId_email: { companyId, email: input.email } },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        source: input.source,
        currentTitle: input.currentTitle,
        currentCompany: input.currentCompany,
        yearsExperience: input.yearsExperience,
        resumeUrl: `https://files.zenith.local/resumes/${input.resumeFileName}`,
        resumeFileName: input.resumeFileName,
        resumeMimeType: 'application/pdf',
        screeningScore: input.screeningScore ?? null,
        screeningNotes: input.screeningNotes ?? null,
        deletedAt: null,
      },
      create: {
        companyId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        source: input.source,
        currentTitle: input.currentTitle,
        currentCompany: input.currentCompany,
        yearsExperience: input.yearsExperience,
        resumeUrl: `https://files.zenith.local/resumes/${input.resumeFileName}`,
        resumeFileName: input.resumeFileName,
        resumeMimeType: 'application/pdf',
        screeningScore: input.screeningScore ?? null,
        screeningNotes: input.screeningNotes ?? null,
      },
    });

  const candOmar = await upsertCandidate({
    email: 'omar.rizvi@example.com',
    firstName: 'Omar',
    lastName: 'Rizvi',
    phone: '+92-300-5550001',
    source: 'LinkedIn',
    currentTitle: 'Software Engineer',
    currentCompany: 'NovaTech',
    yearsExperience: 6,
    resumeFileName: 'omar-rizvi-resume.pdf',
    screeningScore: 82,
    screeningNotes: 'Strong backend focus; good culture fit signal.',
  });
  const candHina = await upsertCandidate({
    email: 'hina.ahmed@example.com',
    firstName: 'Hina',
    lastName: 'Ahmed',
    phone: '+92-300-5550002',
    source: 'Referral',
    currentTitle: 'Senior Frontend Engineer',
    currentCompany: 'Pixel Labs',
    yearsExperience: 7,
    resumeFileName: 'hina-ahmed-resume.pdf',
    screeningScore: 88,
    screeningNotes: 'Excellent TypeScript/Angular experience.',
  });
  const candBilal = await upsertCandidate({
    email: 'bilal.sheikh@example.com',
    firstName: 'Bilal',
    lastName: 'Sheikh',
    phone: '+92-300-5550003',
    source: 'Careers page',
    currentTitle: 'Full Stack Developer',
    currentCompany: 'CloudBridge',
    yearsExperience: 4,
    resumeFileName: 'bilal-sheikh-resume.pdf',
    screeningScore: 74,
  });

  const ensureApplication = async (input: {
    candidateId: string;
    status: 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
    coverLetter?: string;
    rejectionReason?: string;
  }) => {
    const existing = await prisma.jobApplication.findFirst({
      where: {
        companyId,
        jobOpeningId: openJob.id,
        candidateId: input.candidateId,
        deletedAt: null,
      },
    });
    if (existing) {
      return prisma.jobApplication.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          coverLetter: input.coverLetter ?? existing.coverLetter,
          rejectionReason: input.rejectionReason ?? null,
          stageChangedAt: new Date(),
        },
      });
    }
    return prisma.jobApplication.create({
      data: {
        companyId,
        jobOpeningId: openJob.id,
        candidateId: input.candidateId,
        status: input.status,
        coverLetter: input.coverLetter ?? null,
        rejectionReason: input.rejectionReason ?? null,
      },
    });
  };

  const appOmar = await ensureApplication({
    candidateId: candOmar.id,
    status: 'INTERVIEW',
    coverLetter: 'Excited to contribute to Zenith HR backend services.',
  });
  const appHina = await ensureApplication({
    candidateId: candHina.id,
    status: 'OFFER',
    coverLetter: 'Looking forward to joining the product engineering team.',
  });
  await ensureApplication({
    candidateId: candBilal.id,
    status: 'SCREENING',
    coverLetter: 'Passionate about full-stack product work.',
  });

  const existingInterview = await prisma.interview.findFirst({
    where: { companyId, applicationId: appOmar.id, deletedAt: null },
  });
  if (!existingInterview) {
    await prisma.interview.create({
      data: {
        companyId,
        applicationId: appOmar.id,
        type: 'TECHNICAL',
        status: 'SCHEDULED',
        scheduledAt: new Date(Date.now() + 3 * 86_400_000),
        durationMinutes: 60,
        locationOrLink: 'https://meet.zenith.local/omar-tech',
        interviewerId: manager.id,
      },
    });
  }

  const existingHrInterview = await prisma.interview.findFirst({
    where: { companyId, applicationId: appHina.id, deletedAt: null },
  });
  if (!existingHrInterview) {
    await prisma.interview.create({
      data: {
        companyId,
        applicationId: appHina.id,
        type: 'HR',
        status: 'COMPLETED',
        scheduledAt: new Date(Date.now() - 5 * 86_400_000),
        durationMinutes: 45,
        locationOrLink: 'Head Office — Meeting Room B',
        interviewerId: hrEmployee.id,
        feedback: 'Clear communicator; aligns with team values.',
        rating: 4.5,
      },
    });
  }

  const existingOffer = await prisma.jobOffer.findFirst({
    where: { companyId, applicationId: appHina.id, deletedAt: null },
  });
  if (!existingOffer) {
    await prisma.jobOffer.create({
      data: {
        companyId,
        applicationId: appHina.id,
        status: 'SENT',
        title: 'Senior Software Engineer',
        salary: 5800,
        currency: 'USD',
        startDate: new Date(Date.now() + 30 * 86_400_000),
        expiresAt: new Date(Date.now() + 14 * 86_400_000),
        notes: 'Seeded offer awaiting candidate response',
        sentAt: new Date(),
      },
    });
  } else {
    await prisma.jobOffer.update({
      where: { id: existingOffer.id },
      data: {
        status: 'SENT',
        title: 'Senior Software Engineer',
        salary: 5800,
        currency: 'USD',
        notes: 'Seeded offer awaiting candidate response',
        sentAt: existingOffer.sentAt ?? new Date(),
        deletedAt: null,
      },
    });
  }

  // —— Phase 10 Performance ——
  const perfYear = new Date().getUTCFullYear();

  const upsertKpi = async (input: {
    code: string;
    name: string;
    description: string;
    unit: string;
    targetDefault: number;
  }) =>
    prisma.performanceKpi.upsert({
      where: { companyId_code: { companyId, code: input.code } },
      update: {
        name: input.name,
        description: input.description,
        unit: input.unit,
        targetDefault: input.targetDefault,
        isActive: true,
        deletedAt: null,
      },
      create: {
        companyId,
        code: input.code,
        name: input.name,
        description: input.description,
        unit: input.unit,
        targetDefault: input.targetDefault,
        isActive: true,
      },
    });

  const kpiProductivity = await upsertKpi({
    code: 'PRODUCTIVITY',
    name: 'Productivity',
    description: 'Story points / deliverables completed vs target.',
    unit: 'points',
    targetDefault: 40,
  });
  const kpiQuality = await upsertKpi({
    code: 'QUALITY',
    name: 'Quality',
    description: 'Defect rate and review pass quality score.',
    unit: 'score',
    targetDefault: 90,
  });
  const kpiCsat = await upsertKpi({
    code: 'CSAT',
    name: 'Customer Satisfaction',
    description: 'Internal stakeholder / customer satisfaction rating.',
    unit: '%',
    targetDefault: 85,
  });

  const ensureGoal = async (input: {
    employeeId: string;
    title: string;
    description: string;
    progress: number;
    status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    targetValue?: number;
    currentValue?: number;
    unit?: string;
  }) => {
    const existing = await prisma.performanceGoal.findFirst({
      where: {
        companyId,
        employeeId: input.employeeId,
        title: input.title,
        deletedAt: null,
      },
    });
    if (existing) {
      return prisma.performanceGoal.update({
        where: { id: existing.id },
        data: {
          description: input.description,
          progress: input.progress,
          status: input.status,
          priority: input.priority,
          targetValue: input.targetValue ?? null,
          currentValue: input.currentValue ?? 0,
          unit: input.unit ?? null,
          startDate: new Date(`${perfYear}-01-01`),
          dueDate: new Date(`${perfYear}-12-31`),
        },
      });
    }
    return prisma.performanceGoal.create({
      data: {
        companyId,
        employeeId: input.employeeId,
        title: input.title,
        description: input.description,
        progress: input.progress,
        status: input.status,
        priority: input.priority,
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? 0,
        unit: input.unit ?? null,
        startDate: new Date(`${perfYear}-01-01`),
        dueDate: new Date(`${perfYear}-12-31`),
      },
    });
  };

  await ensureGoal({
    employeeId: engineer.id,
    title: 'Ship Phase 10 performance module',
    description: 'Deliver backend + frontend performance management for Zenith HR.',
    progress: 65,
    status: 'ACTIVE',
    priority: 'HIGH',
    targetValue: 100,
    currentValue: 65,
    unit: '%',
  });
  await ensureGoal({
    employeeId: engineer.id,
    title: 'Reduce production defects',
    description: 'Keep critical production bugs under monthly threshold.',
    progress: 40,
    status: 'ACTIVE',
    priority: 'MEDIUM',
    targetValue: 5,
    currentValue: 2,
    unit: 'bugs',
  });
  await ensureGoal({
    employeeId: ayesha.id,
    title: 'Complete onboarding checklist',
    description: 'Finish probation onboarding and first project contribution.',
    progress: 80,
    status: 'ACTIVE',
    priority: 'HIGH',
    targetValue: 100,
    currentValue: 80,
    unit: '%',
  });
  await ensureGoal({
    employeeId: manager.id,
    title: 'Coach engineering team to goals',
    description: 'Run monthly 1:1s and keep team goal completion above 70%.',
    progress: 55,
    status: 'ACTIVE',
    priority: 'MEDIUM',
  });

  const upsertEmployeeKpiSeed = async (input: {
    employeeId: string;
    kpiId: string;
    year: number;
    quarter: number | null;
    targetValue: number;
    actualValue: number;
    score: number;
    notes: string;
  }) => {
    const existing = await prisma.employeeKpi.findFirst({
      where: {
        companyId,
        employeeId: input.employeeId,
        kpiId: input.kpiId,
        year: input.year,
        quarter: input.quarter,
      },
    });
    if (existing) {
      return prisma.employeeKpi.update({
        where: { id: existing.id },
        data: {
          targetValue: input.targetValue,
          actualValue: input.actualValue,
          score: input.score,
          notes: input.notes,
        },
      });
    }
    return prisma.employeeKpi.create({
      data: {
        companyId,
        employeeId: input.employeeId,
        kpiId: input.kpiId,
        year: input.year,
        quarter: input.quarter,
        targetValue: input.targetValue,
        actualValue: input.actualValue,
        score: input.score,
        notes: input.notes,
      },
    });
  };

  await upsertEmployeeKpiSeed({
    employeeId: engineer.id,
    kpiId: kpiProductivity.id,
    year: perfYear,
    quarter: 1,
    targetValue: 40,
    actualValue: 38,
    score: 95,
    notes: 'Strong delivery in Q1',
  });
  await upsertEmployeeKpiSeed({
    employeeId: engineer.id,
    kpiId: kpiQuality.id,
    year: perfYear,
    quarter: 1,
    targetValue: 90,
    actualValue: 92,
    score: 92,
    notes: 'Low defect rate',
  });
  await upsertEmployeeKpiSeed({
    employeeId: engineer.id,
    kpiId: kpiCsat.id,
    year: perfYear,
    quarter: null,
    targetValue: 85,
    actualValue: 88,
    score: 88,
    notes: 'Annual CSAT snapshot',
  });

  let reviewCycle = await prisma.reviewCycle.findFirst({
    where: {
      companyId,
      name: `${perfYear} Mid-Year Review`,
      deletedAt: null,
    },
  });
  if (reviewCycle) {
    reviewCycle = await prisma.reviewCycle.update({
      where: { id: reviewCycle.id },
      data: {
        year: perfYear,
        startDate: new Date(`${perfYear}-06-01`),
        endDate: new Date(`${perfYear}-07-15`),
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
  } else {
    reviewCycle = await prisma.reviewCycle.create({
      data: {
        companyId,
        name: `${perfYear} Mid-Year Review`,
        year: perfYear,
        startDate: new Date(`${perfYear}-06-01`),
        endDate: new Date(`${perfYear}-07-15`),
        status: 'ACTIVE',
      },
    });
  }

  const ensureReview = async (input: {
    employeeId: string;
    reviewerId: string;
    status: 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'COMPLETED';
    selfRating?: number;
    managerRating?: number;
    overallRating?: number;
    selfComments?: string;
    managerComments?: string;
  }) => {
    const existing = await prisma.performanceReview.findFirst({
      where: {
        companyId,
        cycleId: reviewCycle!.id,
        employeeId: input.employeeId,
        deletedAt: null,
      },
    });
    const data = {
      reviewerId: input.reviewerId,
      status: input.status,
      selfRating: input.selfRating ?? null,
      managerRating: input.managerRating ?? null,
      overallRating: input.overallRating ?? null,
      selfComments: input.selfComments ?? null,
      managerComments: input.managerComments ?? null,
      submittedAt:
        input.status === 'SUBMITTED' ||
        input.status === 'ACKNOWLEDGED' ||
        input.status === 'COMPLETED'
          ? new Date()
          : null,
      acknowledgedAt:
        input.status === 'ACKNOWLEDGED' || input.status === 'COMPLETED' ? new Date() : null,
    };
    if (existing) {
      return prisma.performanceReview.update({ where: { id: existing.id }, data });
    }
    return prisma.performanceReview.create({
      data: {
        companyId,
        cycleId: reviewCycle!.id,
        employeeId: input.employeeId,
        ...data,
      },
    });
  };

  const engineerReview = await ensureReview({
    employeeId: engineer.id,
    reviewerId: manager.id,
    status: 'SUBMITTED',
    selfRating: 4.2,
    managerRating: 4.5,
    overallRating: 4.4,
    selfComments: 'Delivered payroll and recruitment modules on schedule.',
    managerComments: 'Consistently strong ownership and technical depth.',
  });
  await ensureReview({
    employeeId: ayesha.id,
    reviewerId: manager.id,
    status: 'IN_PROGRESS',
    selfRating: 3.8,
    selfComments: 'Building confidence on the engineering team.',
  });

  const ensureFeedback = async (input: {
    fromEmployeeId: string;
    toEmployeeId: string;
    type: 'PEER' | 'MANAGER' | 'SELF' | 'UPWARD' | 'GENERAL';
    content: string;
    rating?: number;
    reviewId?: string;
  }) => {
    const existing = await prisma.performanceFeedback.findFirst({
      where: {
        companyId,
        fromEmployeeId: input.fromEmployeeId,
        toEmployeeId: input.toEmployeeId,
        type: input.type,
        content: input.content,
        deletedAt: null,
      },
    });
    if (existing) {
      return prisma.performanceFeedback.update({
        where: { id: existing.id },
        data: {
          rating: input.rating ?? null,
          reviewId: input.reviewId ?? null,
        },
      });
    }
    return prisma.performanceFeedback.create({
      data: {
        companyId,
        fromEmployeeId: input.fromEmployeeId,
        toEmployeeId: input.toEmployeeId,
        type: input.type,
        content: input.content,
        rating: input.rating ?? null,
        reviewId: input.reviewId ?? null,
      },
    });
  };

  await ensureFeedback({
    fromEmployeeId: manager.id,
    toEmployeeId: engineer.id,
    type: 'MANAGER',
    content: 'Excellent collaboration across payroll and recruitment deliveries.',
    rating: 4.5,
    reviewId: engineerReview.id,
  });
  await ensureFeedback({
    fromEmployeeId: ayesha.id,
    toEmployeeId: engineer.id,
    type: 'PEER',
    content: 'Always available to pair and unblock juniors.',
    rating: 4.0,
  });
  await ensureFeedback({
    fromEmployeeId: engineer.id,
    toEmployeeId: manager.id,
    type: 'UPWARD',
    content: 'Clear priorities and supportive coaching in 1:1s.',
    rating: 4.3,
  });

  const existingPromotion = await prisma.promotionRequest.findFirst({
    where: {
      companyId,
      employeeId: engineer.id,
      status: { in: ['DRAFT', 'PENDING'] },
      deletedAt: null,
    },
  });
  if (existingPromotion) {
    await prisma.promotionRequest.update({
      where: { id: existingPromotion.id },
      data: {
        proposedDesignationId: mgrDesignation.id,
        proposedTitle: 'Engineering Lead',
        reason: 'Consistent delivery leadership across Phase 8–9 and mentoring juniors.',
        status: 'PENDING',
        effectiveDate: new Date(`${perfYear}-10-01`),
        deletedAt: null,
      },
    });
  } else {
    await prisma.promotionRequest.create({
      data: {
        companyId,
        employeeId: engineer.id,
        proposedDesignationId: mgrDesignation.id,
        proposedTitle: 'Engineering Lead',
        reason: 'Consistent delivery leadership across Phase 8–9 and mentoring juniors.',
        status: 'PENDING',
        effectiveDate: new Date(`${perfYear}-10-01`),
      },
    });
  }

  // —— Phase 11 AI sample generations ——
  const existingInsights = await prisma.aiGeneration.findFirst({
    where: {
      companyId,
      feature: 'INSIGHTS',
      deletedAt: null,
      relatedEntityType: 'Company',
      relatedEntityId: companyId,
    },
  });
  if (!existingInsights) {
    await prisma.aiGeneration.create({
      data: {
        companyId,
        userId: admin.id,
        feature: 'INSIGHTS',
        status: 'SUCCESS',
        provider: 'mock',
        model: 'mock-nova-1',
        relatedEntityType: 'Company',
        relatedEntityId: companyId,
        input: { focus: 'workforce', source: 'seed' },
        output: {
          insights: [
            {
              title: 'Attendance trend',
              detail: 'Late arrivals are trending down in Operations — keep reinforcing check-in habits.',
              severity: 'info',
            },
            {
              title: 'Leave concentration',
              detail: 'Several teams have overlapping leave next week; confirm coverage plans with managers.',
              severity: 'warning',
            },
            {
              title: 'Hiring funnel',
              detail: 'Screening stage has the longest dwell time; prioritize resume screening for open roles.',
              severity: 'info',
            },
          ],
        },
      },
    });
  }

  const existingRecs = await prisma.aiGeneration.findFirst({
    where: {
      companyId,
      feature: 'RECOMMENDATIONS',
      deletedAt: null,
      relatedEntityType: 'Company',
      relatedEntityId: companyId,
    },
  });
  if (!existingRecs) {
    await prisma.aiGeneration.create({
      data: {
        companyId,
        userId: admin.id,
        feature: 'RECOMMENDATIONS',
        status: 'SUCCESS',
        provider: 'mock',
        model: 'mock-nova-1',
        relatedEntityType: 'Company',
        relatedEntityId: companyId,
        input: { limit: 3, source: 'seed' },
        output: {
          recommendations: [
            {
              area: 'Recruitment',
              action: 'Clear the screening backlog for open engineering roles this week.',
              impact: 'high',
            },
            {
              area: 'Performance',
              action: 'Close pending mid-year reviews before month end.',
              impact: 'medium',
            },
            {
              area: 'Leave',
              action: 'Remind managers to approve leave requests older than 5 days.',
              impact: 'medium',
            },
          ],
        },
      },
    });
  }

  // —— Phase 12 sample report export log ——
  const existingExport = await prisma.reportExportLog.findFirst({
    where: { companyId, reportType: 'OVERVIEW', fileName: 'zenith-overview-seed.csv' },
  });
  if (!existingExport) {
    await prisma.reportExportLog.create({
      data: {
        companyId,
        userId: admin.id,
        reportType: 'OVERVIEW',
        format: 'CSV',
        filters: { source: 'seed' },
        rowCount: 10,
        fileName: 'zenith-overview-seed.csv',
      },
    });
  }

  // —— Phase 13 notifications samples ——
  const leaveTemplate = await prisma.notificationTemplate.upsert({
    where: { companyId_code: { companyId, code: 'LEAVE_STATUS' } },
    create: {
      companyId,
      code: 'LEAVE_STATUS',
      name: 'Leave status update',
      category: 'LEAVE',
      channel: 'IN_APP',
      subject: 'Leave update for {{firstName}}',
      bodyTemplate: 'Hello {{firstName}}, {{body}}',
      isActive: true,
    },
    update: { isActive: true },
  });

  await prisma.notificationTemplate.upsert({
    where: { companyId_code: { companyId, code: 'PAYROLL_PAID' } },
    create: {
      companyId,
      code: 'PAYROLL_PAID',
      name: 'Payroll paid',
      category: 'PAYROLL',
      channel: 'EMAIL',
      subject: 'Payslip ready',
      bodyTemplate: 'Hi {{firstName}}, your payslip is ready. {{body}}',
      isActive: true,
    },
    update: { isActive: true },
  });

  const existingNotif = await prisma.notification.findFirst({
    where: {
      companyId,
      userId: admin.id,
      title: 'Welcome to Zenith notifications',
      deletedAt: null,
    },
  });
  if (!existingNotif) {
    await prisma.notification.create({
      data: {
        companyId,
        userId: admin.id,
        templateId: leaveTemplate.id,
        category: 'SYSTEM',
        channel: 'IN_APP',
        title: 'Welcome to Zenith notifications',
        body: 'In-app, email, and push channels are ready. Manage preferences anytime.',
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    await prisma.notification.create({
      data: {
        companyId,
        userId: admin.id,
        category: 'LEAVE',
        channel: 'IN_APP',
        title: 'Leave request pending',
        body: 'A leave request is waiting for approval in your queue.',
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    if (employeeUser?.id) {
      await prisma.notification.create({
        data: {
          companyId,
          userId: employeeUser.id,
          category: 'PAYROLL',
          channel: 'IN_APP',
          title: 'Payslip available',
          body: 'Your latest payslip is ready to view.',
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    }
  }

  console.log('Seed completed successfully.');
  console.log('Demo super admin: superadmin@zenith.local / Password123! (local/dev only)');
  console.log('Demo admin: admin@zenith.local / Password123! (local/dev only)');
  console.log('Demo employee: employee@zenith.local / Password123! (local/dev only)');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
