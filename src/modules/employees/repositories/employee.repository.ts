import type { EmploymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';

const employeeInclude = {
  department: { select: { id: true, name: true, code: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export class EmployeeRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  findDepartment(companyId: string, id: string) {
    return prisma.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  findLocation(companyId: string, id: string) {
    return prisma.location.findFirst({
      where: { id, companyId, deletedAt: null },
    });
  }

  findEmployee(companyId: string, id: string) {
    return prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: employeeInclude,
    });
  }

  findByEmail(companyId: string, email: string) {
    return prisma.employee.findFirst({
      where: { companyId, email: email.toLowerCase(), deletedAt: null },
    });
  }

  list(
    companyId: string,
    options: {
      search?: string;
      departmentId?: string;
      status?: EmploymentStatus;
      skip: number;
      take: number;
      sort: 'name' | 'hireDate' | 'status' | 'department';
      order: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.departmentId ? { departmentId: options.departmentId } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { firstName: { contains: options.search, mode: 'insensitive' } },
              { lastName: { contains: options.search, mode: 'insensitive' } },
              { email: { contains: options.search, mode: 'insensitive' } },
              { position: { contains: options.search, mode: 'insensitive' } },
              { employeeNumber: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.EmployeeOrderByWithRelationInput[] = (() => {
      switch (options.sort) {
        case 'hireDate':
          return [{ hireDate: options.order }, { lastName: 'asc' }];
        case 'status':
          return [{ status: options.order }, { lastName: 'asc' }];
        case 'department':
          return [{ department: { name: options.order } }, { lastName: 'asc' }];
        default:
          return [{ lastName: options.order }, { firstName: options.order }];
      }
    })();

    return prisma.$transaction([
      prisma.employee.findMany({
        where,
        include: employeeInclude,
        orderBy,
        skip: options.skip,
        take: options.take,
      }),
      prisma.employee.count({ where }),
    ]);
  }

  listForExport(
    companyId: string,
    options: { search?: string; departmentId?: string; status?: EmploymentStatus },
  ) {
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      ...(options.departmentId ? { departmentId: options.departmentId } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { firstName: { contains: options.search, mode: 'insensitive' } },
              { lastName: { contains: options.search, mode: 'insensitive' } },
              { email: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.employee.findMany({
      where,
      include: employeeInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    });
  }

  create(data: Prisma.EmployeeCreateInput) {
    return prisma.employee.create({
      data,
      include: employeeInclude,
    });
  }

  update(id: string, data: Prisma.EmployeeUpdateInput) {
    return prisma.employee.update({
      where: { id },
      data,
      include: employeeInclude,
    });
  }

  softDelete(id: string) {
    return prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
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
