import type { Company, Department, Location, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

export class OrganizationRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findCompanyById(id: string) {
    return prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
  }

  updateCompany(id: string, data: Prisma.CompanyUpdateInput) {
    return prisma.company.update({
      where: { id },
      data,
    });
  }

  listDepartments(companyId: string, search?: string, skip = 0, take = 20) {
    const where: Prisma.DepartmentWhereInput = {
      companyId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.department.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip,
        take,
      }),
      prisma.department.count({ where }),
    ]);
  }

  findDepartment(companyId: string, id: string) {
    return prisma.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  createDepartment(data: Prisma.DepartmentCreateInput) {
    return prisma.department.create({ data });
  }

  updateDepartment(id: string, data: Prisma.DepartmentUpdateInput) {
    return prisma.department.update({
      where: { id },
      data,
    });
  }

  softDeleteDepartment(id: string) {
    return prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  listLocations(companyId: string, search?: string, skip = 0, take = 20) {
    const where: Prisma.LocationWhereInput = {
      companyId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.location.findMany({
        where,
        orderBy: [{ isHeadquarters: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      prisma.location.count({ where }),
    ]);
  }

  findLocation(companyId: string, id: string) {
    return prisma.location.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  createLocation(data: Prisma.LocationCreateInput) {
    return prisma.location.create({ data });
  }

  updateLocation(id: string, data: Prisma.LocationUpdateInput) {
    return prisma.location.update({
      where: { id },
      data,
    });
  }

  softDeleteLocation(id: string) {
    return prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  clearHeadquarters(companyId: string, exceptId?: string) {
    return prisma.location.updateMany({
      where: {
        companyId,
        deletedAt: null,
        isHeadquarters: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isHeadquarters: false },
    });
  }

  countOrgSummary(companyId: string) {
    return prisma.$transaction([
      prisma.department.count({ where: { companyId, deletedAt: null, isActive: true } }),
      prisma.location.count({ where: { companyId, deletedAt: null, isActive: true } }),
    ]);
  }

  createAuditLog(data: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({ data });
  }
}

export type { Company, Department, Location };
