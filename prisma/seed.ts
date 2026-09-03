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

  console.log('Seed completed successfully.');
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
