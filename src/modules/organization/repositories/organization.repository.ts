import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { normalizeCidr } from '../../../utils/ip-matcher.js';
import type {
  CreateBranchInput,
  CreateDepartmentInput,
  CreateDesignationInput,
  CreateTeamInput,
  UpdateBranchInput,
  UpdateDepartmentInput,
  UpdateDesignationInput,
  UpdateTeamInput,
} from '../validators/organization.validators.js';

const notDeleted = { deletedAt: null };

const branchInclude = {
  allowedIps: {
    where: { isActive: true },
    select: { id: true, cidr: true, label: true },
    orderBy: { cidr: 'asc' as const },
  },
} satisfies Prisma.BranchInclude;

export class OrganizationRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true, firstName: true, lastName: true },
    });
  }

  findCompany(companyId: string) {
    return prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, name: true, legalName: true },
    });
  }

  countBranches(companyId: string) {
    return prisma.branch.count({ where: { companyId, ...notDeleted } });
  }

  countDepartments(companyId: string) {
    return prisma.department.count({ where: { companyId, ...notDeleted } });
  }

  countTeams(companyId: string) {
    return prisma.team.count({ where: { companyId, ...notDeleted } });
  }

  countDesignations(companyId: string) {
    return prisma.designation.count({ where: { companyId, ...notDeleted } });
  }

  listBranches(companyId: string) {
    return prisma.branch.findMany({
      where: { companyId, ...notDeleted },
      include: branchInclude,
      orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
    });
  }

  findBranch(companyId: string, id: string) {
    return prisma.branch.findFirst({
      where: { id, companyId, ...notDeleted },
      include: branchInclude,
    });
  }

  async syncBranchAllowedIps(branchId: string, allowedIps?: string[]) {
    if (allowedIps === undefined) {
      return;
    }

    const normalized = [...new Set(allowedIps.map((ip) => normalizeCidr(ip)))];
    await prisma.$transaction(async (tx) => {
      await tx.branchAllowedIp.deleteMany({ where: { branchId } });
      if (normalized.length) {
        await tx.branchAllowedIp.createMany({
          data: normalized.map((cidr) => ({ branchId, cidr })),
        });
      }
    });
  }

  createBranch(companyId: string, data: CreateBranchInput) {
    return prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          companyId,
          name: data.name,
          code: data.code.trim().toUpperCase(),
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          country: data.country ?? null,
          postalCode: data.postalCode ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          isHeadOffice: data.isHeadOffice ?? false,
          isActive: data.isActive ?? true,
        },
      });

      if (data.allowedIps?.length) {
        const normalized = [...new Set(data.allowedIps.map((ip) => normalizeCidr(ip)))];
        await tx.branchAllowedIp.createMany({
          data: normalized.map((cidr) => ({ branchId: branch.id, cidr })),
        });
      }

      return tx.branch.findUniqueOrThrow({
        where: { id: branch.id },
        include: branchInclude,
      });
    });
  }

  updateBranch(id: string, data: UpdateBranchInput) {
    return prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
          ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
          ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
          ...(data.city !== undefined ? { city: data.city } : {}),
          ...(data.state !== undefined ? { state: data.state } : {}),
          ...(data.country !== undefined ? { country: data.country } : {}),
          ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.isHeadOffice !== undefined ? { isHeadOffice: data.isHeadOffice } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        },
      });

      if (data.allowedIps !== undefined) {
        const normalized = [...new Set(data.allowedIps.map((ip) => normalizeCidr(ip)))];
        await tx.branchAllowedIp.deleteMany({ where: { branchId: id } });
        if (normalized.length) {
          await tx.branchAllowedIp.createMany({
            data: normalized.map((cidr) => ({ branchId: id, cidr })),
          });
        }
      }

      return tx.branch.findUniqueOrThrow({
        where: { id },
        include: branchInclude,
      });
    });
  }

  softDeleteBranch(id: string) {
    return prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countDepartmentsForBranch(companyId: string, branchId: string) {
    return prisma.department.count({
      where: { companyId, branchId, ...notDeleted },
    });
  }

  clearOtherHeadOffices(companyId: string, exceptBranchId?: string) {
    return prisma.branch.updateMany({
      where: {
        companyId,
        ...notDeleted,
        isHeadOffice: true,
        ...(exceptBranchId ? { id: { not: exceptBranchId } } : {}),
      },
      data: { isHeadOffice: false },
    });
  }

  listDepartments(companyId: string) {
    return prisma.department.findMany({
      where: { companyId, ...notDeleted },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { teams: { where: notDeleted } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findDepartment(companyId: string, id: string) {
    return prisma.department.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });
  }

  createDepartment(companyId: string, data: CreateDepartmentInput) {
    return prisma.department.create({
      data: {
        companyId,
        name: data.name,
        code: data.code.trim().toUpperCase(),
        description: data.description ?? null,
        branchId: data.branchId || null,
        parentId: data.parentId || null,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateDepartment(id: string, data: UpdateDepartmentInput) {
    return prisma.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId || null } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  softDeleteDepartment(id: string) {
    return prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  countChildDepartments(companyId: string, parentId: string) {
    return prisma.department.count({
      where: { companyId, parentId, ...notDeleted },
    });
  }

  countTeamsForDepartment(companyId: string, departmentId: string) {
    return prisma.team.count({
      where: { companyId, departmentId, ...notDeleted },
    });
  }

  getDepartmentParentId(companyId: string, id: string) {
    return prisma.department.findFirst({
      where: { id, companyId, ...notDeleted },
      select: { parentId: true },
    });
  }

  listTeams(companyId: string) {
    return prisma.team.findMany({
      where: { companyId, ...notDeleted },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  findTeam(companyId: string, id: string) {
    return prisma.team.findFirst({
      where: { id, companyId, ...notDeleted },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });
  }

  createTeam(companyId: string, data: CreateTeamInput) {
    return prisma.team.create({
      data: {
        companyId,
        departmentId: data.departmentId,
        name: data.name,
        code: data.code.trim().toUpperCase(),
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateTeam(id: string, data: UpdateTeamInput) {
    return prisma.team.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  softDeleteTeam(id: string) {
    return prisma.team.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  listDesignations(companyId: string) {
    return prisma.designation.findMany({
      where: { companyId, ...notDeleted },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  findDesignation(companyId: string, id: string) {
    return prisma.designation.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  createDesignation(companyId: string, data: CreateDesignationInput) {
    return prisma.designation.create({
      data: {
        companyId,
        name: data.name,
        code: data.code.trim().toUpperCase(),
        level: data.level ?? 1,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  updateDesignation(id: string, data: UpdateDesignationInput) {
    return prisma.designation.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.level !== undefined ? { level: data.level } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  softDeleteDesignation(id: string) {
    return prisma.designation.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  chartDepartments(companyId: string) {
    return prisma.department.findMany({
      where: { companyId, ...notDeleted, isActive: true },
      include: {
        teams: {
          where: { ...notDeleted, isActive: true },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  createAuditLog(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
  }) {
    return prisma.auditLog.create({ data: input });
  }
}
