import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
const BOOT_EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const BOOT_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
if (!BOOT_EMAIL || BOOT_PASSWORD.length < 12) {
    console.error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (min 12 chars).');
    process.exit(1);
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const ROLES = [
    { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full platform access' },
    { code: 'HR_ADMIN', name: 'HR Admin', description: 'Full HR administration' },
    { code: 'HR_MANAGER', name: 'HR Manager', description: 'HR operations management' },
    { code: 'RECRUITER', name: 'Recruiter', description: 'Recruitment pipeline access' },
    { code: 'MANAGER', name: 'Manager', description: 'Team management access' },
    { code: 'EMPLOYEE', name: 'Employee', description: 'Self-service employee access' },
];
const ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT', 'MANAGE'];
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
];
/** Permission codes granted per role (roles:manage is Super Admin only). */
const ROLE_PERMISSION_CODES = {
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
async function grantPermissions(roleId, permissionIds) {
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
async function seed() {
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
        }
        else {
            permissions = grant
                .map((code) => permissionByCode.get(code))
                .filter((p) => Boolean(p));
        }
        // Replace role permissions so re-seed corrects matrices
        await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await grantPermissions(role.id, permissions.map((p) => p.id));
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
            storageProvider: 'cloudinary',
            system: {
                maintenanceMode: false,
                allowSelfRegistration: false,
                defaultTimezone: 'Asia/Karachi',
                defaultLocale: 'en-US',
            },
            integrations: {},
        },
    });
    await prisma.companySecurityPolicy.upsert({
        where: { companyId: 'seed-company-zenith' },
        update: {},
        create: {
            companyId: 'seed-company-zenith',
            maxFailedLogins: 5,
            lockoutMinutes: 15,
            passwordMinLength: 8,
            passwordRequireLetter: true,
            passwordRequireNumber: true,
            passwordRequireSpecial: false,
            requireMfaForPrivileged: false,
            allowSelfRegistration: false,
        },
    });
    const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    const { hash } = await import('bcryptjs');
    const passwordHash = await hash(BOOT_PASSWORD, 12);
    const existing = await prisma.user.findUnique({ where: { email: BOOT_EMAIL } });
    if (existing) {
        console.log('Admin already exists; password left unchanged.');
    }
    const admin = existing ?? await prisma.user.create({
        data: {
            email: BOOT_EMAIL,
            passwordHash,
            firstName: 'System',
            lastName: 'Admin',
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
            companyId: 'seed-company-zenith',
        },
    });
    await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: superAdminRole.id },
    });
    console.log('Bootstrap complete.');
}
seed()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
