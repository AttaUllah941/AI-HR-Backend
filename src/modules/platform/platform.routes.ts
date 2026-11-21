import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { successResponse } from '../../interfaces/api-response.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requireRoles } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { uniqueCompanySlug } from '../auth/repositories/auth.repository.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../utils/app-error.js';
import { hashPassword } from '../../utils/password.js';
import { DEFAULT_SECURITY_POLICY, validatePasswordAgainstPolicy } from '../../utils/security.js';
import { RESERVED_SLUGS, SLUG_PATTERN } from '../../utils/slug.js';

/**
 * Platform administration. Only PLATFORM_SUPER_ADMIN accounts (no company of their own) can use it.
 * Company-level admins (SUPER_ADMIN / HR_MANAGER) have no access here.
 */
export const platformRouter = Router();
platformRouter.use(authMiddleware, requireRoles('PLATFORM_SUPER_ADMIN'), (req, _res, next) => {
  // Defence in depth: the role alone is not enough, a platform account belongs to no company.
  if (req.user?.companyId != null) {
    next(new ForbiddenError('Platform administration is not available to company users'));
    return;
  }
  next();
});

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');
const companyFields = {
  name: z.string().min(1).max(200),
  legalName: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  website: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(60).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: hex.optional(),
  loginMessage: z.string().max(300).optional(),
  subscriptionPlan: z.enum(['STARTER', 'GROWTH', 'ENTERPRISE']).optional(),
  subscriptionStatus: z.enum(['ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED']).optional(),
};
const createCompanySchema = z.object({
  ...companyFields,
  slug: z.string().regex(SLUG_PATTERN).min(3).max(60).optional(),
});
const updateCompanySchema = z.object(companyFields).partial();
const createAdminSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(12).max(128),
});

const companySelect = {
  id: true,
  name: true,
  slug: true,
  industry: true,
  country: true,
  city: true,
  currency: true,
  isActive: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  createdAt: true,
} as const;

async function requireCompany(id: string): Promise<void> {
  const found = await prisma.company.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!found) throw new NotFoundError('Company not found');
}

platformRouter.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const [companies, activeCompanies, users, employees] = await Promise.all([
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null, isActive: true } }),
      prisma.user.count({ where: { deletedAt: null, companyId: { not: null } } }),
      prisma.employee.count({ where: { deletedAt: null } }),
    ]);
    res.json(successResponse({ companies, activeCompanies, users, employees }, 'Platform statistics'));
  }),
);

platformRouter.get(
  '/companies',
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { ...companySelect, _count: { select: { employees: true, users: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(successResponse(rows, 'Companies'));
  }),
);

platformRouter.post(
  '/companies',
  validateBody(createCompanySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as z.infer<typeof createCompanySchema>;
    let slug: string;
    if (input.slug) {
      if (RESERVED_SLUGS.has(input.slug)) throw new ValidationError('This slug is reserved');
      const taken = await prisma.company.findUnique({ where: { slug: input.slug }, select: { id: true } });
      if (taken) throw new ConflictError('A company with this slug already exists');
      slug = input.slug;
    } else {
      slug = await uniqueCompanySlug(prisma, input.name);
    }
    const { slug: _requestedSlug, ...data } = input;
    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({ data: { ...data, slug } });
      await tx.companySecurityPolicy.create({
        data: { companyId: created.id, allowSelfRegistration: false },
      });
      return created;
    });
    res.status(201).json(successResponse(company, 'Company created'));
  }),
);

platformRouter.patch(
  '/companies/:id',
  validateBody(updateCompanySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await requireCompany(id);
    const company = await prisma.company.update({ where: { id }, data: req.body, select: companySelect });
    res.json(successResponse(company, 'Company updated'));
  }),
);

for (const [action, isActive] of [
  ['activate', true],
  ['deactivate', false],
] as const) {
  platformRouter.post(
    `/companies/:id/${action}`,
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id);
      await requireCompany(id);
      const company = await prisma.company.update({
        where: { id },
        data: { isActive },
        select: companySelect,
      });
      if (!isActive) {
        // Revoke live sessions so a deactivated tenant is locked out immediately.
        await prisma.session.updateMany({
          where: { user: { companyId: id }, status: 'ACTIVE' },
          data: { status: 'REVOKED' },
        });
      }
      res.json(successResponse(company, isActive ? 'Company activated' : 'Company deactivated'));
    }),
  );
}

platformRouter.post(
  '/companies/:id/admins',
  validateBody(createAdminSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const input = req.body as z.infer<typeof createAdminSchema>;
    await requireCompany(id);
    const policyError = validatePasswordAgainstPolicy(input.password, DEFAULT_SECURITY_POLICY);
    if (policyError) throw new ValidationError(policyError);
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictError('An account with this email already exists');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    const user = await prisma.user.create({
      data: {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        companyId: id,
        passwordHash: await hashPassword(input.password),
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        userRoles: { create: [{ roleId: role.id }] },
      },
      select: { id: true, email: true, firstName: true, lastName: true, companyId: true },
    });
    res.status(201).json(successResponse(user, 'Company administrator created'));
  }),
);

const rolePermissionsSchema = z.object({ permissionCodes: z.array(z.string().min(1)).max(500) });

// Role definitions are shared by all companies, so only the platform administrator can change them.
platformRouter.put(
  '/roles/:id/permissions',
  validateBody(rolePermissionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { permissionCodes } = req.body as z.infer<typeof rolePermissionsSchema>;
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError('Role not found');
    if (role.code === 'SUPER_ADMIN' || role.code === 'PLATFORM_SUPER_ADMIN') {
      throw new ForbiddenError('This role cannot be edited');
    }
    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    if (permissions.length !== new Set(permissionCodes).size) {
      throw new ValidationError('One or more permissions were not found');
    }
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id })) }),
    ]);
    res.json(successResponse({ roleId: id, permissionCount: permissions.length }, 'Role permissions updated'));
  }),
);
