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

  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  const allPermissions = await prisma.permission.findMany();

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdmin.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: superAdmin.id,
        permissionId: permission.id,
      },
    });
  }

  await prisma.company.upsert({
    where: { id: 'seed-company-zenith' },
    update: {
      name: 'Zenith Enterprises',
      legalName: 'Zenith Enterprises Pvt Ltd',
      email: 'hr@zenith.local',
      phone: '+92-21-111-936-484',
      website: 'https://zenith.local',
      addressLine1: '12th Floor, Harbour Front',
      city: 'Karachi',
      state: 'Sindh',
      country: 'Pakistan',
      postalCode: '75600',
      timezone: 'Asia/Karachi',
      locale: 'en-US',
    },
    create: {
      id: 'seed-company-zenith',
      name: 'Zenith Enterprises',
      legalName: 'Zenith Enterprises Pvt Ltd',
      email: 'hr@zenith.local',
      phone: '+92-21-111-936-484',
      website: 'https://zenith.local',
      addressLine1: '12th Floor, Harbour Front',
      city: 'Karachi',
      state: 'Sindh',
      country: 'Pakistan',
      postalCode: '75600',
      timezone: 'Asia/Karachi',
      locale: 'en-US',
    },
  });

  const seedDepartments = [
    { id: 'seed-dept-engineering', name: 'Engineering', code: 'ENG', description: 'Product engineering' },
    { id: 'seed-dept-sales', name: 'Sales', code: 'SAL', description: 'Revenue and accounts' },
    { id: 'seed-dept-marketing', name: 'Marketing', code: 'MKT', description: 'Brand and growth' },
    { id: 'seed-dept-ops', name: 'Ops', code: 'OPS', description: 'Operations' },
    { id: 'seed-dept-support', name: 'Support', code: 'SUP', description: 'Customer support' },
    { id: 'seed-dept-design', name: 'Design', code: 'DES', description: 'Product design' },
    { id: 'seed-dept-hr', name: 'HR', code: 'HR', description: 'People operations' },
    { id: 'seed-dept-finance', name: 'Finance', code: 'FIN', description: 'Finance and accounting' },
  ] as const;

  for (const department of seedDepartments) {
    await prisma.department.upsert({
      where: { id: department.id },
      update: {
        name: department.name,
        code: department.code,
        description: department.description,
        companyId: 'seed-company-zenith',
        deletedAt: null,
        isActive: true,
      },
      create: {
        id: department.id,
        companyId: 'seed-company-zenith',
        name: department.name,
        code: department.code,
        description: department.description,
      },
    });
  }

  await prisma.location.upsert({
    where: { id: 'seed-loc-hq' },
    update: {
      name: 'Karachi HQ',
      code: 'KHI-HQ',
      addressLine1: '12th Floor, Harbour Front',
      city: 'Karachi',
      state: 'Sindh',
      country: 'Pakistan',
      postalCode: '75600',
      timezone: 'Asia/Karachi',
      isHeadquarters: true,
      companyId: 'seed-company-zenith',
      deletedAt: null,
      isActive: true,
    },
    create: {
      id: 'seed-loc-hq',
      companyId: 'seed-company-zenith',
      name: 'Karachi HQ',
      code: 'KHI-HQ',
      addressLine1: '12th Floor, Harbour Front',
      city: 'Karachi',
      state: 'Sindh',
      country: 'Pakistan',
      postalCode: '75600',
      timezone: 'Asia/Karachi',
      isHeadquarters: true,
    },
  });

  await prisma.location.upsert({
    where: { id: 'seed-loc-remote' },
    update: {
      name: 'Remote — APAC',
      code: 'REMOTE-APAC',
      city: 'Distributed',
      country: 'Multiple',
      timezone: 'Asia/Karachi',
      isHeadquarters: false,
      companyId: 'seed-company-zenith',
      deletedAt: null,
      isActive: true,
    },
    create: {
      id: 'seed-loc-remote',
      companyId: 'seed-company-zenith',
      name: 'Remote — APAC',
      code: 'REMOTE-APAC',
      city: 'Distributed',
      country: 'Multiple',
      timezone: 'Asia/Karachi',
      isHeadquarters: false,
    },
  });

  // Grant HR_ADMIN all permissions except roles:manage (super-admin only distinction later)
  const hrAdmin = await prisma.role.findUniqueOrThrow({ where: { code: 'HR_ADMIN' } });
  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: hrAdmin.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: hrAdmin.id,
        permissionId: permission.id,
      },
    });
  }

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

  const managers = [
    {
      id: 'seed-emp-ravi',
      firstName: 'Ravi',
      lastName: 'Kumar',
      email: 'ravi.kumar@zenith.local',
      position: 'Engineering Manager',
      departmentId: 'seed-dept-engineering',
      status: 'ACTIVE' as const,
      hireDate: new Date('2018-04-01'),
    },
    {
      id: 'seed-emp-elena',
      firstName: 'Elena',
      lastName: 'Diaz',
      email: 'elena.diaz@zenith.local',
      position: 'Design Lead',
      departmentId: 'seed-dept-design',
      status: 'ACTIVE' as const,
      hireDate: new Date('2019-06-15'),
    },
    {
      id: 'seed-emp-james',
      firstName: 'James',
      lastName: 'Walsh',
      email: 'james.walsh@zenith.local',
      position: 'Marketing Director',
      departmentId: 'seed-dept-marketing',
      status: 'ACTIVE' as const,
      hireDate: new Date('2017-11-20'),
    },
    {
      id: 'seed-emp-sarah',
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@zenith.local',
      position: 'HR Manager',
      departmentId: 'seed-dept-hr',
      status: 'ACTIVE' as const,
      hireDate: new Date('2016-02-01'),
    },
  ];

  for (const manager of managers) {
    await prisma.employee.upsert({
      where: { id: manager.id },
      update: {
        ...manager,
        companyId: 'seed-company-zenith',
        locationId: 'seed-loc-hq',
        deletedAt: null,
      },
      create: {
        ...manager,
        companyId: 'seed-company-zenith',
        locationId: 'seed-loc-hq',
      },
    });
  }

  const seedEmployees = [
    {
      id: 'seed-emp-aisha',
      firstName: 'Aisha',
      lastName: 'Patel',
      email: 'aisha.patel@zenith.local',
      position: 'Senior Engineer',
      departmentId: 'seed-dept-engineering',
      managerId: 'seed-emp-ravi',
      status: 'ACTIVE' as const,
      hireDate: new Date('2022-03-12'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-marcus',
      firstName: 'Marcus',
      lastName: 'Chen',
      email: 'marcus.chen@zenith.local',
      position: 'Product Designer',
      departmentId: 'seed-dept-design',
      managerId: 'seed-emp-elena',
      status: 'REMOTE' as const,
      hireDate: new Date('2023-07-08'),
      locationId: 'seed-loc-remote',
    },
    {
      id: 'seed-emp-priya',
      firstName: 'Priya',
      lastName: 'Nair',
      email: 'priya.nair@zenith.local',
      position: 'Growth Lead',
      departmentId: 'seed-dept-marketing',
      managerId: 'seed-emp-james',
      status: 'ACTIVE' as const,
      hireDate: new Date('2021-01-04'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-david',
      firstName: 'David',
      lastName: 'Okafor',
      email: 'david.okafor@zenith.local',
      position: 'AE — Enterprise',
      departmentId: 'seed-dept-sales',
      status: 'ACTIVE' as const,
      hireDate: new Date('2022-09-22'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-emma',
      firstName: 'Emma',
      lastName: 'Larsson',
      email: 'emma.larsson@zenith.local',
      position: 'People Partner',
      departmentId: 'seed-dept-hr',
      managerId: 'seed-emp-sarah',
      status: 'ON_LEAVE' as const,
      hireDate: new Date('2020-02-15'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-kenji',
      firstName: 'Kenji',
      lastName: 'Tanaka',
      email: 'kenji.tanaka@zenith.local',
      position: 'Staff Engineer',
      departmentId: 'seed-dept-engineering',
      managerId: 'seed-emp-ravi',
      status: 'ACTIVE' as const,
      hireDate: new Date('2019-10-30'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-sofia',
      firstName: 'Sofia',
      lastName: 'Rossi',
      email: 'sofia.rossi@zenith.local',
      position: 'Ops Manager',
      departmentId: 'seed-dept-ops',
      status: 'ACTIVE' as const,
      hireDate: new Date('2022-05-11'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-liam',
      firstName: 'Liam',
      lastName: "O'Connor",
      email: 'liam.oconnor@zenith.local',
      position: 'Financial Analyst',
      departmentId: 'seed-dept-finance',
      status: 'REMOTE' as const,
      hireDate: new Date('2023-08-19'),
      locationId: 'seed-loc-remote',
    },
    {
      id: 'seed-emp-zara',
      firstName: 'Zara',
      lastName: 'Hussain',
      email: 'zara.hussain@zenith.local',
      position: 'Content Strategist',
      departmentId: 'seed-dept-marketing',
      managerId: 'seed-emp-james',
      status: 'ACTIVE' as const,
      hireDate: new Date('2021-11-03'),
      locationId: 'seed-loc-hq',
    },
    {
      id: 'seed-emp-noah',
      firstName: 'Noah',
      lastName: 'Fischer',
      email: 'noah.fischer@zenith.local',
      position: 'Support Lead',
      departmentId: 'seed-dept-support',
      status: 'ACTIVE' as const,
      hireDate: new Date('2020-06-27'),
      locationId: 'seed-loc-hq',
    },
  ];

  for (const employee of seedEmployees) {
    await prisma.employee.upsert({
      where: { id: employee.id },
      update: {
        ...employee,
        companyId: 'seed-company-zenith',
        deletedAt: null,
      },
      create: {
        ...employee,
        companyId: 'seed-company-zenith',
      },
    });
  }

  const today = new Date();
  const workDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const atHour = (hours: number, minutes: number) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes));

  const attendanceSeed = [
    {
      employeeId: 'seed-emp-aisha',
      status: 'PRESENT' as const,
      checkInAt: atHour(9, 2),
      locationLabel: 'HQ — 4th floor',
    },
    {
      employeeId: 'seed-emp-marcus',
      status: 'REMOTE' as const,
      checkInAt: atHour(9, 14),
      locationLabel: 'Remote — Berlin',
    },
    {
      employeeId: 'seed-emp-priya',
      status: 'PRESENT' as const,
      checkInAt: atHour(8, 47),
      locationLabel: 'HQ — 2nd floor',
    },
    {
      employeeId: 'seed-emp-david',
      status: 'LATE' as const,
      checkInAt: atHour(9, 31),
      locationLabel: 'Client site',
    },
    {
      employeeId: 'seed-emp-kenji',
      status: 'PRESENT' as const,
      checkInAt: atHour(8, 12),
      locationLabel: 'HQ — 4th floor',
    },
    {
      employeeId: 'seed-emp-emma',
      status: 'ON_LEAVE' as const,
      checkInAt: null as Date | null,
      locationLabel: null as string | null,
    },
    {
      employeeId: 'seed-emp-liam',
      status: 'ABSENT' as const,
      checkInAt: null as Date | null,
      locationLabel: null as string | null,
    },
  ];

  for (const row of attendanceSeed) {
    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId: row.employeeId,
          workDate,
        },
      },
      update: {
        companyId: 'seed-company-zenith',
        status: row.status,
        checkInAt: row.checkInAt,
        locationLabel: row.locationLabel,
        deletedAt: null,
      },
      create: {
        companyId: 'seed-company-zenith',
        employeeId: row.employeeId,
        workDate,
        status: row.status,
        checkInAt: row.checkInAt,
        locationLabel: row.locationLabel,
      },
    });
  }

  // Mark a few earlier days in the current month for calendar density
  for (let day = 1; day < today.getUTCDate(); day += 2) {
    const calendarDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day));
    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId: 'seed-emp-aisha',
          workDate: calendarDate,
        },
      },
      update: {
        status: 'PRESENT',
        checkInAt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day, 9, 0)),
        locationLabel: 'HQ — 4th floor',
        deletedAt: null,
      },
      create: {
        companyId: 'seed-company-zenith',
        employeeId: 'seed-emp-aisha',
        workDate: calendarDate,
        status: 'PRESENT',
        checkInAt: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day, 9, 0)),
        locationLabel: 'HQ — 4th floor',
      },
    });
  }

  const leaveYear = today.getUTCFullYear();
  const leavePolicies = [
    { leaveType: 'ANNUAL' as const, allottedDays: 24, usedDays: 6 },
    { leaveType: 'SICK' as const, allottedDays: 10, usedDays: 1 },
    { leaveType: 'PERSONAL' as const, allottedDays: 5, usedDays: 1 },
  ];

  for (const policy of leavePolicies) {
    await prisma.leavePolicy.upsert({
      where: {
        companyId_leaveType_year: {
          companyId: 'seed-company-zenith',
          leaveType: policy.leaveType,
          year: leaveYear,
        },
      },
      update: {
        allottedDays: policy.allottedDays,
        usedDays: policy.usedDays,
        deletedAt: null,
      },
      create: {
        companyId: 'seed-company-zenith',
        leaveType: policy.leaveType,
        allottedDays: policy.allottedDays,
        usedDays: policy.usedDays,
        year: leaveYear,
      },
    });
  }

  const pendingLeaves = [
    {
      id: 'seed-leave-emma',
      employeeId: 'seed-emp-emma',
      leaveType: 'ANNUAL' as const,
      startDate: new Date(Date.UTC(leaveYear, 10, 18)),
      endDate: new Date(Date.UTC(leaveYear, 10, 25)),
      dayCount: 6,
      reason: 'Family travel',
    },
    {
      id: 'seed-leave-kenji',
      employeeId: 'seed-emp-kenji',
      leaveType: 'SICK' as const,
      startDate: new Date(Date.UTC(leaveYear, 10, 16)),
      endDate: new Date(Date.UTC(leaveYear, 10, 17)),
      dayCount: 2,
      reason: 'Recovery',
    },
    {
      id: 'seed-leave-zara',
      employeeId: 'seed-emp-zara',
      leaveType: 'PERSONAL' as const,
      startDate: new Date(Date.UTC(leaveYear, 10, 22)),
      endDate: new Date(Date.UTC(leaveYear, 10, 22)),
      dayCount: 1,
      reason: 'Personal appointment',
    },
    {
      id: 'seed-leave-noah',
      employeeId: 'seed-emp-noah',
      leaveType: 'ANNUAL' as const,
      startDate: new Date(Date.UTC(leaveYear, 11, 20)),
      endDate: new Date(Date.UTC(leaveYear, 11, 31)),
      dayCount: 9,
      reason: 'Year-end vacation',
    },
  ];

  for (const row of pendingLeaves) {
    await prisma.leaveRequest.upsert({
      where: { id: row.id },
      update: {
        companyId: 'seed-company-zenith',
        employeeId: row.employeeId,
        leaveType: row.leaveType,
        startDate: row.startDate,
        endDate: row.endDate,
        dayCount: row.dayCount,
        reason: row.reason,
        status: 'PENDING',
        deletedAt: null,
      },
      create: {
        id: row.id,
        companyId: 'seed-company-zenith',
        employeeId: row.employeeId,
        leaveType: row.leaveType,
        startDate: row.startDate,
        endDate: row.endDate,
        dayCount: row.dayCount,
        reason: row.reason,
        status: 'PENDING',
      },
    });
  }

  // Extra pending rows so KPI pending count approaches Lovable demo density
  for (let i = 1; i <= 5; i += 1) {
    const id = `seed-leave-extra-${i}`;
    const start = new Date(Date.UTC(leaveYear, 11, i));
    await prisma.leaveRequest.upsert({
      where: { id },
      update: {
        status: 'PENDING',
        deletedAt: null,
        dayCount: 1,
        startDate: start,
        endDate: start,
      },
      create: {
        id,
        companyId: 'seed-company-zenith',
        employeeId: i % 2 === 0 ? 'seed-emp-sofia' : 'seed-emp-david',
        leaveType: i % 2 === 0 ? 'PERSONAL' : 'ANNUAL',
        startDate: start,
        endDate: start,
        dayCount: 1,
        reason: 'Scheduled time off',
        status: 'PENDING',
      },
    });
  }

  const holidays = [
    {
      id: 'seed-holiday-thanksgiving',
      name: 'Thanksgiving',
      holidayDate: new Date(Date.UTC(leaveYear, 10, 28)),
      regionLabel: 'US',
    },
    {
      id: 'seed-holiday-christmas',
      name: 'Christmas Day',
      holidayDate: new Date(Date.UTC(leaveYear, 11, 25)),
      regionLabel: 'Global',
    },
    {
      id: 'seed-holiday-newyear',
      name: "New Year's Day",
      holidayDate: new Date(Date.UTC(leaveYear + 1, 0, 1)),
      regionLabel: 'Global',
    },
    {
      id: 'seed-holiday-republic',
      name: 'Republic Day',
      holidayDate: new Date(Date.UTC(leaveYear + 1, 0, 26)),
      regionLabel: 'IN',
    },
  ];

  for (const holiday of holidays) {
    await prisma.companyHoliday.upsert({
      where: { id: holiday.id },
      update: {
        companyId: 'seed-company-zenith',
        name: holiday.name,
        holidayDate: holiday.holidayDate,
        regionLabel: holiday.regionLabel,
        deletedAt: null,
      },
      create: {
        id: holiday.id,
        companyId: 'seed-company-zenith',
        name: holiday.name,
        holidayDate: holiday.holidayDate,
        regionLabel: holiday.regionLabel,
      },
    });
  }

  const payrollYear = today.getUTCFullYear();
  const payrollMonth = today.getUTCMonth() + 1;
  const payrollRun = await prisma.payrollRun.upsert({
    where: {
      companyId_year_month: {
        companyId: 'seed-company-zenith',
        year: payrollYear,
        month: payrollMonth,
      },
    },
    update: {
      status: 'READY',
      currency: 'USD',
      deletedAt: null,
    },
    create: {
      id: 'seed-payroll-run-current',
      companyId: 'seed-company-zenith',
      year: payrollYear,
      month: payrollMonth,
      status: 'READY',
      currency: 'USD',
    },
  });

  const payrollEntries = [
    { employeeId: 'seed-emp-aisha', baseSalary: 9200, bonus: 1500, deductions: 620 },
    { employeeId: 'seed-emp-marcus', baseSalary: 7100, bonus: 800, deductions: 480 },
    { employeeId: 'seed-emp-priya', baseSalary: 8400, bonus: 2200, deductions: 590 },
    { employeeId: 'seed-emp-david', baseSalary: 6800, bonus: 3600, deductions: 510 },
    { employeeId: 'seed-emp-kenji', baseSalary: 11400, bonus: 1800, deductions: 780 },
    { employeeId: 'seed-emp-sofia', baseSalary: 7900, bonus: 900, deductions: 520 },
    { employeeId: 'seed-emp-emma', baseSalary: 7800, bonus: 400, deductions: 450 },
    { employeeId: 'seed-emp-liam', baseSalary: 7200, bonus: 600, deductions: 410 },
    { employeeId: 'seed-emp-zara', baseSalary: 6900, bonus: 1100, deductions: 430 },
    { employeeId: 'seed-emp-noah', baseSalary: 7600, bonus: 950, deductions: 470 },
  ];

  for (const row of payrollEntries) {
    const netPay = row.baseSalary + row.bonus - row.deductions;
    await prisma.payrollEntry.upsert({
      where: {
        payrollRunId_employeeId: {
          payrollRunId: payrollRun.id,
          employeeId: row.employeeId,
        },
      },
      update: {
        companyId: 'seed-company-zenith',
        baseSalary: row.baseSalary,
        bonus: row.bonus,
        deductions: row.deductions,
        netPay,
        deletedAt: null,
      },
      create: {
        companyId: 'seed-company-zenith',
        payrollRunId: payrollRun.id,
        employeeId: row.employeeId,
        baseSalary: row.baseSalary,
        bonus: row.bonus,
        deductions: row.deductions,
        netPay,
      },
    });
  }

  const payrollAgg = await prisma.payrollEntry.aggregate({
    where: { payrollRunId: payrollRun.id, deletedAt: null },
    _count: { _all: true },
    _sum: {
      baseSalary: true,
      bonus: true,
      deductions: true,
      netPay: true,
    },
  });

  await prisma.payrollRun.update({
    where: { id: payrollRun.id },
    data: {
      employeeCount: payrollAgg._count._all,
      totalBase: payrollAgg._sum.baseSalary ?? 0,
      totalBonus: payrollAgg._sum.bonus ?? 0,
      totalDeductions: payrollAgg._sum.deductions ?? 0,
      totalNet: payrollAgg._sum.netPay ?? 0,
    },
  });

  const jobSeeds = [
    {
      id: 'seed-job-senior-eng',
      title: 'Senior Engineer',
      departmentId: 'seed-dept-engineering',
      locationLabel: 'Bangalore',
      openingsCount: 3,
    },
    {
      id: 'seed-job-product-designer',
      title: 'Product Designer',
      departmentId: 'seed-dept-design',
      locationLabel: 'Berlin',
      openingsCount: 2,
    },
    {
      id: 'seed-job-sales-ae',
      title: 'Sales AE',
      departmentId: 'seed-dept-sales',
      locationLabel: 'Dubai',
      openingsCount: 2,
    },
    {
      id: 'seed-job-devops',
      title: 'DevOps Lead',
      departmentId: 'seed-dept-engineering',
      locationLabel: 'São Paulo',
      openingsCount: 1,
    },
    {
      id: 'seed-job-data',
      title: 'Data Scientist',
      departmentId: 'seed-dept-engineering',
      locationLabel: 'Cairo',
      openingsCount: 1,
    },
    {
      id: 'seed-job-fullstack',
      title: 'Full-Stack Eng',
      departmentId: 'seed-dept-engineering',
      locationLabel: 'Seoul',
      openingsCount: 2,
    },
    {
      id: 'seed-job-growth',
      title: 'Growth Lead',
      departmentId: 'seed-dept-marketing',
      locationLabel: 'Milan',
      openingsCount: 1,
    },
    {
      id: 'seed-job-finance',
      title: 'Financial Analyst',
      departmentId: 'seed-dept-finance',
      locationLabel: 'Dublin',
      openingsCount: 1,
    },
    {
      id: 'seed-job-support',
      title: 'Support Lead',
      departmentId: 'seed-dept-ops',
      locationLabel: 'Munich',
      openingsCount: 1,
    },
    {
      id: 'seed-job-warsaw-eng',
      title: 'Senior Engineer',
      departmentId: 'seed-dept-engineering',
      locationLabel: 'Warsaw',
      openingsCount: 2,
    },
  ];

  for (const job of jobSeeds) {
    await prisma.jobOpening.upsert({
      where: { id: job.id },
      update: {
        companyId: 'seed-company-zenith',
        title: job.title,
        departmentId: job.departmentId,
        locationLabel: job.locationLabel,
        openingsCount: job.openingsCount,
        status: 'OPEN',
        deletedAt: null,
      },
      create: {
        id: job.id,
        companyId: 'seed-company-zenith',
        title: job.title,
        departmentId: job.departmentId,
        locationLabel: job.locationLabel,
        openingsCount: job.openingsCount,
        status: 'OPEN',
      },
    });
  }

  // Extra open roles so summary approaches Lovable "17 open roles"
  for (let i = 1; i <= 7; i += 1) {
    const id = `seed-job-extra-${i}`;
    await prisma.jobOpening.upsert({
      where: { id },
      update: { status: 'OPEN', deletedAt: null },
      create: {
        id,
        companyId: 'seed-company-zenith',
        title: `Open Role ${i}`,
        departmentId: i % 2 === 0 ? 'seed-dept-ops' : 'seed-dept-hr',
        locationLabel: i % 2 === 0 ? 'Remote' : 'HQ',
        openingsCount: 1,
        status: 'OPEN',
      },
    });
  }

  const candidateSeeds = [
    {
      id: 'seed-cand-rohan',
      jobOpeningId: 'seed-job-senior-eng',
      firstName: 'Rohan',
      lastName: 'Mehta',
      email: 'rohan.mehta@candidates.local',
      locationLabel: 'Bangalore',
      stage: 'APPLIED' as const,
      score: 82,
    },
    {
      id: 'seed-cand-julia',
      jobOpeningId: 'seed-job-product-designer',
      firstName: 'Julia',
      lastName: 'Weiss',
      email: 'julia.weiss@candidates.local',
      locationLabel: 'Berlin',
      stage: 'APPLIED' as const,
      score: 76,
    },
    {
      id: 'seed-cand-yusuf',
      jobOpeningId: 'seed-job-sales-ae',
      firstName: 'Yusuf',
      lastName: 'Ali',
      email: 'yusuf.ali@candidates.local',
      locationLabel: 'Dubai',
      stage: 'APPLIED' as const,
      score: 71,
    },
    {
      id: 'seed-cand-anna',
      jobOpeningId: 'seed-job-warsaw-eng',
      firstName: 'Anna',
      lastName: 'Kowalski',
      email: 'anna.kowalski@candidates.local',
      locationLabel: 'Warsaw',
      stage: 'SCREENING' as const,
      score: 88,
    },
    {
      id: 'seed-cand-diego',
      jobOpeningId: 'seed-job-devops',
      firstName: 'Diego',
      lastName: 'Santos',
      email: 'diego.santos@candidates.local',
      locationLabel: 'São Paulo',
      stage: 'SCREENING' as const,
      score: 84,
    },
    {
      id: 'seed-cand-fatima',
      jobOpeningId: 'seed-job-data',
      firstName: 'Fatima',
      lastName: 'Hassan',
      email: 'fatima.hassan@candidates.local',
      locationLabel: 'Cairo',
      stage: 'INTERVIEW' as const,
      score: 91,
    },
    {
      id: 'seed-cand-ethan',
      jobOpeningId: 'seed-job-fullstack',
      firstName: 'Ethan',
      lastName: 'Park',
      email: 'ethan.park@candidates.local',
      locationLabel: 'Seoul',
      stage: 'INTERVIEW' as const,
      score: 87,
    },
    {
      id: 'seed-cand-isabella',
      jobOpeningId: 'seed-job-growth',
      firstName: 'Isabella',
      lastName: 'Ricci',
      email: 'isabella.ricci@candidates.local',
      locationLabel: 'Milan',
      stage: 'OFFER' as const,
      score: 94,
    },
    {
      id: 'seed-cand-liam',
      jobOpeningId: 'seed-job-finance',
      firstName: 'Liam',
      lastName: "O'Connor",
      email: 'liam.oconnor.cand@candidates.local',
      locationLabel: 'Dublin',
      stage: 'HIRED' as const,
      score: 89,
    },
    {
      id: 'seed-cand-noah',
      jobOpeningId: 'seed-job-support',
      firstName: 'Noah',
      lastName: 'Fischer',
      email: 'noah.fischer.cand@candidates.local',
      locationLabel: 'Munich',
      stage: 'HIRED' as const,
      score: 86,
    },
  ];

  for (const candidate of candidateSeeds) {
    await prisma.candidate.upsert({
      where: { id: candidate.id },
      update: {
        companyId: 'seed-company-zenith',
        jobOpeningId: candidate.jobOpeningId,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        locationLabel: candidate.locationLabel,
        stage: candidate.stage,
        score: candidate.score,
        deletedAt: null,
      },
      create: {
        id: candidate.id,
        companyId: 'seed-company-zenith',
        jobOpeningId: candidate.jobOpeningId,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        locationLabel: candidate.locationLabel,
        stage: candidate.stage,
        score: candidate.score,
      },
    });
  }

  const perfYear = today.getUTCFullYear();
  const perfQuarter = Math.floor(today.getUTCMonth() / 3) + 1;
  const perfCycle = await prisma.performanceCycle.upsert({
    where: {
      companyId_year_quarter: {
        companyId: 'seed-company-zenith',
        year: perfYear,
        quarter: perfQuarter,
      },
    },
    update: {
      label: `Q${perfQuarter}`,
      status: 'ACTIVE',
      previousAvgScore: 4.1,
      previousGoalsOnTrackPercent: 77,
      deletedAt: null,
    },
    create: {
      id: 'seed-perf-cycle-current',
      companyId: 'seed-company-zenith',
      label: `Q${perfQuarter}`,
      year: perfYear,
      quarter: perfQuarter,
      status: 'ACTIVE',
      previousAvgScore: 4.1,
      previousGoalsOnTrackPercent: 77,
    },
  });

  const reviewSeeds = [
    {
      employeeId: 'seed-emp-kenji',
      score: 4.9,
      goalCount: 12,
      goalsCompletePercent: 96,
      promotionReady: true,
    },
    {
      employeeId: 'seed-emp-priya',
      score: 4.8,
      goalCount: 10,
      goalsCompletePercent: 92,
      promotionReady: true,
    },
    {
      employeeId: 'seed-emp-zara',
      score: 4.7,
      goalCount: 8,
      goalsCompletePercent: 88,
      promotionReady: true,
    },
    {
      employeeId: 'seed-emp-david',
      score: 4.6,
      goalCount: 11,
      goalsCompletePercent: 84,
      promotionReady: true,
    },
    {
      employeeId: 'seed-emp-aisha',
      score: 4.5,
      goalCount: 9,
      goalsCompletePercent: 80,
      promotionReady: false,
    },
    {
      employeeId: 'seed-emp-sofia',
      score: 4.2,
      goalCount: 7,
      goalsCompletePercent: 74,
      promotionReady: false,
    },
    {
      employeeId: 'seed-emp-marcus',
      score: 4.1,
      goalCount: 6,
      goalsCompletePercent: 70,
      promotionReady: true,
    },
    {
      employeeId: 'seed-emp-liam',
      score: 3.9,
      goalCount: 5,
      goalsCompletePercent: 65,
      promotionReady: false,
    },
    {
      employeeId: 'seed-emp-emma',
      score: 3.8,
      goalCount: 5,
      goalsCompletePercent: 60,
      promotionReady: false,
    },
    {
      employeeId: 'seed-emp-noah',
      score: 3.7,
      goalCount: 4,
      goalsCompletePercent: 55,
      promotionReady: false,
    },
  ];

  for (const row of reviewSeeds) {
    await prisma.performanceReview.upsert({
      where: {
        cycleId_employeeId: {
          cycleId: perfCycle.id,
          employeeId: row.employeeId,
        },
      },
      update: {
        companyId: 'seed-company-zenith',
        score: row.score,
        goalCount: row.goalCount,
        goalsCompletePercent: row.goalsCompletePercent,
        promotionReady: row.promotionReady,
        deletedAt: null,
      },
      create: {
        companyId: 'seed-company-zenith',
        cycleId: perfCycle.id,
        employeeId: row.employeeId,
        score: row.score,
        goalCount: row.goalCount,
        goalsCompletePercent: row.goalsCompletePercent,
        promotionReady: row.promotionReady,
      },
    });
  }

  // Goal mix ≈ 82% on track / completed
  const goalSeeds: Array<{
    id: string;
    employeeId: string;
    title: string;
    progressPercent: number;
    status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'COMPLETED';
  }> = [];

  let goalIndex = 0;
  for (const review of reviewSeeds) {
    for (let g = 0; g < Math.min(review.goalCount, 3); g += 1) {
      goalIndex += 1;
      const status =
        goalIndex % 12 === 0 ? 'BEHIND' : goalIndex % 7 === 0 ? 'AT_RISK' : goalIndex % 4 === 0 ? 'COMPLETED' : 'ON_TRACK';
      goalSeeds.push({
        id: `seed-goal-${goalIndex}`,
        employeeId: review.employeeId,
        title: `Goal ${g + 1} for cycle`,
        progressPercent:
          status === 'COMPLETED' ? 100 : status === 'BEHIND' ? 35 : status === 'AT_RISK' ? 55 : 78,
        status,
      });
    }
  }

  for (const goal of goalSeeds) {
    await prisma.performanceGoal.upsert({
      where: { id: goal.id },
      update: {
        companyId: 'seed-company-zenith',
        cycleId: perfCycle.id,
        employeeId: goal.employeeId,
        title: goal.title,
        progressPercent: goal.progressPercent,
        status: goal.status,
        deletedAt: null,
      },
      create: {
        id: goal.id,
        companyId: 'seed-company-zenith',
        cycleId: perfCycle.id,
        employeeId: goal.employeeId,
        title: goal.title,
        progressPercent: goal.progressPercent,
        status: goal.status,
      },
    });
  }

  const insightSeeds = [
    {
      id: 'seed-insight-1',
      sortOrder: 1,
      body: 'Promote Kenji Tanaka to Principal Engineer — 3 quarters above target.',
    },
    {
      id: 'seed-insight-2',
      sortOrder: 2,
      body: 'Schedule 360 review for Priya Nair — no reviews in 8 months.',
    },
    {
      id: 'seed-insight-3',
      sortOrder: 3,
      body: 'Marcus Chen ready for growth track — consider design lead role.',
    },
    {
      id: 'seed-insight-4',
      sortOrder: 4,
      body: '6 engineers show burnout signals — recommend workload review.',
    },
  ];

  for (const insight of insightSeeds) {
    await prisma.performanceInsight.upsert({
      where: { id: insight.id },
      update: {
        companyId: 'seed-company-zenith',
        cycleId: perfCycle.id,
        body: insight.body,
        sortOrder: insight.sortOrder,
        deletedAt: null,
      },
      create: {
        id: insight.id,
        companyId: 'seed-company-zenith',
        cycleId: perfCycle.id,
        body: insight.body,
        sortOrder: insight.sortOrder,
      },
    });
  }

  console.log('Seed completed successfully.');
  console.log('Demo admin: admin@zenith.local / Password123!');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
