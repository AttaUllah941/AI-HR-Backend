/**
 * QA-only seed. ADDS data to the demo company (seed-company-zenith) and creates a
 * second tenant ("Other Corp") for tenant-isolation tests. Never deletes anything.
 * Run AFTER `prisma/seed.ts`:  npm run prisma:seed:qa
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run QA seed: NODE_ENV=production.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const COMPANY_ID = 'seed-company-zenith';
const OTHER_COMPANY_ID = 'seed-company-othercorp';
const PASSWORD = 'Password123!';
const DAY = 86_400_000;

// Deterministic RNG so reruns/other machines produce the same shape of data.
let rngState = 20260424;
const rand = (): number => {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1]![0];
};
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const utcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const isWeekend = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6;

async function batched<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

const FIRST_NAMES = [
  'Ahmed', 'Sana', 'Usman', 'Zainab', 'Hamza', 'Maryam', 'Imran', 'Nadia', 'Tariq', 'Rabia',
  'Kamran', 'Saima', 'Faisal', 'Amna', 'Danish', 'Iqra', 'Waqas', 'Hira', 'Junaid', 'Mehwish',
  'Noman', 'Sadia', 'Asad', 'Bushra', 'Rizwan', 'Komal', 'Shahid', 'Laiba', 'Adeel', 'Anam',
  'John', 'Emily', 'Michael', 'Sophia', 'David', 'Olivia', 'Daniel', 'Emma', 'Liam', 'Ava',
];
const LAST_NAMES = [
  'Khan', 'Ahmed', 'Malik', 'Sheikh', 'Siddiqui', 'Butt', 'Chaudhry', 'Raza', 'Qureshi', 'Mirza',
  'Hussain', 'Baig', 'Javed', 'Iqbal', 'Farooq', 'Anwar', 'Akhtar', 'Rehman', 'Nawaz', 'Ansari',
  'Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Davis', 'Clark', 'Lewis', 'Walker', 'Hall',
];

const EMP_STATUSES = [
  ['ACTIVE', 80],
  ['PROBATION', 7],
  ['ON_LEAVE', 3],
  ['NOTICE_PERIOD', 3],
  ['TERMINATED', 2],
  ['RESIGNED', 3],
  ['INACTIVE', 2],
] as const;

const ROLE_CODES = ['SUPER_ADMIN', 'HR_ADMIN', 'HR_MANAGER', 'RECRUITER', 'MANAGER', 'EMPLOYEE'] as const;

async function main(): Promise<void> {
  const t0 = Date.now();
  const counts: Record<string, number> = {};
  const note = (k: string, n: number): void => {
    counts[k] = (counts[k] ?? 0) + n;
    console.log(`  + ${k}: ${n}`);
  };

  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) throw new Error('Demo company not found. Run `npm run prisma:seed` first.');

  const roles = new Map<string, string>();
  for (const code of ROLE_CODES) {
    const r = await prisma.role.findUnique({ where: { code } });
    if (!r) throw new Error(`Role ${code} missing. Run base seed first.`);
    roles.set(code, r.id);
  }

  const { hash } = await import('bcryptjs');
  const passwordHash = await hash(PASSWORD, 12);

  // ---------------------------------------------------------------- org entities
  console.log('Org entities...');
  const baseDept = await prisma.department.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'HR' } } });
  const headOffice = await prisma.branch.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'HO' } } });

  const branchDefs = [
    { code: 'QA-ISB', name: 'Islamabad Branch', city: 'Islamabad' },
    { code: 'QA-FSD', name: 'Faisalabad Branch', city: 'Faisalabad' },
    { code: 'QA-DXB', name: 'Dubai Office', city: 'Dubai' },
  ];
  const branchIds: string[] = [headOffice.id];
  for (const b of branchDefs) {
    const row = await prisma.branch.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code: b.code } },
      update: {},
      create: { companyId: COMPANY_ID, code: b.code, name: b.name, city: b.city, country: b.code === 'QA-DXB' ? 'UAE' : 'Pakistan' },
    });
    branchIds.push(row.id);
  }

  const deptNames = [
    'Finance', 'Marketing', 'Sales', 'Operations', 'Customer Support', 'Legal', 'IT Support',
    'Product', 'Design', 'QA Engineering', 'Procurement', 'Administration',
  ];
  const deptIds: string[] = [baseDept.id];
  const deptByIndex: { id: string; code: string }[] = [];
  for (let i = 0; i < deptNames.length; i++) {
    const code = `QA-D${String(i + 1).padStart(2, '0')}`;
    const row = await prisma.department.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code } },
      update: {},
      create: { companyId: COMPANY_ID, code, name: deptNames[i]!, branchId: branchIds[i % branchIds.length]! },
    });
    deptIds.push(row.id);
    deptByIndex.push({ id: row.id, code });
  }

  const teamIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const dep = deptByIndex[i]!;
    const code = `QA-T${String(i + 1).padStart(2, '0')}`;
    const row = await prisma.team.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code } },
      update: {},
      create: { companyId: COMPANY_ID, code, name: `${deptNames[i]} Team`, departmentId: dep.id },
    });
    teamIds.push(row.id);
  }

  const desigDefs = [
    { code: 'QA-ANL', name: 'Analyst', level: 6 },
    { code: 'QA-SAN', name: 'Senior Analyst', level: 5 },
    { code: 'QA-EXE', name: 'Executive', level: 6 },
    { code: 'QA-LEAD', name: 'Team Lead', level: 4 },
    { code: 'QA-ASSOC', name: 'Associate', level: 7 },
  ];
  const desigIds: string[] = [];
  for (const d of desigDefs) {
    const row = await prisma.designation.upsert({
      where: { companyId_code: { companyId: COMPANY_ID, code: d.code } },
      update: {},
      create: { companyId: COMPANY_ID, ...d },
    });
    desigIds.push(row.id);
  }

  const annual = await prisma.leaveType.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'ANNUAL' } } });
  const sick = await prisma.leaveType.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'SICK' } } });
  const casual = await prisma.leaveType.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'CASUAL' } } });
  const shift = await prisma.shift.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'GEN' } } });
  const hrDeptId = baseDept.id;
  const engDept = await prisma.department.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'ENG' } } });
  const mgrDesig = await prisma.designation.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'MGR' } } });
  const seDesig = await prisma.designation.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'SE' } } });

  // ---------------------------------------------------------------- 1. QA users
  console.log('QA users with logins...');
  const userIds: Record<string, string> = {};
  const employeeIds: Record<string, string> = {};

  const upsertUserWithEmployee = async (input: {
    email: string;
    firstName: string;
    lastName: string;
    role: (typeof ROLE_CODES)[number];
    empCode: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
    verified?: boolean;
    lockedUntil?: Date | null;
    failedLoginCount?: number;
    managerId?: string | null;
    departmentId?: string;
    designationId?: string;
    companyId?: string;
    branchId?: string;
    joinDate?: Date;
  }) => {
    const cid = input.companyId ?? COMPANY_ID;
    const status = input.status ?? 'ACTIVE';
    const verified = input.verified ?? true;
    const common = {
      passwordHash,
      status,
      emailVerifiedAt: verified ? new Date() : null,
      firstName: input.firstName,
      lastName: input.lastName,
      companyId: cid,
      lockedUntil: input.lockedUntil ?? null,
      failedLoginCount: input.failedLoginCount ?? 0,
    };
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: common,
      create: { email: input.email, ...common },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roles.get(input.role)! } },
      update: {},
      create: { userId: user.id, roleId: roles.get(input.role)! },
    });
    const empData = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      status: 'ACTIVE' as const,
      userId: user.id,
      managerId: input.managerId ?? null,
      departmentId: input.departmentId ?? hrDeptId,
      branchId: input.branchId ?? headOffice.id,
      designationId: input.designationId ?? seDesig.id,
      joinDate: input.joinDate ?? new Date('2023-02-01'),
    };
    const emp = await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId: cid, employeeCode: input.empCode } },
      update: empData,
      create: {
        companyId: cid,
        employeeCode: input.empCode,
        employmentType: 'FULL_TIME',
        country: 'Pakistan',
        ...empData,
      },
    });
    userIds[input.email] = user.id;
    employeeIds[input.email] = emp.id;
    return { user, emp };
  };

  await upsertUserWithEmployee({ email: 'hrmanager@zenith.local', firstName: 'Hira', lastName: 'Manager', role: 'HR_MANAGER', empCode: 'QAU001' });
  await upsertUserWithEmployee({ email: 'recruiter@zenith.local', firstName: 'Rehan', lastName: 'Recruiter', role: 'RECRUITER', empCode: 'QAU002' });
  const mgr = await upsertUserWithEmployee({
    email: 'manager@zenith.local', firstName: 'Mansoor', lastName: 'Manager', role: 'MANAGER', empCode: 'QAU003',
    departmentId: engDept.id, designationId: mgrDesig.id,
  });
  await upsertUserWithEmployee({
    email: 'employee2@zenith.local', firstName: 'Esha', lastName: 'Employee', role: 'EMPLOYEE', empCode: 'QAU004',
    managerId: mgr.emp.id, departmentId: engDept.id,
  });
  await upsertUserWithEmployee({
    email: 'locked@zenith.local', firstName: 'Luqman', lastName: 'Locked', role: 'EMPLOYEE', empCode: 'QAU005',
    lockedUntil: new Date(Date.now() + 365 * DAY), failedLoginCount: 5,
  });
  await upsertUserWithEmployee({ email: 'suspended@zenith.local', firstName: 'Samina', lastName: 'Suspended', role: 'EMPLOYEE', empCode: 'QAU006', status: 'SUSPENDED' });
  await upsertUserWithEmployee({
    email: 'unverified@zenith.local', firstName: 'Umar', lastName: 'Unverified', role: 'EMPLOYEE', empCode: 'QAU007',
    status: 'PENDING_VERIFICATION', verified: false,
  });
  await upsertUserWithEmployee({ email: 'mfa@zenith.local', firstName: 'Mehreen', lastName: 'Mfa', role: 'EMPLOYEE', empCode: 'QAU008' });

  // Direct reports of manager@ (employee2 + 5 extra reports)
  for (let i = 1; i <= 5; i++) {
    const code = `QAR${String(i).padStart(3, '0')}`;
    const data = {
      firstName: pick(FIRST_NAMES), lastName: `Report${i}`, email: `report${i}@zenith.local`,
      status: 'ACTIVE' as const, managerId: mgr.emp.id, departmentId: engDept.id,
      branchId: headOffice.id, designationId: seDesig.id, joinDate: new Date(Date.UTC(2023, i, 5)),
    };
    await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId: COMPANY_ID, employeeCode: code } },
      update: { managerId: mgr.emp.id },
      create: { companyId: COMPANY_ID, employeeCode: code, employmentType: 'FULL_TIME', country: 'Pakistan', ...data },
    });
  }
  note('qaUsers', 8);

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@zenith.local' } });
  const employeeUser = await prisma.user.findUniqueOrThrow({ where: { email: 'employee@zenith.local' } });
  const superAdminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'superadmin@zenith.local' } });
  userIds['admin@zenith.local'] = adminUser.id;
  userIds['employee@zenith.local'] = employeeUser.id;
  userIds['superadmin@zenith.local'] = superAdminUser.id;

  // ---------------------------------------------------------------- 2. Other Corp
  console.log('Other Corp tenant...');
  await prisma.company.upsert({
    where: { id: OTHER_COMPANY_ID },
    update: {},
    create: {
      id: OTHER_COMPANY_ID, name: 'Other Corp', legalName: 'Other Corp Ltd', email: 'hr@othercorp.local',
      timezone: 'UTC', locale: 'en-US',
    },
  });
  await prisma.companySettings.upsert({
    where: { companyId: OTHER_COMPANY_ID },
    update: {},
    create: {
      companyId: OTHER_COMPANY_ID, emailProvider: 'console', emailFrom: 'noreply@othercorp.local',
      storageProvider: 'local', system: { maintenanceMode: false, allowSelfRegistration: false }, integrations: {},
    },
  });
  await prisma.companySecurityPolicy.upsert({
    where: { companyId: OTHER_COMPANY_ID },
    update: {},
    create: {
      companyId: OTHER_COMPANY_ID, maxFailedLogins: 5, lockoutMinutes: 15, passwordMinLength: 8,
      passwordRequireLetter: true, passwordRequireNumber: true, passwordRequireSpecial: false,
      requireMfaForPrivileged: false, allowSelfRegistration: false,
    },
  });
  const ocBranch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-HQ' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, code: 'OC-HQ', name: 'OTHERCORP-HQ', city: 'London', country: 'UK', isHeadOffice: true },
  });
  const ocDept = await prisma.department.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-OPS' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, branchId: ocBranch.id, code: 'OC-OPS', name: 'OTHERCORP-Operations' },
  });
  const ocTeam = await prisma.team.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-T1' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, departmentId: ocDept.id, code: 'OC-T1', name: 'OTHERCORP-Team' },
  });
  const ocDesig = await prisma.designation.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-STAFF' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, code: 'OC-STAFF', name: 'OTHERCORP-Staff', level: 5 },
  });
  const ocShift = await prisma.shift.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-GEN' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, code: 'OC-GEN', name: 'OTHERCORP-General', startTime: '09:00', endTime: '17:00', isDefault: true },
  });
  const ocLeaveType = await prisma.leaveType.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-ANNUAL' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, code: 'OC-ANNUAL', name: 'OTHERCORP-Annual Leave', maxDaysPerYear: 25 },
  });
  await prisma.leavePolicy.upsert({
    where: { companyId: OTHER_COMPANY_ID },
    update: {},
    create: { companyId: OTHER_COMPANY_ID },
  });
  const ocAdmin = await upsertUserWithEmployee({
    email: 'admin@othercorp.local', firstName: 'OTHERCORP-Admin', lastName: 'Boss', role: 'HR_ADMIN', empCode: 'OC001',
    companyId: OTHER_COMPANY_ID, departmentId: ocDept.id, designationId: ocDesig.id, branchId: ocBranch.id,
  });
  const ocEmployeeIds: string[] = [ocAdmin.emp.id];
  for (let i = 1; i <= 5; i++) {
    const code = `OC00${i + 1}`;
    const email = `othercorp-emp${i}@othercorp.local`;
    const data = {
      firstName: `OTHERCORP-Emp${i}`, lastName: 'Secret', email, status: 'ACTIVE' as const,
      departmentId: ocDept.id, teamId: ocTeam.id, branchId: ocBranch.id, designationId: ocDesig.id,
      managerId: ocAdmin.emp.id, joinDate: new Date(Date.UTC(2024, i, 1)), phone: `+44-700-000${i}`,
    };
    const e = await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId: OTHER_COMPANY_ID, employeeCode: code } },
      update: {},
      create: { companyId: OTHER_COMPANY_ID, employeeCode: code, employmentType: 'FULL_TIME', country: 'UK', ...data },
    });
    ocEmployeeIds.push(e.id);
  }
  const thisYear = new Date().getUTCFullYear();
  for (const empId of ocEmployeeIds) {
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId: empId, leaveTypeId: ocLeaveType.id, year: thisYear } },
      update: {},
      create: { companyId: OTHER_COMPANY_ID, employeeId: empId, leaveTypeId: ocLeaveType.id, year: thisYear, entitled: 25 },
    });
  }
  let ocLeave = await prisma.leaveRequest.findFirst({ where: { companyId: OTHER_COMPANY_ID, status: 'PENDING', deletedAt: null } });
  if (!ocLeave) {
    ocLeave = await prisma.leaveRequest.create({
      data: {
        companyId: OTHER_COMPANY_ID, employeeId: ocEmployeeIds[1]!, leaveTypeId: ocLeaveType.id,
        startDate: utcDay(new Date(Date.now() + 10 * DAY)), endDate: utcDay(new Date(Date.now() + 11 * DAY)),
        days: 2, reason: 'OTHERCORP leave request', status: 'PENDING',
      },
    });
    await prisma.leaveBalance.update({
      where: { employeeId_leaveTypeId_year: { employeeId: ocEmployeeIds[1]!, leaveTypeId: ocLeaveType.id, year: thisYear } },
      data: { pending: { increment: 2 } },
    });
  }
  await prisma.attendanceRecord.createMany({
    data: ocEmployeeIds.map((employeeId) => ({
      companyId: OTHER_COMPANY_ID, employeeId, date: utcDay(new Date(Date.now() - DAY)), shiftId: ocShift.id,
      status: 'PRESENT' as const, workMinutes: 420, source: 'SYSTEM' as const,
    })),
    skipDuplicates: true,
  });
  await prisma.salaryStructure.createMany({
    data: await (async () => {
      const have = await prisma.salaryStructure.findMany({ where: { companyId: OTHER_COMPANY_ID }, select: { employeeId: true } });
      const haveSet = new Set(have.map((h) => h.employeeId));
      return ocEmployeeIds.filter((id) => !haveSet.has(id)).map((employeeId) => ({
        companyId: OTHER_COMPANY_ID, employeeId, basicSalary: 3000, currency: 'USD', effectiveFrom: new Date(`${thisYear}-01-01T00:00:00.000Z`),
      }));
    })(),
  });
  let ocRun = await prisma.payrollRun.findFirst({ where: { companyId: OTHER_COMPANY_ID, deletedAt: null } });
  if (!ocRun) {
    const d = new Date();
    ocRun = await prisma.payrollRun.create({
      data: {
        companyId: OTHER_COMPANY_ID, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1,
        title: 'OTHERCORP Payroll (draft)', status: 'DRAFT', notes: 'OTHERCORP run for IDOR probes',
      },
    });
    for (const empId of ocEmployeeIds) {
      await prisma.payrollEntry.create({
        data: {
          companyId: OTHER_COMPANY_ID, payrollRunId: ocRun.id, employeeId: empId, basicSalary: 3000,
          grossPay: 3000, netPay: 2700, totalTax: 300,
        },
      });
    }
  }
  const ocJob = await prisma.jobOpening.upsert({
    where: { companyId_code: { companyId: OTHER_COMPANY_ID, code: 'OC-JOB-01' } },
    update: {},
    create: {
      companyId: OTHER_COMPANY_ID, code: 'OC-JOB-01', title: 'OTHERCORP-Secret Role', status: 'OPEN',
      departmentId: ocDept.id, publishedAt: new Date(),
    },
  });
  const ocCandidate = await prisma.candidate.upsert({
    where: { companyId_email: { companyId: OTHER_COMPANY_ID, email: 'othercorp-candidate@example.com' } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, firstName: 'OTHERCORP-Candidate', lastName: 'Private', email: 'othercorp-candidate@example.com' },
  });
  const ocApp = await prisma.jobApplication.upsert({
    where: { jobOpeningId_candidateId: { jobOpeningId: ocJob.id, candidateId: ocCandidate.id } },
    update: {},
    create: { companyId: OTHER_COMPANY_ID, jobOpeningId: ocJob.id, candidateId: ocCandidate.id, status: 'SCREENING' },
  });
  const ocNotifExists = await prisma.notification.findFirst({ where: { companyId: OTHER_COMPANY_ID, title: 'OTHERCORP notification' } });
  const ocNotif =
    ocNotifExists ??
    (await prisma.notification.create({
      data: {
        companyId: OTHER_COMPANY_ID, userId: ocAdmin.user.id, category: 'SYSTEM', channel: 'IN_APP',
        title: 'OTHERCORP notification', body: 'Tenant isolation probe', status: 'SENT', sentAt: new Date(),
      },
    }));
  note('otherCorpEmployees', ocEmployeeIds.length);

  // ---------------------------------------------------------------- 3. Bulk volume
  const already = await prisma.employee.findUnique({
    where: { companyId_employeeCode: { companyId: COMPANY_ID, employeeCode: 'QA0001' } },
  });
  if (already) {
    console.log('Bulk data already present (QA0001 exists) - skipping bulk section.');
  } else {
    console.log('Bulk: 400 employees...');
    const now = Date.now();
    type Emp = {
      id: string; joinDate: Date; status: string; managerId: string | null; leader: boolean;
    };
    const emps: Emp[] = [];
    const empRows: Prisma.EmployeeCreateManyInput[] = [];
    for (let i = 1; i <= 400; i++) {
      const id = randomUUID();
      const status = weighted(EMP_STATUSES);
      const joinDate = utcDay(new Date(now - rand() * 4 * 365 * DAY));
      const leader = i <= 20;
      const managerId = leader ? null : emps[randInt(0, 19)]!.id;
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const deptIdx = randInt(0, deptIds.length - 1);
      const code = `QA${String(i).padStart(4, '0')}`;
      empRows.push({
        id, companyId: COMPANY_ID, employeeCode: code, firstName: first, lastName: last,
        email: `qa${String(i).padStart(4, '0')}@zenith.local`,
        phone: `+92-301-${String(1000000 + i)}`, status, employmentType: weighted([['FULL_TIME', 80], ['PART_TIME', 5], ['CONTRACT', 8], ['INTERN', 5], ['CONSULTANT', 2]] as const),
        gender: pick(['MALE', 'FEMALE', 'OTHER'] as const),
        departmentId: deptIds[deptIdx], teamId: deptIdx >= 1 && deptIdx <= teamIds.length ? teamIds[deptIdx - 1] : null,
        branchId: pick(branchIds), designationId: pick(desigIds), managerId,
        joinDate, probationEndDate: status === 'PROBATION' ? new Date(now + 60 * DAY) : null,
        exitDate: ['TERMINATED', 'RESIGNED'].includes(status) ? utcDay(new Date(now - randInt(1, 200) * DAY)) : null,
        city: pick(['Karachi', 'Lahore', 'Islamabad', 'Faisalabad', 'Dubai']), country: 'Pakistan',
        workLocation: 'QA seed',
      });
      emps.push({ id, joinDate, status, managerId, leader });
    }
    await batched(empRows, 100, (chunk) => prisma.employee.createMany({ data: chunk, skipDuplicates: true }));
    note('employees', empRows.length);

    // pool: ~100 ACTIVE employees that joined >8 months ago
    const pool = emps.filter((e) => e.status === 'ACTIVE' && e.joinDate.getTime() < now - 240 * DAY).slice(0, 100);
    const salaryOf = new Map<string, number>(pool.map((e) => [e.id, randInt(20, 90) * 100]));

    // ---- attendance (6 months)
    console.log('Bulk: attendance...');
    const startDay = utcDay(new Date(now - 183 * DAY));
    const yesterday = utcDay(new Date(now - DAY));
    const attRows: Prisma.AttendanceRecordCreateManyInput[] = [];
    for (const e of pool) {
      for (let d = new Date(startDay); d <= yesterday; d = new Date(d.getTime() + DAY)) {
        if (isWeekend(d)) continue;
        const status = weighted([['PRESENT', 72], ['LATE', 12], ['REMOTE', 8], ['ABSENT', 3], ['HALF_DAY', 2], ['ON_LEAVE', 3]] as const);
        const base = d.getTime();
        let checkInAt: Date | null = null;
        let checkOutAt: Date | null = null;
        let lateMinutes = 0;
        let workMinutes = 0;
        if (['PRESENT', 'LATE', 'REMOTE', 'HALF_DAY'].includes(status)) {
          lateMinutes = status === 'LATE' ? randInt(16, 90) : 0;
          checkInAt = new Date(base + 9 * 3_600_000 + (lateMinutes + randInt(-5, 10)) * 60_000);
          const hrs = status === 'HALF_DAY' ? 4 : 8 + rand() * 1.5;
          checkOutAt = new Date(checkInAt.getTime() + hrs * 3_600_000);
          workMinutes = Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000) - (status === 'HALF_DAY' ? 0 : 60));
        }
        attRows.push({
          companyId: COMPANY_ID, employeeId: e.id, date: d, shiftId: shift.id, checkInAt, checkOutAt, status,
          workMinutes, lateMinutes, overtimeMinutes: workMinutes > 480 ? workMinutes - 480 : 0, source: 'SYSTEM',
        });
      }
    }
    await batched(attRows, 2000, (chunk) => prisma.attendanceRecord.createMany({ data: chunk, skipDuplicates: true }));
    note('attendanceRecords', attRows.length);

    // ---- leave balances + requests (consistent)
    console.log('Bulk: leave...');
    const leavePool = emps.filter((e) => e.status !== 'DRAFT').slice(0, 130);
    const types = [
      { id: annual.id, entitled: 20 },
      { id: sick.id, entitled: 10 },
      { id: casual.id, entitled: 5 },
    ];
    const bal = new Map<string, { used: number; pending: number; entitled: number }>();
    for (const e of leavePool) for (const t of types) bal.set(`${e.id}|${t.id}`, { used: 0, pending: 0, entitled: t.entitled });

    const reviewers = [employeeIds['manager@zenith.local']!, employeeIds['hrmanager@zenith.local']!];
    const reviewerUserIds = [userIds['manager@zenith.local']!, userIds['hrmanager@zenith.local']!];
    void reviewerUserIds;
    const leaveRows: Prisma.LeaveRequestCreateManyInput[] = [];
    const reasons = ['Family event', 'Medical appointment', 'Personal errand', 'Travel', 'Not feeling well', 'Wedding', 'Moving house'];
    for (let i = 0; i < 250; i++) {
      const e = pick(leavePool);
      const t = pick(types);
      const half = rand() < 0.1;
      let days = half ? 0.5 : weighted([[1, 45], [2, 30], [3, 15], [4, 6], [5, 4]] as const);
      let status = weighted([['PENDING', 25], ['APPROVED', 45], ['REJECTED', 15], ['CANCELLED', 15]] as const);
      const b = bal.get(`${e.id}|${t.id}`)!;
      if ((status === 'PENDING' || status === 'APPROVED') && b.used + b.pending + days > b.entitled) {
        days = half ? 0.5 : 1;
        if (b.used + b.pending + days > b.entitled) status = 'REJECTED';
      }
      // dates in current year: -150d .. +90d, weekday start
      let start = utcDay(new Date(now + randInt(-150, 90) * DAY));
      if (status === 'PENDING') start = utcDay(new Date(now + randInt(3, 60) * DAY));
      while (isWeekend(start)) start = new Date(start.getTime() + DAY);
      if (start.getUTCFullYear() !== thisYear) start = utcDay(new Date(Date.UTC(thisYear, 5, 15)));
      const end = half ? start : new Date(start.getTime() + (Math.ceil(days) - 1) * DAY);
      if (status === 'APPROVED') b.used += days;
      else if (status === 'PENDING') b.pending += days;
      const reviewed = status !== 'PENDING';
      leaveRows.push({
        id: randomUUID(), companyId: COMPANY_ID, employeeId: e.id, leaveTypeId: t.id, startDate: start, endDate: end,
        dayType: half ? pick(['HALF_DAY_AM', 'HALF_DAY_PM'] as const) : 'FULL_DAY', days, reason: pick(reasons), status,
        reviewedBy: reviewed && status !== 'CANCELLED' ? pick(reviewers) : null,
        reviewedAt: reviewed ? new Date(now - randInt(1, 40) * DAY) : null,
        reviewNotes: status === 'REJECTED' ? 'Insufficient coverage' : null,
        createdAt: new Date(now - randInt(1, 60) * DAY),
      });
    }
    const balRows: Prisma.LeaveBalanceCreateManyInput[] = [];
    for (const [key, v] of bal) {
      const [employeeId, leaveTypeId] = key.split('|');
      balRows.push({ companyId: COMPANY_ID, employeeId: employeeId!, leaveTypeId: leaveTypeId!, year: thisYear, entitled: v.entitled, used: v.used, pending: v.pending });
    }
    await batched(balRows, 500, (c) => prisma.leaveBalance.createMany({ data: c, skipDuplicates: true }));
    await batched(leaveRows, 500, (c) => prisma.leaveRequest.createMany({ data: c }));
    note('leaveBalances', balRows.length);
    note('leaveRequests', leaveRows.length);

    // ---- payroll: 6 monthly runs (previous 7..2 months to avoid base-seed months)
    console.log('Bulk: payroll...');
    const hra = await prisma.salaryComponent.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'HRA' } } });
    const pfC = await prisma.salaryComponent.findUniqueOrThrow({ where: { companyId_code: { companyId: COMPANY_ID, code: 'PF' } } });
    const tax = await prisma.taxSetting.findUnique({ where: { companyId: COMPANY_ID } });
    const rate = tax?.standardRate ?? 10;
    const allowanceMonthly = (tax?.personalAllowance ?? 12_000) / 12;

    await batched(
      pool.map((e) => ({
        companyId: COMPANY_ID, employeeId: e.id, basicSalary: salaryOf.get(e.id)!, currency: 'USD',
        effectiveFrom: new Date(`${thisYear - 1}-01-01T00:00:00.000Z`), isActive: true,
      })),
      500,
      (c) => prisma.salaryStructure.createMany({ data: c }),
    );

    let runsCreated = 0;
    let entriesCreated = 0;
    const cur = new Date();
    for (let back = 7; back >= 2; back--) {
      const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - back, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const existing = await prisma.payrollRun.findFirst({ where: { companyId: COMPANY_ID, year, month } });
      if (existing) continue;
      const status = back >= 5 ? 'PAID' : back >= 3 ? 'APPROVED' : 'COMPLETED';
      const processedAt = new Date(Date.UTC(year, month, 1));
      const run = await prisma.payrollRun.create({
        data: {
          companyId: COMPANY_ID, year, month, title: `Payroll ${year}-${String(month).padStart(2, '0')}`, status,
          processedAt, approvedAt: status === 'COMPLETED' ? null : processedAt, paidAt: status === 'PAID' ? processedAt : null,
          notes: 'QA seeded run',
        },
      });
      runsCreated++;
      const entryRows: Prisma.PayrollEntryCreateManyInput[] = [];
      const lineRows: Prisma.PayrollEntryLineCreateManyInput[] = [];
      const slipRows: Prisma.PayslipCreateManyInput[] = [];
      for (const e of pool) {
        const basic = salaryOf.get(e.id)!;
        const allowance = round2(basic * 0.4);
        const pf = round2(basic * 0.05);
        const taxable = Math.max(0, round2(basic + allowance - allowanceMonthly));
        const incomeTax = round2((taxable * rate) / 100);
        const gross = round2(basic + allowance);
        const net = round2(gross - pf - incomeTax);
        const entryId = randomUUID();
        entryRows.push({
          id: entryId, companyId: COMPANY_ID, payrollRunId: run.id, employeeId: e.id, basicSalary: basic,
          totalAllowances: allowance, totalBonuses: 0, totalDeductions: pf, totalTax: incomeTax, grossPay: gross, netPay: net,
        });
        lineRows.push(
          { payrollEntryId: entryId, componentId: hra.id, kind: 'ALLOWANCE', label: 'Housing Allowance', amount: allowance },
          { payrollEntryId: entryId, componentId: pfC.id, kind: 'DEDUCTION', label: 'Provident Fund', amount: pf },
          { payrollEntryId: entryId, componentId: null, kind: 'TAX', label: 'Income Tax', amount: incomeTax },
        );
        slipRows.push({
          companyId: COMPANY_ID, employeeId: e.id, payrollEntryId: entryId, year, month, basicSalary: basic,
          totalAllowances: allowance, totalBonuses: 0, totalDeductions: pf, totalTax: incomeTax, grossPay: gross, netPay: net,
          currency: 'USD', status: status === 'PAID' ? 'PAID' : 'GENERATED', paidAt: status === 'PAID' ? processedAt : null,
        });
      }
      await prisma.payrollEntry.createMany({ data: entryRows });
      await batched(lineRows, 1000, (c) => prisma.payrollEntryLine.createMany({ data: c }));
      await prisma.payslip.createMany({ data: slipRows });
      entriesCreated += entryRows.length;
    }
    note('payrollRuns', runsCreated);
    note('payrollEntries', entriesCreated);

    // ---- recruitment
    console.log('Bulk: recruitment...');
    const jobDefs = [
      { code: 'QA-JOB-01', title: 'Backend Engineer', dept: engDept.id, status: 'OPEN' as const },
      { code: 'QA-JOB-02', title: 'Marketing Specialist', dept: deptIds[2]!, status: 'OPEN' as const },
      { code: 'QA-JOB-03', title: 'Accountant', dept: deptIds[1]!, status: 'ON_HOLD' as const },
      { code: 'QA-JOB-04', title: 'Support Agent', dept: deptIds[5]!, status: 'OPEN' as const },
      { code: 'QA-JOB-05', title: 'Product Designer', dept: deptIds[9]!, status: 'CLOSED' as const },
    ];
    const jobIds: string[] = [];
    for (const j of jobDefs) {
      const row = await prisma.jobOpening.upsert({
        where: { companyId_code: { companyId: COMPANY_ID, code: j.code } },
        update: {},
        create: {
          companyId: COMPANY_ID, code: j.code, title: j.title, description: `${j.title} - QA seeded opening`,
          requirements: '3+ years experience', status: j.status, departmentId: j.dept, branchId: headOffice.id,
          hiringManagerId: employeeIds['hrmanager@zenith.local'], openings: 2, salaryMin: 2000, salaryMax: 6000,
          publishedAt: j.status === 'DRAFT' ? null : new Date(now - 30 * DAY), closedAt: j.status === 'CLOSED' ? new Date() : null,
        },
      });
      jobIds.push(row.id);
    }
    const appStatuses = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const;
    const candRows: Prisma.CandidateCreateManyInput[] = [];
    const appRows: Prisma.JobApplicationCreateManyInput[] = [];
    for (let i = 1; i <= 160; i++) {
      const id = randomUUID();
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      candRows.push({
        id, companyId: COMPANY_ID, firstName: first, lastName: last, email: `qa.cand${String(i).padStart(4, '0')}@example.com`,
        phone: `+92-302-${String(2000000 + i)}`, source: pick(['LinkedIn', 'Referral', 'Careers page', 'Indeed', 'Agency']),
        currentTitle: pick(['Engineer', 'Analyst', 'Designer', 'Accountant', 'Agent']), currentCompany: pick(['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli']),
        yearsExperience: randInt(1, 12), screeningScore: randInt(40, 98),
        resumeUrl: `https://files.zenith.local/resumes/qa-cand-${i}.pdf`, resumeFileName: `qa-cand-${i}.pdf`, resumeMimeType: 'application/pdf',
      });
      const status = appStatuses[(i - 1) % appStatuses.length]!;
      const applied = new Date(now - randInt(1, 120) * DAY);
      appRows.push({
        id: randomUUID(), companyId: COMPANY_ID, jobOpeningId: jobIds[(i - 1) % jobIds.length]!, candidateId: id, status,
        coverLetter: 'QA seeded cover letter', appliedAt: applied, stageChangedAt: new Date(applied.getTime() + randInt(0, 10) * DAY),
        rejectionReason: status === 'REJECTED' ? 'Not a fit for the role' : null,
      });
    }
    await batched(candRows, 200, (c) => prisma.candidate.createMany({ data: c, skipDuplicates: true }));
    await batched(appRows, 200, (c) => prisma.jobApplication.createMany({ data: c, skipDuplicates: true }));
    note('jobOpenings', jobIds.length);
    note('candidates', candRows.length);
    note('jobApplications', appRows.length);

    // ---- performance
    console.log('Bulk: performance reviews...');
    let cycle = await prisma.reviewCycle.findFirst({ where: { companyId: COMPANY_ID, name: `QA ${thisYear} Annual Review`, deletedAt: null } });
    if (!cycle) {
      cycle = await prisma.reviewCycle.create({
        data: {
          companyId: COMPANY_ID, name: `QA ${thisYear} Annual Review`, year: thisYear,
          startDate: new Date(`${thisYear}-09-01`), endDate: new Date(`${thisYear}-12-15`), status: 'ACTIVE',
        },
      });
    }
    const reviewees = emps.filter((e) => e.status === 'ACTIVE' || e.status === 'PROBATION').slice(20, 80);
    const reviewRows: Prisma.PerformanceReviewCreateManyInput[] = reviewees.map((e) => {
      const status = pick(['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'] as const);
      const submitted = ['SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'].includes(status);
      const self = round2(2.5 + rand() * 2.5);
      const mrate = round2(2.5 + rand() * 2.5);
      return {
        companyId: COMPANY_ID, cycleId: cycle!.id, employeeId: e.id, reviewerId: e.managerId ?? employeeIds['manager@zenith.local'], status,
        selfRating: status === 'DRAFT' ? null : self,
        managerRating: submitted ? mrate : null,
        overallRating: submitted ? round2((self + mrate) / 2) : null,
        selfComments: status === 'DRAFT' ? null : 'QA self assessment',
        managerComments: submitted ? 'QA manager assessment' : null,
        submittedAt: submitted ? new Date(now - randInt(1, 30) * DAY) : null,
        acknowledgedAt: status === 'ACKNOWLEDGED' || status === 'COMPLETED' ? new Date() : null,
      };
    });
    await batched(reviewRows, 100, (c) => prisma.performanceReview.createMany({ data: c }));
    note('performanceReviews', reviewRows.length);

    // ---- notifications (1200 for admin + employee users)
    console.log('Bulk: notifications...');
    const cats = ['SYSTEM', 'LEAVE', 'ATTENDANCE', 'PAYROLL', 'RECRUITMENT', 'PERFORMANCE', 'AI', 'SECURITY', 'OTHER'] as const;
    const notifRows: Prisma.NotificationCreateManyInput[] = [];
    for (let i = 0; i < 1200; i++) {
      const userId = i % 2 === 0 ? adminUser.id : employeeUser.id;
      const channel = weighted([['IN_APP', 85], ['EMAIL', 10], ['PUSH', 5]] as const);
      const read = rand() < 0.4;
      const created = new Date(now - rand() * 90 * DAY);
      const category = pick(cats);
      notifRows.push({
        companyId: COMPANY_ID, userId, category, channel, title: `QA notification #${i + 1} (${category})`,
        body: `Automatically generated QA notification ${i + 1}.`, data: { qa: true, index: i + 1 },
        status: read ? 'READ' : 'SENT', readAt: read ? new Date(created.getTime() + randInt(1, 600) * 60_000) : null,
        sentAt: created, emailTo: channel === 'EMAIL' ? (i % 2 === 0 ? 'admin@zenith.local' : 'employee@zenith.local') : null,
        createdAt: created,
      });
    }
    await batched(notifRows, 500, (c) => prisma.notification.createMany({ data: c }));
    note('notifications', notifRows.length);
  }

  // ---------------------------------------------------------------- fixtures
  const pendingLeave = await prisma.leaveRequest.findFirst({
    where: { companyId: COMPANY_ID, status: 'PENDING', deletedAt: null }, orderBy: { createdAt: 'desc' },
  });
  const draftRun = await prisma.payrollRun.findFirst({ where: { companyId: COMPANY_ID, status: 'DRAFT', deletedAt: null } });
  const completedRun = await prisma.payrollRun.findFirst({ where: { companyId: COMPANY_ID, status: 'COMPLETED', deletedAt: null }, orderBy: { year: 'desc' } });
  const payslip = await prisma.payslip.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: 'desc' } });
  const ocEmpRow = await prisma.employee.findFirst({ where: { companyId: OTHER_COMPANY_ID, employeeCode: 'OC002' } });
  const reviewRow = await prisma.performanceReview.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { createdAt: 'desc' } });
  const candRow = await prisma.candidate.findFirst({ where: { companyId: COMPANY_ID, email: 'qa.cand0001@example.com' } });

  const totals = {
    zenith: {
      employees: await prisma.employee.count({ where: { companyId: COMPANY_ID } }),
      users: await prisma.user.count({ where: { companyId: COMPANY_ID } }),
      departments: await prisma.department.count({ where: { companyId: COMPANY_ID } }),
      branches: await prisma.branch.count({ where: { companyId: COMPANY_ID } }),
      teams: await prisma.team.count({ where: { companyId: COMPANY_ID } }),
      designations: await prisma.designation.count({ where: { companyId: COMPANY_ID } }),
      attendanceRecords: await prisma.attendanceRecord.count({ where: { companyId: COMPANY_ID } }),
      leaveRequests: await prisma.leaveRequest.count({ where: { companyId: COMPANY_ID } }),
      leaveRequestsByStatus: Object.fromEntries(
        (await prisma.leaveRequest.groupBy({ by: ['status'], where: { companyId: COMPANY_ID }, _count: true })).map((g) => [g.status, g._count]),
      ),
      payrollRuns: await prisma.payrollRun.count({ where: { companyId: COMPANY_ID } }),
      payrollEntries: await prisma.payrollEntry.count({ where: { companyId: COMPANY_ID } }),
      payslips: await prisma.payslip.count({ where: { companyId: COMPANY_ID } }),
      jobOpenings: await prisma.jobOpening.count({ where: { companyId: COMPANY_ID } }),
      candidates: await prisma.candidate.count({ where: { companyId: COMPANY_ID } }),
      jobApplications: await prisma.jobApplication.count({ where: { companyId: COMPANY_ID } }),
      applicationsByStatus: Object.fromEntries(
        (await prisma.jobApplication.groupBy({ by: ['status'], where: { companyId: COMPANY_ID }, _count: true })).map((g) => [g.status, g._count]),
      ),
      performanceReviews: await prisma.performanceReview.count({ where: { companyId: COMPANY_ID } }),
      notifications: await prisma.notification.count({ where: { companyId: COMPANY_ID } }),
      managerDirectReports: await prisma.employee.count({ where: { managerId: employeeIds['manager@zenith.local'] } }),
    },
    othercorp: {
      employees: await prisma.employee.count({ where: { companyId: OTHER_COMPANY_ID } }),
      users: await prisma.user.count({ where: { companyId: OTHER_COMPANY_ID } }),
    },
  };

  const fixtures = {
    generatedAt: new Date().toISOString(),
    password: 'see PASSWORD constant in prisma/seed-qa.ts (same as base seed)',
    seededThisRun: counts,
    totals,
    companies: { zenith: COMPANY_ID, othercorp: OTHER_COMPANY_ID },
    userIds,
    employeeIds,
    othercorp: {
      adminUserId: ocAdmin.user.id,
      adminEmployeeId: ocAdmin.emp.id,
      employeeId: ocEmpRow?.id ?? ocEmployeeIds[1],
      employeeIds: ocEmployeeIds,
      leaveRequestId: ocLeave.id,
      payrollRunId: ocRun.id,
      jobOpeningId: ocJob.id,
      candidateId: ocCandidate.id,
      applicationId: ocApp.id,
      notificationId: ocNotif.id,
      departmentId: ocDept.id,
      leaveTypeId: ocLeaveType.id,
    },
    zenith: {
      pendingLeaveRequestId: pendingLeave?.id ?? null,
      draftPayrollRunId: draftRun?.id ?? null,
      completedPayrollRunId: completedRun?.id ?? null,
      payslipId: payslip?.id ?? null,
      reviewId: reviewRow?.id ?? null,
      candidateId: candRow?.id ?? null,
    },
    runtimeSeconds: round2((Date.now() - t0) / 1000),
  };
  const json = JSON.stringify(fixtures, null, 2);
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'seed-qa.fixtures.json');
  writeFileSync(outPath, json);
  console.log(json);
  console.log(`Fixtures written to ${outPath}`);
}

main()
  .catch((error) => {
    console.error('QA seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
