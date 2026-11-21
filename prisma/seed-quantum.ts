/**
 * Seeds the first tenant: Quantum Tech Solutions (fictional demo data, 40 employees).
 *
 *   npm run prisma:seed:quantum
 *
 * Safe to re-run: every row has a fixed id or a natural unique key and is created with
 * upsert / skipDuplicates, so nothing is duplicated and nothing is deleted or overwritten
 * (existing users keep their passwords). Only rows belonging to this company are touched.
 *
 * Env:
 *   QTS_CREDENTIALS_FILE      where to write the generated demo logins (plaintext, local file only)
 *   PLATFORM_ADMIN_EMAIL      optional: also creates one PLATFORM_SUPER_ADMIN (no company)
 *   ALLOW_TENANT_SEED=true    required when NODE_ENV=production
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import 'dotenv/config';
import { hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ensureRbac, PLATFORM_ROLE } from './rbac.js';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TENANT_SEED !== 'true') {
  console.error('Refusing to seed: NODE_ENV=production. Set ALLOW_TENANT_SEED=true to confirm.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const SLUG = 'quantum-tech-solutions';
const EMAIL_DOMAIN = 'quantumtech.demo';
const P = 'qts'; // id prefix for every seeded row

// ---------- deterministic helpers ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261120);
const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const chance = (p: number) => rnd() < p;
const pad = (n: number, w = 3) => String(n).padStart(w, '0');
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
/** A wall-clock time in Pakistan (UTC+5) on the given UTC-midnight date. */
const pkt = (day: Date, h: number, m = 0) => new Date(day.getTime() + (h - 5) * 3_600_000 + m * 60_000);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const round = (n: number) => Math.round(n);
const tomorrowless = () => {
  const n = new Date();
  return utc(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
};
const TODAY = tomorrowless();

// ---------- people ----------
type RoleKey = 'SUPER_ADMIN' | 'HR_ADMIN' | 'RECRUITER' | 'MANAGER' | 'EMPLOYEE';
type SalaryBand = readonly [number, number];
interface Person {
  n: number;
  first: string;
  last: string;
  title: string;
  dept: string;
  role: RoleKey;
  gender: 'MALE' | 'FEMALE';
  band: SalaryBand;
}

const D = {
  HR: 'Human Resources',
  DEV: 'Software Development',
  QA: 'Quality Assurance',
  UX: 'UI/UX Design',
  MKT: 'Marketing',
  SALES: 'Sales & Business Development',
  FIN: 'Finance & Administration',
} as const;
const DEPT_CODE: Record<string, string> = {
  [D.HR]: 'HR', [D.DEV]: 'DEV', [D.QA]: 'QA', [D.UX]: 'UX', [D.MKT]: 'MKT', [D.SALES]: 'SALES', [D.FIN]: 'FIN',
};

const B = {
  hrDirector: [200_000, 300_000], devManager: [220_000, 300_000], qaManager: [180_000, 250_000],
  mktManager: [170_000, 230_000], hrOps: [80_000, 130_000], recruiter: [90_000, 140_000],
  seniorDev: [150_000, 220_000], midDev: [100_000, 160_000], juniorDev: [60_000, 90_000],
  seniorQa: [140_000, 180_000], qa: [80_000, 140_000], ux: [80_000, 150_000],
  mkt: [60_000, 120_000], sales: [60_000, 120_000], fin: [50_000, 120_000],
} as const satisfies Record<string, SalaryBand>;

// [n, first, last, title, dept, role, gender, band]
const PEOPLE: Person[] = (
  [
    [1, 'Ahmed', 'Raza', 'HR Director', D.HR, 'SUPER_ADMIN', 'MALE', B.hrDirector],
    [2, 'Fatima', 'Noor', 'HR Operations Officer', D.HR, 'HR_ADMIN', 'FEMALE', B.hrOps],
    [3, 'Hassan', 'Ali', 'Talent Acquisition Specialist', D.HR, 'RECRUITER', 'MALE', B.recruiter],
    [4, 'Usman', 'Khalid', 'Development Manager', D.DEV, 'MANAGER', 'MALE', B.devManager],
    [5, 'Ayesha', 'Malik', 'QA Manager', D.QA, 'MANAGER', 'FEMALE', B.qaManager],
    [6, 'Bilal', 'Ahmed', 'Marketing Manager', D.MKT, 'MANAGER', 'MALE', B.mktManager],
    [7, 'Hamza', 'Tariq', 'Senior Angular Developer', D.DEV, 'EMPLOYEE', 'MALE', B.seniorDev],
    [8, 'Zain', 'Abbas', 'Angular Developer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [9, 'Ali', 'Hassan', 'Backend Developer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [10, 'Saad', 'Iqbal', 'Node.js Developer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [11, 'Maryam', 'Shah', 'React Developer', D.DEV, 'EMPLOYEE', 'FEMALE', B.midDev],
    [12, 'Umar', 'Farooq', 'Full Stack Developer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [13, 'Daniyal', 'Khan', 'Junior Software Engineer', D.DEV, 'EMPLOYEE', 'MALE', B.juniorDev],
    [14, 'Hira', 'Aslam', 'Angular Developer', D.DEV, 'EMPLOYEE', 'FEMALE', B.midDev],
    [15, 'Talha', 'Javed', 'Python Developer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [16, 'Mustafa', 'Ahmed', 'DevOps Engineer', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [17, 'Eman', 'Fatima', 'Software Engineer', D.DEV, 'EMPLOYEE', 'FEMALE', B.midDev],
    [18, 'Shahzaib', 'Malik', 'Database Administrator', D.DEV, 'EMPLOYEE', 'MALE', B.midDev],
    [19, 'Laiba', 'Ahmed', 'Senior QA Engineer', D.QA, 'EMPLOYEE', 'FEMALE', B.seniorQa],
    [20, 'Haris', 'Mahmood', 'QA Engineer', D.QA, 'EMPLOYEE', 'MALE', B.qa],
    [21, 'Noor', 'Fatima', 'Automation Tester', D.QA, 'EMPLOYEE', 'FEMALE', B.qa],
    [22, 'Asad', 'Rauf', 'Manual QA Engineer', D.QA, 'EMPLOYEE', 'MALE', B.qa],
    [23, 'Muneeb', 'Ali', 'QA Engineer', D.QA, 'EMPLOYEE', 'MALE', B.qa],
    [24, 'Kinza', 'Tariq', 'Junior QA Engineer', D.QA, 'EMPLOYEE', 'FEMALE', [80_000, 90_000]],
    [25, 'Mahnoor', 'Khan', 'Senior UI/UX Designer', D.UX, 'EMPLOYEE', 'FEMALE', [120_000, 150_000]],
    [26, 'Abdullah', 'Sheikh', 'UI Designer', D.UX, 'EMPLOYEE', 'MALE', B.ux],
    [27, 'Iqra', 'Yousaf', 'UX Researcher', D.UX, 'EMPLOYEE', 'FEMALE', B.ux],
    [28, 'Rehan', 'Akhtar', 'Graphic Designer', D.UX, 'EMPLOYEE', 'MALE', B.ux],
    [29, 'Sana', 'Jamil', 'Digital Marketing Specialist', D.MKT, 'EMPLOYEE', 'FEMALE', B.mkt],
    [30, 'Waleed', 'Hassan', 'SEO Specialist', D.MKT, 'EMPLOYEE', 'MALE', B.mkt],
    [31, 'Maira', 'Asif', 'Content Writer', D.MKT, 'EMPLOYEE', 'FEMALE', B.mkt],
    [32, 'Farhan', 'Aziz', 'Social Media Executive', D.MKT, 'EMPLOYEE', 'MALE', B.mkt],
    [33, 'Dua', 'Ahmed', 'Marketing Coordinator', D.MKT, 'EMPLOYEE', 'FEMALE', B.mkt],
    [34, 'Adeel', 'Shah', 'Business Development Executive', D.SALES, 'EMPLOYEE', 'MALE', B.sales],
    [35, 'Anum', 'Khalid', 'Sales Executive', D.SALES, 'EMPLOYEE', 'FEMALE', B.sales],
    [36, 'Rizwan', 'Ahmed', 'Account Manager', D.SALES, 'EMPLOYEE', 'MALE', B.sales],
    [37, 'Sarmad', 'Ali', 'Sales Representative', D.SALES, 'EMPLOYEE', 'MALE', B.sales],
    [38, 'Zoya', 'Hassan', 'Client Relationship Officer', D.SALES, 'EMPLOYEE', 'FEMALE', B.sales],
    [39, 'Kashif', 'Mehmood', 'Finance Officer', D.FIN, 'EMPLOYEE', 'MALE', B.fin],
    [40, 'Rabia', 'Ilyas', 'Admin Officer', D.FIN, 'EMPLOYEE', 'FEMALE', B.fin],
  ] as const
).map(([n, first, last, title, dept, role, gender, band]) => ({ n, first, last, title, dept, role, gender, band }));

const code = (n: number) => `QTS-${pad(n)}`;
/** Reporting line: team members -> department manager; managers, HR and unmanaged departments -> HR Director. */
function managerOf(p: Person): number | null {
  if (p.n === 1) return null;
  if (p.dept === D.DEV && p.n !== 4) return 4;
  if (p.dept === D.QA && p.n !== 5) return 5;
  if (p.dept === D.MKT && p.n !== 6) return 6;
  return 1;
}
const LEVELS: Record<string, number> = {
  'HR Director': 9, 'Development Manager': 8, 'QA Manager': 8, 'Marketing Manager': 8,
  'Senior Angular Developer': 6, 'Senior QA Engineer': 6, 'Senior UI/UX Designer': 6, 'Account Manager': 5,
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- salary (simplified demo maths, PKR per month) ----------
/** Simplified annual slab tax for salaried individuals, spread monthly. Illustrative only. */
function monthlyTax(monthlyGross: number): number {
  const a = monthlyGross * 12;
  let tax = 0;
  if (a <= 600_000) tax = 0;
  else if (a <= 1_200_000) tax = (a - 600_000) * 0.01;
  else if (a <= 2_200_000) tax = 6_000 + (a - 1_200_000) * 0.11;
  else if (a <= 3_200_000) tax = 116_000 + (a - 2_200_000) * 0.23;
  else if (a <= 4_100_000) tax = 346_000 + (a - 3_200_000) * 0.3;
  else tax = 616_000 + (a - 4_100_000) * 0.35;
  return round(tax / 12);
}
interface Pay {
  gross: number; basic: number; housing: number; medical: number; transport: number; other: number;
  tax: number; otherDed: number; net: number;
}
function buildPay(band: SalaryBand): Pay {
  const gross = Math.round(between(band[0], band[1]) / 1000) * 1000;
  const basic = round(gross * 0.6);
  const housing = round(gross * 0.2);
  const medical = round(gross * 0.08);
  const transport = round(gross * 0.07);
  const other = gross - basic - housing - medical - transport;
  const tax = monthlyTax(gross);
  const otherDed = round(basic * 0.02);
  return { gross, basic, housing, medical, transport, other, tax, otherDed, net: gross - tax - otherDed };
}

async function main() {
  console.log('Quantum Tech Solutions seed');
  await ensureRbac(prisma);
  const roleId = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const need = (c: string) => roleId.get(c) ?? (() => { throw new Error(`Role ${c} missing`); })();

  // ---- company ----
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      slug: SLUG,
      name: 'Quantum Tech Solutions',
      legalName: 'Quantum Tech Solutions (Pvt) Ltd',
      email: `hr@${EMAIL_DOMAIN}`,
      phone: '+92-42-0000-0000',
      website: 'https://quantumtech.example',
      industry: 'Software Development & IT Services',
      country: 'Pakistan',
      city: 'Lahore',
      address: 'Demo Office, Gulberg III, Lahore',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      locale: 'en-PK',
      primaryColor: '#4f46e5',
      loginMessage: 'Welcome back to Quantum Tech Solutions HR Portal',
      subscriptionPlan: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
      isActive: true,
    },
  });
  const companyId = company.id;
  await prisma.companySettings.upsert({
    where: { companyId },
    update: {},
    create: { companyId, emailProvider: 'console', storageProvider: 'cloudinary', system: { allowSelfRegistration: false, defaultTimezone: 'Asia/Karachi' }, integrations: {} },
  });
  await prisma.companySecurityPolicy.upsert({
    where: { companyId },
    update: {},
    create: { companyId, maxFailedLogins: 5, lockoutMinutes: 15, passwordMinLength: 8, passwordRequireLetter: true, passwordRequireNumber: true, passwordRequireSpecial: false, requireMfaForPrivileged: false, allowSelfRegistration: false },
  });
  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId, code: 'LHR-HQ' } },
    update: {},
    create: { companyId, name: 'Lahore Head Office', code: 'LHR-HQ', city: 'Lahore', country: 'Pakistan', isHeadOffice: true },
  });

  // ---- departments & designations ----
  const deptId = new Map<string, string>();
  for (const name of Object.values(D)) {
    const dep = await prisma.department.upsert({
      where: { id: `${P}-dept-${DEPT_CODE[name]}` },
      update: {},
      create: { id: `${P}-dept-${DEPT_CODE[name]}`, companyId, branchId: branch.id, name, code: DEPT_CODE[name]! },
    });
    deptId.set(name, dep.id);
  }
  const desigId = new Map<string, string>();
  for (const title of [...new Set(PEOPLE.map((p) => p.title))]) {
    const d = await prisma.designation.upsert({
      where: { id: `${P}-desig-${slug(title)}` },
      update: {},
      create: { id: `${P}-desig-${slug(title)}`, companyId, name: title, code: slug(title).toUpperCase().slice(0, 30), level: LEVELS[title] ?? (/Junior/.test(title) ? 2 : 4) },
    });
    desigId.set(title, d.id);
  }

  // ---- users & employees ----
  const credentials: string[] = ['employee_id,email,role,password'];
  const userId = new Map<number, string>();
  const empId = new Map<number, string>();
  const pays = new Map<number, Pay>();
  let usersCreated = 0;

  for (const p of PEOPLE) {
    const email = `${p.first}.${p.last}`.toLowerCase().replace(/\s+/g, '') + `@${EMAIL_DOMAIN}`;
    let user = await prisma.user.findUnique({ where: { email } });
    if (user && user.companyId !== companyId) throw new Error(`${email} already belongs to another company`);
    if (!user) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      let pw = '';
      for (let i = 0; i < 14; i += 1) pw += alphabet[randomInt(alphabet.length)];
      pw += '#7';
      user = await prisma.user.create({
        data: { email, passwordHash: await hash(pw, 12), firstName: p.first, lastName: p.last, phone: `0300-000${pad(p.n, 4)}`, companyId, status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      credentials.push(`${code(p.n)},${email},${p.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN+HR_MANAGER' : p.role === 'MANAGER' ? 'TEAM_MANAGER' : p.role},${pw}`);
      usersCreated += 1;
    }
    userId.set(p.n, user.id);
    const roles = p.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN', 'HR_MANAGER'] : [p.role];
    for (const r of roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: need(r) } },
        update: {},
        create: { userId: user.id, roleId: need(r) },
      });
    }

    const pay = buildPay(p.band);
    pays.set(p.n, pay);
    const joinYear = p.n <= 6 ? between(2019, 2021) : /Junior/.test(p.title) ? 2026 : between(2020, 2025);
    const joinDate = joinYear === 2026 ? utc(2026, between(3, 6), between(1, 28)) : utc(joinYear, between(1, 12), between(1, 28));
    const onProbation = joinYear === 2026 && joinDate > utc(2026, 5, 1);
    const emp = await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId, employeeCode: code(p.n) } },
      update: {},
      create: {
        companyId, userId: user.id, employeeCode: code(p.n), firstName: p.first, lastName: p.last, email, phone: `0300-000${pad(p.n, 4)}`,
        gender: p.gender, dateOfBirth: utc(between(1985, 2001), between(1, 12), between(1, 28)), nationality: 'Pakistani',
        nationalId: `00000-${String(1000000 + p.n)}-0`, addressLine1: `House ${between(1, 99)}, Block ${pick(['A', 'B', 'C', 'D'])}, Demo Town`,
        city: 'Lahore', country: 'Pakistan', postalCode: '54000', branchId: branch.id, departmentId: deptId.get(p.dept)!, designationId: desigId.get(p.title)!,
        employmentType: 'FULL_TIME', status: onProbation ? 'PROBATION' : 'ACTIVE', joinDate,
        probationEndDate: addDays(joinDate, 90), noticePeriodDays: p.n <= 6 ? 60 : 30, workLocation: 'Lahore Head Office',
        bankName: pick(['Demo Bank Ltd', 'Sample Bank Pakistan', 'Example Bank']), bankAccount: `PK00DEMO${String(1000000000 + p.n * 7919)}`,
        isActive: true,
      },
    });
    empId.set(p.n, emp.id);

    await prisma.employeeEmergencyContact.upsert({
      where: { id: `${P}-ec-${p.n}` }, update: {},
      create: { id: `${P}-ec-${p.n}`, employeeId: emp.id, name: `${pick(['Demo', 'Sample'])} Contact ${p.n}`, relationship: pick(['Spouse', 'Parent', 'Sibling']), phone: `0321-000${pad(p.n, 4)}`, isPrimary: true },
    });
    await prisma.employeeEducation.upsert({
      where: { id: `${P}-edu-${p.n}` }, update: {},
      create: { id: `${P}-edu-${p.n}`, employeeId: emp.id, institution: pick(['Demo University of Technology', 'Sample Institute of Computer Science', 'Example College of Commerce']), degree: pick(['BS', 'BBA', 'MS']), fieldOfStudy: p.dept === D.MKT || p.dept === D.SALES ? 'Business Administration' : p.dept === D.FIN || p.dept === D.HR ? 'Management' : 'Computer Science', startDate: utc(2012 + (p.n % 5), 9, 1), endDate: utc(2016 + (p.n % 5), 7, 1) },
    });
    await prisma.employeeExperience.upsert({
      where: { id: `${P}-exp-${p.n}` }, update: {},
      create: { id: `${P}-exp-${p.n}`, employeeId: emp.id, companyName: `${pick(['Demo', 'Sample', 'Example'])} ${pick(['Systems', 'Labs', 'Group'])}`, title: p.title.replace('Senior ', ''), location: 'Lahore', startDate: utc(2016 + (p.n % 4), 8, 1), endDate: joinDate, description: 'Previous experience (demo).' },
    });
    const skills = /Angular/.test(p.title) ? ['Angular', 'TypeScript', 'RxJS'] : /React/.test(p.title) ? ['React', 'TypeScript'] : /Node|Backend|Full Stack/.test(p.title) ? ['Node.js', 'PostgreSQL'] : /Python/.test(p.title) ? ['Python', 'Django'] : /DevOps/.test(p.title) ? ['Docker', 'CI/CD'] : /QA|Test/.test(p.title) ? ['Test Planning', 'Automation'] : /Design|UX|UI/.test(p.title) ? ['Figma', 'Prototyping'] : /Market|SEO|Content|Social/.test(p.title) ? ['SEO', 'Content Strategy'] : /Sales|Business|Account|Client/.test(p.title) ? ['Negotiation', 'CRM'] : ['Communication', 'Planning'];
    await prisma.employeeSkill.createMany({ data: skills.map((name, i) => ({ id: `${P}-skill-${p.n}-${i}`, employeeId: emp.id, name, level: pick(['Intermediate', 'Advanced']), years: between(1, 8) })), skipDuplicates: true });
  }
  // reporting lines (second pass so every manager exists)
  for (const p of PEOPLE) {
    const m = managerOf(p);
    await prisma.employee.update({ where: { id: empId.get(p.n)! }, data: { managerId: m ? empId.get(m)! : null } });
  }

  // ---- shift, holidays ----
  const shift = await prisma.shift.upsert({
    where: { companyId_code: { companyId, code: 'GEN' } }, update: {},
    create: { companyId, name: 'General Shift', code: 'GEN', startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutes: 15, isDefault: true },
  });
  for (const [name, y, m, d] of [['Pakistan Day', 2026, 3, 23], ['Labour Day', 2026, 5, 1], ['Independence Day', 2026, 8, 14], ['Quaid-e-Azam Day', 2026, 12, 25]] as const) {
    await prisma.holiday.upsert({ where: { companyId_date: { companyId, date: utc(y, m, d) } }, update: {}, create: { companyId, name, date: utc(y, m, d) } });
  }

  // ---- leave ----
  // Each leave type gets its own colour (readable with white text) so calendars and balances are scannable.
  const LT = [
    { c: 'ANNUAL', name: 'Annual Leave', days: 20, paid: true, color: '#2563eb' },
    { c: 'SICK', name: 'Sick Leave', days: 10, paid: true, color: '#dc2626' },
    { c: 'CASUAL', name: 'Casual Leave', days: 10, paid: true, color: '#7c3aed' },
    { c: 'UNPAID', name: 'Unpaid Leave', days: 0, paid: false, color: '#6b7280' },
    { c: 'MATERNITY', name: 'Maternity Leave', days: 90, paid: true, color: '#db2777' },
    { c: 'PATERNITY', name: 'Paternity Leave', days: 7, paid: true, color: '#0d9488' },
  ] as const;
  const ltId = new Map<string, string>();
  for (const t of LT) {
    const row = await prisma.leaveType.upsert({
      where: { companyId_code: { companyId, code: t.c } }, update: {},
      create: { companyId, name: t.name, code: t.c, color: t.color, isPaid: t.paid, maxDaysPerYear: t.days, carryForwardDays: t.c === 'ANNUAL' ? 5 : 0, allowHalfDay: !['MATERNITY', 'PATERNITY'].includes(t.c) },
    });
    ltId.set(t.c, row.id);
  }
  await prisma.leavePolicy.upsert({ where: { companyId }, update: {}, create: { companyId, minNoticeDays: 1 } });

  const weekdaysBetween = (s: Date, e: Date) => { let n = 0; for (let d = s; d <= e; d = addDays(d, 1)) if (!isWeekend(d)) n += 1; return n; };
  type LeaveRow = Prisma.LeaveRequestCreateManyInput;
  const leaves: LeaveRow[] = [];
  const approvedLeaveByEmp = new Map<number, Array<[Date, Date]>>();
  const statusPool = ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'PENDING', 'PENDING', 'REJECTED', 'CANCELLED'] as const;
  for (let i = 1; i <= 60; i += 1) {
    const p = pick(PEOPLE);
    let type = pick(['ANNUAL', 'ANNUAL', 'SICK', 'SICK', 'CASUAL', 'CASUAL', 'UNPAID']);
    if (i === 58 || i === 59) type = 'MATERNITY';
    if (i === 60) type = 'PATERNITY';
    let person = p;
    if (type === 'MATERNITY') person = PEOPLE.filter((x) => x.gender === 'FEMALE')[i - 58]!;
    if (type === 'PATERNITY') person = PEOPLE.find((x) => x.n === 12)!;
    const length = type === 'MATERNITY' ? 90 : type === 'PATERNITY' ? 7 : type === 'SICK' ? between(1, 3) : between(1, 5);
    // spread: ~55% in the last 90 days, ~45% in the next 30 days; maternity/paternity start soon after today
    const start = type === 'MATERNITY' || type === 'PATERNITY' ? addDays(TODAY, between(20, 40)) : addDays(TODAY, between(-90, 30));
    const end = addDays(start, length - 1);
    let status: (typeof statusPool)[number] = type === 'MATERNITY' || type === 'PATERNITY' ? (i % 2 ? 'APPROVED' : 'PENDING') : pick(statusPool);
    if (start > TODAY && status === 'APPROVED' && chance(0.3)) status = 'PENDING';
    const manager = managerOf(person) ?? 1;
    const days = type === 'MATERNITY' || type === 'PATERNITY' ? length : weekdaysBetween(start, end);
    if (days === 0) { i -= 1; continue; }
    const reviewed = status === 'APPROVED' || status === 'REJECTED';
    leaves.push({
      id: `${P}-leave-${pad(i)}`, companyId, employeeId: empId.get(person.n)!, leaveTypeId: ltId.get(type)!,
      startDate: start, endDate: end, dayType: 'FULL_DAY', days, status,
      reason: `${type.charAt(0)}${type.slice(1).toLowerCase()} leave request (demo)`,
      reviewedBy: reviewed ? userId.get(manager)! : null, reviewedAt: reviewed ? addDays(start, -2) : null,
      reviewNotes: status === 'REJECTED' ? 'Project deadline - please reschedule.' : null,
    });
    if (status === 'APPROVED') {
      const list = approvedLeaveByEmp.get(person.n) ?? [];
      list.push([start, end]);
      approvedLeaveByEmp.set(person.n, list);
    }
  }
  await prisma.leaveRequest.createMany({ data: leaves, skipDuplicates: true });
  const balances: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const p of PEOPLE) {
    for (const t of LT) {
      if (t.days === 0) continue;
      if (t.c === 'MATERNITY' && p.gender !== 'FEMALE') continue;
      if (t.c === 'PATERNITY' && p.gender !== 'MALE') continue;
      const mine = leaves.filter((l) => l.employeeId === empId.get(p.n) && l.leaveTypeId === ltId.get(t.c));
      balances.push({
        id: `${P}-lb-${p.n}-${t.c}`, companyId, employeeId: empId.get(p.n)!, leaveTypeId: ltId.get(t.c)!, year: 2026, entitled: t.days,
        used: mine.filter((l) => l.status === 'APPROVED').reduce((s, l) => s + l.days, 0),
        pending: mine.filter((l) => l.status === 'PENDING').reduce((s, l) => s + l.days, 0),
      });
    }
  }
  await prisma.leaveBalance.createMany({ data: balances, skipDuplicates: true });

  // ---- attendance: previous 30 days (up to yesterday), all 40 employees ----
  const attendance: Prisma.AttendanceRecordCreateManyInput[] = [];
  const holidays = new Set(['20260323', '20260501', '20260814', '20261225']);
  for (const p of PEOPLE) {
    for (let back = 30; back >= 1; back -= 1) {
      const day = addDays(TODAY, -back);
      const base = { id: `${P}-att-${p.n}-${ymd(day)}`, companyId, employeeId: empId.get(p.n)!, date: day, shiftId: shift.id };
      if (isWeekend(day)) { attendance.push({ ...base, status: 'WEEKEND', source: 'SYSTEM' }); continue; }
      if (holidays.has(ymd(day))) { attendance.push({ ...base, status: 'HOLIDAY', source: 'SYSTEM' }); continue; }
      if ((approvedLeaveByEmp.get(p.n) ?? []).some(([s, e]) => day >= s && day <= e)) { attendance.push({ ...base, status: 'ON_LEAVE', source: 'SYSTEM' }); continue; }
      const r = rnd();
      if (r < 0.03) { attendance.push({ ...base, status: 'ABSENT', source: 'MANUAL', notes: 'Absent without notice (demo)' }); continue; }
      let status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'REMOTE' = 'PRESENT';
      let inH = 9, inM = between(0, 12), outH = 18, outM = between(0, 20), late = 0;
      if (r < 0.12) { status = 'LATE'; inH = 9; inM = between(20, 55); late = inM - 15; }
      else if (r < 0.16) { status = 'HALF_DAY'; inH = 9; inM = between(0, 10); outH = 13; outM = between(0, 30); }
      else if (r < 0.27) status = 'REMOTE';
      const checkIn = pkt(day, inH, inM);
      let checkOut = pkt(day, outH, outM);
      const wantsOvertime = status !== 'HALF_DAY' && ['Software Development', 'Quality Assurance'].includes(p.dept) && chance(0.15);
      if (wantsOvertime) checkOut = pkt(day, 18, between(45, 59) + 60);
      const work = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000) - (status === 'HALF_DAY' ? 0 : 60));
      attendance.push({ ...base, status, source: status === 'REMOTE' ? 'MANUAL' : 'CLOCK', checkInAt: checkIn, checkOutAt: checkOut, workMinutes: work, lateMinutes: late, overtimeMinutes: wantsOvertime ? Math.max(0, work - 480) : 0 });
    }
  }
  await prisma.attendanceRecord.createMany({ data: attendance, skipDuplicates: true });

  // ---- payroll: previous 3 months ----
  const comps = [
    { c: 'HOUSING', name: 'Housing Allowance', kind: 'ALLOWANCE', v: 0.2 }, { c: 'MEDICAL', name: 'Medical Allowance', kind: 'ALLOWANCE', v: 0.08 },
    { c: 'TRANSPORT', name: 'Transport Allowance', kind: 'ALLOWANCE', v: 0.07 }, { c: 'OTHER', name: 'Other Allowance', kind: 'ALLOWANCE', v: 0.05 },
    { c: 'BONUS', name: 'Performance Bonus', kind: 'BONUS', v: 0 }, { c: 'OVERTIME', name: 'Overtime Pay', kind: 'BONUS', v: 0 },
    { c: 'INCOME_TAX', name: 'Income Tax', kind: 'TAX', v: 0 }, { c: 'PROVIDENT', name: 'Provident Fund', kind: 'DEDUCTION', v: 0.02 },
  ] as const;
  const compId = new Map<string, string>();
  for (const c of comps) {
    const row = await prisma.salaryComponent.upsert({
      where: { companyId_code: { companyId, code: c.c } }, update: {},
      // FIXED: each employee's rupee amount is stored on their salary structure item, and the payroll
      // engine reads a PERCENT_OF_BASIC item value as a percentage (so rupee amounts there would balloon).
      create: { companyId, name: c.name, code: c.c, kind: c.kind, calcType: 'FIXED', defaultValue: 0, isTaxable: c.kind !== 'DEDUCTION' },
    });
    compId.set(c.c, row.id);
  }
  for (const p of PEOPLE) {
    const pay = pays.get(p.n)!;
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: empId.get(p.n)! }, select: { joinDate: true, bankName: true, bankAccount: true } });
    const s = await prisma.salaryStructure.upsert({
      where: { id: `${P}-ss-${p.n}` }, update: {},
      create: { id: `${P}-ss-${p.n}`, companyId, employeeId: empId.get(p.n)!, basicSalary: pay.basic, currency: 'PKR', effectiveFrom: e.joinDate ?? utc(2026, 1, 1), bankName: e.bankName, bankAccount: e.bankAccount },
    });
    await prisma.salaryStructureItem.createMany({
      data: [['HOUSING', pay.housing], ['MEDICAL', pay.medical], ['TRANSPORT', pay.transport], ['OTHER', pay.other], ['PROVIDENT', pay.otherDed]].map(([c, v]) => ({ id: `${P}-ssi-${p.n}-${c}`, salaryStructureId: s.id, componentId: compId.get(c as string)!, value: v as number })),
      skipDuplicates: true,
    });
  }
  const months = [[2026, 8], [2026, 9], [2026, 10]] as const;
  const MONTH_NAME = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const bonusPeople = new Map<string, Set<number>>();
  for (const [y, m] of months) bonusPeople.set(`${y}${m}`, new Set(Array.from({ length: m === 8 ? 0 : 7 }, () => between(7, 40))));
  for (const [y, m] of months) {
    const key = `${y}${pad(m, 2)}`;
    const run = await prisma.payrollRun.upsert({
      where: { companyId_year_month: { companyId, year: y, month: m } }, update: {},
      create: { id: `${P}-run-${key}`, companyId, year: y, month: m, title: `Payroll ${MONTH_NAME[m]} ${y}`, status: 'PAID', processedAt: utc(y, m, 25), approvedAt: utc(y, m, 26), approvedBy: userId.get(1)!, paidAt: utc(y, m, 28) },
    });
    for (const p of PEOPLE) {
      const pay = pays.get(p.n)!;
      const bonus = bonusPeople.get(`${y}${m}`)!.has(p.n) ? round(pay.basic * (between(5, 15) / 100)) : 0;
      const overtime = ['Software Development', 'Quality Assurance'].includes(p.dept) && chance(0.4) ? round((pay.basic / 176) * 1.5 * between(2, 10)) : 0;
      const allowances = pay.housing + pay.medical + pay.transport + pay.other;
      const gross = pay.basic + allowances + bonus + overtime;
      const tax = monthlyTax(gross);
      const net = gross - tax - pay.otherDed;
      const e = await prisma.payrollEntry.upsert({
        where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: empId.get(p.n)! } }, update: {},
        create: { id: `${P}-pe-${key}-${p.n}`, companyId, payrollRunId: run.id, employeeId: empId.get(p.n)!, basicSalary: pay.basic, totalAllowances: allowances, totalBonuses: bonus + overtime, totalDeductions: pay.otherDed, totalTax: tax, grossPay: gross, netPay: net },
      });
      const lines: Prisma.PayrollEntryLineCreateManyInput[] = [
        { id: `${e.id}-l1`, payrollEntryId: e.id, componentId: compId.get('HOUSING')!, kind: 'ALLOWANCE', label: 'Housing Allowance', amount: pay.housing },
        { id: `${e.id}-l2`, payrollEntryId: e.id, componentId: compId.get('MEDICAL')!, kind: 'ALLOWANCE', label: 'Medical Allowance', amount: pay.medical },
        { id: `${e.id}-l3`, payrollEntryId: e.id, componentId: compId.get('TRANSPORT')!, kind: 'ALLOWANCE', label: 'Transport Allowance', amount: pay.transport },
        { id: `${e.id}-l4`, payrollEntryId: e.id, componentId: compId.get('OTHER')!, kind: 'ALLOWANCE', label: 'Other Allowance', amount: pay.other },
        { id: `${e.id}-l5`, payrollEntryId: e.id, componentId: compId.get('INCOME_TAX')!, kind: 'TAX', label: 'Income Tax', amount: tax },
        { id: `${e.id}-l6`, payrollEntryId: e.id, componentId: compId.get('PROVIDENT')!, kind: 'DEDUCTION', label: 'Provident Fund', amount: pay.otherDed },
        ...(bonus ? [{ id: `${e.id}-l7`, payrollEntryId: e.id, componentId: compId.get('BONUS')!, kind: 'BONUS' as const, label: 'Performance Bonus', amount: bonus }] : []),
        ...(overtime ? [{ id: `${e.id}-l8`, payrollEntryId: e.id, componentId: compId.get('OVERTIME')!, kind: 'BONUS' as const, label: 'Overtime Pay', amount: overtime }] : []),
      ];
      await prisma.payrollEntryLine.createMany({ data: lines, skipDuplicates: true });
      await prisma.payslip.upsert({
        where: { payrollEntryId: e.id }, update: {},
        create: { id: `${P}-ps-${key}-${p.n}`, companyId, employeeId: empId.get(p.n)!, payrollEntryId: e.id, year: y, month: m, basicSalary: pay.basic, totalAllowances: allowances, totalBonuses: bonus + overtime, totalDeductions: pay.otherDed, totalTax: tax, grossPay: gross, netPay: net, currency: 'PKR', status: 'PAID', generatedAt: utc(y, m, 26), paidAt: utc(y, m, 28) },
      });
    }
  }

  // ---- recruitment ----
  const JOBS: Array<[string, string, string, number, number]> = [
    ['Senior Angular Developer', D.DEV, 'Senior Angular Developer', 4, 150_000], ['Node.js Developer', D.DEV, 'Node.js Developer', 4, 110_000],
    ['React Developer', D.DEV, 'React Developer', 4, 110_000], ['QA Automation Engineer', D.QA, 'Automation Tester', 5, 100_000],
    ['UI/UX Designer', D.UX, 'UI Designer', 1, 90_000], ['DevOps Engineer', D.DEV, 'DevOps Engineer', 4, 130_000],
    ['Python Developer', D.DEV, 'Python Developer', 4, 110_000], ['Business Development Executive', D.SALES, 'Business Development Executive', 1, 80_000],
    ['Digital Marketing Specialist', D.MKT, 'Digital Marketing Specialist', 6, 85_000], ['HR Executive', D.HR, 'HR Operations Officer', 1, 85_000],
  ];
  const statuses = ['OPEN', 'OPEN', 'OPEN', 'OPEN', 'OPEN', 'ON_HOLD', 'OPEN', 'OPEN', 'CLOSED', 'OPEN'] as const;
  const jobIds: string[] = [];
  for (const [i, [title, dept, desig, mgr, base]] of JOBS.entries()) {
    const job = await prisma.jobOpening.upsert({
      where: { companyId_code: { companyId, code: `JOB-${pad(i + 1)}` } }, update: {},
      create: { companyId, title, code: `JOB-${pad(i + 1)}`, description: `${title} for Quantum Tech Solutions (demo posting).`, requirements: 'Relevant experience and strong communication skills (demo).', employmentType: 'FULL_TIME', location: 'Lahore, Pakistan', openings: between(1, 2), status: statuses[i]!, departmentId: deptId.get(dept)!, designationId: desigId.get(desig) ?? null, branchId: branch.id, hiringManagerId: empId.get(mgr)!, salaryMin: base, salaryMax: round(base * 1.4), currency: 'PKR', publishedAt: addDays(TODAY, -between(10, 60)), closedAt: statuses[i] === 'CLOSED' ? addDays(TODAY, -5) : null },
    });
    jobIds.push(job.id);
  }
  const FIRST = ['Imran', 'Sadia', 'Faisal', 'Nimra', 'Kamran', 'Hina', 'Tayyab', 'Areeba', 'Zeeshan', 'Bushra', 'Owais', 'Samina', 'Danish', 'Alina', 'Yasir', 'Komal', 'Rafay', 'Mehwish', 'Junaid', 'Sidra'];
  const LAST = ['Butt', 'Chaudhry', 'Mirza', 'Qureshi', 'Siddiqui', 'Rehman', 'Baig', 'Hashmi', 'Niazi', 'Lodhi'];
  const candIds: string[] = [];
  for (let i = 0; i < 20; i += 1) {
    const email = `${FIRST[i]!.toLowerCase()}.${LAST[i % 10]!.toLowerCase()}@candidates.demo`;
    const c = await prisma.candidate.upsert({
      where: { companyId_email: { companyId, email } }, update: {},
      create: { companyId, firstName: FIRST[i]!, lastName: LAST[i % 10]!, email, phone: `0333-000${pad(i + 1, 4)}`, source: pick(['LinkedIn', 'Referral', 'Rozee.pk', 'Company Website']), currentTitle: JOBS[i % 10]![0], currentCompany: 'Demo Employer', yearsExperience: between(1, 9), screeningScore: between(55, 95) },
    });
    candIds.push(c.id);
  }
  const appStatuses = ['APPLIED', 'SCREENING', 'INTERVIEW', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const;
  const apps: Array<{ id: string; status: (typeof appStatuses)[number]; jobIdx: number }> = [];
  for (let i = 0; i < 30; i += 1) {
    const jobIdx = i % 10;
    // Three rounds over the 10 jobs; (job, round) -> candidate is always distinct, giving 30 unique pairs.
    const candIdx = (jobIdx * 2 + Math.floor(i / 10) * 7) % 20;
    const status = appStatuses[i % appStatuses.length]!;
    const id = `${P}-app-${pad(i + 1)}`;
    await prisma.jobApplication.upsert({
      where: { jobOpeningId_candidateId: { jobOpeningId: jobIds[jobIdx]!, candidateId: candIds[candIdx]! } }, update: {},
      create: { id, companyId, jobOpeningId: jobIds[jobIdx]!, candidateId: candIds[candIdx]!, status, appliedAt: addDays(TODAY, -between(5, 50)), rejectionReason: status === 'REJECTED' ? 'Profile did not match requirements (demo).' : null },
    });
    const real = await prisma.jobApplication.findUniqueOrThrow({ where: { jobOpeningId_candidateId: { jobOpeningId: jobIds[jobIdx]!, candidateId: candIds[candIdx]! } }, select: { id: true } });
    apps.push({ id: real.id, status, jobIdx });
  }
  const interviewable = apps.filter((a) => ['INTERVIEW', 'OFFER', 'HIRED'].includes(a.status)).slice(0, 10);
  for (const [i, a] of interviewable.entries()) {
    const done = a.status !== 'INTERVIEW' || i % 2 === 0;
    await prisma.interview.upsert({
      where: { id: `${P}-int-${pad(i + 1)}` }, update: {},
      create: { id: `${P}-int-${pad(i + 1)}`, companyId, applicationId: a.id, type: pick(['TECHNICAL', 'HR', 'VIDEO', 'ONSITE'] as const), status: done ? 'COMPLETED' : 'SCHEDULED', scheduledAt: pkt(addDays(TODAY, done ? -between(2, 20) : between(1, 10)), between(10, 16), pick([0, 30])), durationMinutes: 60, locationOrLink: 'Lahore Head Office / video link (demo)', interviewerId: empId.get(JOBS[a.jobIdx]![3])!, rating: done ? between(3, 5) : null, feedback: done ? pick(['Strong technical skills and clear communication.', 'Good fit; needs a little ramp-up on our stack.', 'Excellent problem solving; recommend moving forward.']) : null },
    });
  }
  for (const [i, a] of apps.filter((x) => x.status === 'OFFER' || x.status === 'HIRED').entries()) {
    await prisma.jobOffer.upsert({
      where: { applicationId: a.id }, update: {},
      create: { id: `${P}-offer-${pad(i + 1)}`, companyId, applicationId: a.id, status: a.status === 'HIRED' ? 'ACCEPTED' : 'SENT', title: JOBS[a.jobIdx]![0], salary: round(JOBS[a.jobIdx]![4] * 1.1), currency: 'PKR', startDate: addDays(TODAY, between(14, 45)), expiresAt: addDays(TODAY, 14), sentAt: addDays(TODAY, -7), respondedAt: a.status === 'HIRED' ? addDays(TODAY, -3) : null },
    });
  }

  // ---- performance: Q3 2026 closed cycle with reviews for all 40; Q4 2026 active cycle ----
  const cycleQ3 = await prisma.reviewCycle.upsert({ where: { id: `${P}-cycle-2026q3` }, update: {}, create: { id: `${P}-cycle-2026q3`, companyId, name: 'Q3 2026 Performance Review', year: 2026, startDate: utc(2026, 7, 1), endDate: utc(2026, 9, 30), status: 'CLOSED' } });
  await prisma.reviewCycle.upsert({ where: { id: `${P}-cycle-2026q4` }, update: {}, create: { id: `${P}-cycle-2026q4`, companyId, name: 'Q4 2026 Performance Review', year: 2026, startDate: utc(2026, 10, 1), endDate: utc(2026, 12, 31), status: 'ACTIVE' } });
  const KPIS = [['DELIVERY', 'On-time Delivery', '%', 90], ['QUALITY', 'Quality Score', '%', 95], ['COLLAB', 'Collaboration Score', 'pts', 4], ['LEARNING', 'Learning Hours', 'hrs', 20], ['TARGET', 'Target Achievement', '%', 100]] as const;
  const kpiId = new Map<string, string>();
  for (const [c, name, unit, target] of KPIS) {
    const k = await prisma.performanceKpi.upsert({ where: { companyId_code: { companyId, code: c } }, update: {}, create: { companyId, code: c, name, unit, targetDefault: target } });
    kpiId.set(c, k.id);
  }
  const label = (s: number) => (s >= 4.5 ? 'Exceeds Expectations' : s >= 3.5 ? 'Meets Expectations' : s >= 2.5 ? 'Needs Improvement' : 'Below Expectations');
  const goals: Prisma.PerformanceGoalCreateManyInput[] = [];
  const empKpis: Prisma.EmployeeKpiCreateManyInput[] = [];
  const reviews: Prisma.PerformanceReviewCreateManyInput[] = [];
  const feedback: Prisma.PerformanceFeedbackCreateManyInput[] = [];
  for (const p of PEOPLE) {
    const emp = empId.get(p.n)!;
    const overall = Math.round((p.n === 7 ? 4.5 : Math.min(5, Math.max(1, 2.6 + rnd() * 2.4))) * 10) / 10;
    const self = Math.min(5, Math.round((overall + (rnd() * 0.8 - 0.2)) * 10) / 10);
    const mgr = managerOf(p) ?? 1;
    reviews.push({ id: `${P}-rev-${p.n}`, companyId, cycleId: cycleQ3.id, employeeId: emp, reviewerId: empId.get(mgr)!, status: 'COMPLETED', selfRating: self, managerRating: overall, overallRating: overall, selfComments: 'I met most of my quarterly goals and focused on quality and teamwork (demo).', managerComments: `${label(overall)}. Consistent contribution this quarter (demo).`, submittedAt: utc(2026, 10, 5), acknowledgedAt: utc(2026, 10, 9) });
    feedback.push({ id: `${P}-fb-${p.n}`, companyId, fromEmployeeId: empId.get(mgr)!, toEmployeeId: emp, type: 'MANAGER', rating: overall, content: `Quarterly manager feedback: ${label(overall)} (demo).`, reviewId: `${P}-rev-${p.n}` });
    for (const [gi, title] of [`Deliver Q4 objectives for ${p.dept}`, 'Complete one professional development course'].entries()) {
      goals.push({ id: `${P}-goal-${p.n}-${gi + 1}`, companyId, employeeId: emp, title, description: 'Quarterly goal (demo).', targetValue: 100, currentValue: between(20, 90), unit: '%', progress: between(20, 90), priority: gi === 0 ? 'HIGH' : 'MEDIUM', status: 'ACTIVE', startDate: utc(2026, 10, 1), dueDate: utc(2026, 12, 31) });
    }
    for (const k of ['DELIVERY', 'QUALITY'] as const) {
      const target = k === 'DELIVERY' ? 90 : 95;
      const actual = Math.min(100, target - 10 + between(0, 18));
      empKpis.push({ id: `${P}-ek-${p.n}-${k}`, companyId, employeeId: emp, kpiId: kpiId.get(k)!, year: 2026, quarter: 3, targetValue: target, actualValue: actual, score: Math.round((actual / target) * 50) / 10 });
    }
  }
  await prisma.performanceReview.createMany({ data: reviews, skipDuplicates: true });
  await prisma.performanceFeedback.createMany({ data: feedback, skipDuplicates: true });
  await prisma.performanceGoal.createMany({ data: goals, skipDuplicates: true });
  await prisma.employeeKpi.createMany({ data: empKpis, skipDuplicates: true });

  // ---- assets ----
  const assets: Prisma.AssetCreateManyInput[] = [];
  let a = 0;
  const addAsset = (type: string, brand: string, model: string, cost: number, owner: number | null, status = owner ? 'ASSIGNED' : 'AVAILABLE') => {
    a += 1;
    assets.push({ id: `${P}-asset-${pad(a)}`, companyId, assetCode: `QTS-AST-${pad(a)}`, assetType: type, brand, model, serialNumber: `DEMO-SN-${pad(a, 5)}`, purchaseDate: utc(between(2022, 2026), between(1, 12), between(1, 28)), purchaseCost: cost, assignedEmployeeId: owner ? empId.get(owner)! : null, status });
  };
  for (const p of PEOPLE) addAsset('Laptop', pick(['Dell', 'Lenovo', 'HP']), pick(['Latitude 5440', 'ThinkPad T14', 'EliteBook 840']), between(180, 320) * 1000, p.n);
  for (const p of PEOPLE.filter((x) => [D.DEV, D.QA, D.UX].includes(x.dept as never))) addAsset('Monitor', pick(['Dell', 'LG', 'Samsung']), '24-inch FHD', between(30, 55) * 1000, p.n);
  for (const n of [1, 2, 3, 39, 40]) addAsset('Desktop Computer', 'HP', 'ProDesk 400', between(110, 160) * 1000, n);
  for (const p of PEOPLE.slice(0, 20)) addAsset('Keyboard & Mouse', 'Logitech', 'MK270', 6000, p.n);
  for (const n of [1, 4, 5, 6, 34, 35, 36]) addAsset('Mobile Phone', pick(['Samsung', 'Xiaomi']), pick(['Galaxy A54', 'Redmi Note 12']), between(60, 110) * 1000, n);
  for (const n of [3, 29, 30, 34, 35, 38]) addAsset('Headset', 'Jabra', 'Evolve 20', 18000, n);
  addAsset('Office Equipment', 'Canon', 'imageRUNNER Printer', 145000, null, 'AVAILABLE');
  addAsset('Office Equipment', 'Epson', 'Projector EB-X06', 95000, null, 'IN_REPAIR');
  addAsset('Office Equipment', 'Polycom', 'Conference Phone', 60000, null, 'AVAILABLE');
  await prisma.asset.createMany({ data: assets, skipDuplicates: true });

  // ---- announcements ----
  const ANN: Array<[string, string, string?]> = [
    ['Annual Leave Policy Update', 'Annual leave requests must now be submitted at least one working day in advance.'],
    ['Company Holiday Announcement', 'The office will be closed on 25 December for Quaid-e-Azam Day.'],
    ['Work From Home Policy', 'Employees may work from home up to two days per week with manager approval.'],
    ['Security Awareness Training', 'All employees must complete the security awareness module this month.'],
    ['Performance Review Cycle', 'The Q4 2026 performance review cycle is now open. Please update your goals.'],
    ['Salary Disbursement Notice', 'Salaries are disbursed on the 28th of each month.'],
    ['Office Maintenance', 'Planned maintenance on Saturday; please remove personal items from desks.', D.FIN],
    ['New Employee Welcome', 'Please join us in welcoming our newest team members this quarter.'],
    ['Company Town Hall', 'Quarterly town hall: Friday 4:00 PM in the main conference room.'],
    ['Health & Safety Reminder', 'Know your emergency exits and report hazards to Administration.', D.FIN],
  ];
  await prisma.announcement.createMany({
    data: ANN.map(([title, body, dept], i) => ({ id: `${P}-ann-${pad(i + 1)}`, companyId, title, body, audience: dept ? 'DEPARTMENT' : 'COMPANY', departmentId: dept ? deptId.get(dept)! : null, publishedAt: addDays(TODAY, -(i * 4 + 1)), createdById: userId.get(2)! })),
    skipDuplicates: true,
  });

  // ---- optional platform admin ----
  const platformEmail = (process.env.PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (platformEmail) {
    let pu = await prisma.user.findUnique({ where: { email: platformEmail } });
    if (pu && pu.companyId) throw new Error('PLATFORM_ADMIN_EMAIL belongs to a company user');
    if (!pu) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      let pw = '';
      for (let i = 0; i < 16; i += 1) pw += alphabet[randomInt(alphabet.length)];
      pw += '#9';
      pu = await prisma.user.create({ data: { email: platformEmail, passwordHash: await hash(pw, 12), firstName: 'Platform', lastName: 'Admin', status: 'ACTIVE', emailVerifiedAt: new Date() } });
      credentials.push(`PLATFORM,${platformEmail},${PLATFORM_ROLE.code},${pw}`);
    }
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: pu.id, roleId: need(PLATFORM_ROLE.code) } }, update: {}, create: { userId: pu.id, roleId: need(PLATFORM_ROLE.code) } });
  }

  if (process.env.QTS_CREDENTIALS_FILE && credentials.length > 1) {
    writeFileSync(process.env.QTS_CREDENTIALS_FILE, credentials.join('\n') + '\n', { mode: 0o600 });
    console.log(`Wrote ${credentials.length - 1} new login(s) to the credentials file.`);
  } else if (credentials.length > 1) {
    console.log(`${credentials.length - 1} new login(s) created but QTS_CREDENTIALS_FILE is not set, so passwords were not saved.`);
  }

  const count = async (m: string) => (prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[m]!.count({ where: { companyId } });
  const tables = ['user', 'employee', 'department', 'designation', 'attendanceRecord', 'leaveRequest', 'leaveBalance', 'payrollRun', 'payrollEntry', 'payslip', 'jobOpening', 'candidate', 'jobApplication', 'interview', 'jobOffer', 'performanceGoal', 'performanceKpi', 'employeeKpi', 'reviewCycle', 'performanceReview', 'performanceFeedback', 'asset', 'announcement'];
  console.log(`Company ${company.name} (${SLUG}) — new users this run: ${usersCreated}`);
  for (const t of tables) console.log(`  ${t.padEnd(20)} ${await count(t)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
