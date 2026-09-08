import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import {
  EmployeeRepository,
  type EmployeeWithRelations,
} from '../repositories/employee.repository.js';
import type {
  CreateEmployeeInput,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from '../validators/employee.validators.js';

function managerLabel(manager: EmployeeWithRelations['manager']) {
  if (!manager) {
    return null;
  }
  return `${manager.firstName} ${manager.lastName.charAt(0)}.`;
}

function toEmployeeDto(employee: EmployeeWithRelations) {
  return {
    id: employee.id,
    companyId: employee.companyId,
    userId: employee.userId,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    avatarUrl: employee.avatarUrl,
    position: employee.position,
    departmentId: employee.departmentId,
    department: employee.department,
    locationId: employee.locationId,
    location: employee.location,
    managerId: employee.managerId,
    manager: employee.manager
      ? {
          id: employee.manager.id,
          firstName: employee.manager.firstName,
          lastName: employee.manager.lastName,
          email: employee.manager.email,
          displayName: managerLabel(employee.manager),
        }
      : null,
    hireDate: employee.hireDate,
    employmentType: employee.employmentType,
    status: employee.status,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export class EmployeeService {
  constructor(private readonly repo = new EmployeeRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  private async assertRefs(
    companyId: string,
    input: { departmentId?: string | null; locationId?: string | null; managerId?: string | null },
  ) {
    if (input.departmentId) {
      const department = await this.repo.findDepartment(companyId, input.departmentId);
      if (!department) {
        throw new ValidationError('Department not found');
      }
    }
    if (input.locationId) {
      const location = await this.repo.findLocation(companyId, input.locationId);
      if (!location) {
        throw new ValidationError('Location not found');
      }
    }
    if (input.managerId) {
      const manager = await this.repo.findEmployee(companyId, input.managerId);
      if (!manager) {
        throw new ValidationError('Manager not found');
      }
    }
  }

  async list(userId: string, query: EmployeeListQuery) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.list(companyId, {
      search: query.search,
      departmentId: query.departmentId,
      status: query.status,
      skip,
      take: query.pageSize,
      sort: query.sort,
      order: query.order,
    });

    return {
      items: items.map(toEmployeeDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getById(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const employee = await this.repo.findEmployee(companyId, id);
    if (!employee) {
      throw new NotFoundError('Employee not found');
    }
    return toEmployeeDto(employee);
  }

  async create(userId: string, input: CreateEmployeeInput) {
    const companyId = await this.requireCompanyId(userId);
    await this.assertRefs(companyId, input);

    const existing = await this.repo.findByEmail(companyId, input.email);
    if (existing) {
      throw new ConflictError('An employee with this email already exists');
    }

    if (input.managerId === undefined) {
      // no-op
    }

    try {
      const employee = await this.repo.create({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        employeeNumber: input.employeeNumber,
        position: input.position,
        hireDate: input.hireDate ?? undefined,
        employmentType: input.employmentType ?? 'FULL_TIME',
        status: input.status ?? 'ACTIVE',
        avatarUrl: input.avatarUrl,
        company: { connect: { id: companyId } },
        ...(input.departmentId ? { department: { connect: { id: input.departmentId } } } : {}),
        ...(input.locationId ? { location: { connect: { id: input.locationId } } } : {}),
        ...(input.managerId ? { manager: { connect: { id: input.managerId } } } : {}),
      });

      await this.repo.createAuditLog({
        actorId: userId,
        action: 'employees.create',
        entityType: 'Employee',
        entityId: employee.id,
      });

      return toEmployeeDto(employee);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('An employee with this email already exists');
      }
      throw error;
    }
  }

  async update(userId: string, id: string, input: UpdateEmployeeInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findEmployee(companyId, id);
    if (!existing) {
      throw new NotFoundError('Employee not found');
    }

    await this.assertRefs(companyId, input);

    if (input.managerId === id) {
      throw new ValidationError('An employee cannot be their own manager');
    }

    if (input.email && input.email !== existing.email) {
      const clash = await this.repo.findByEmail(companyId, input.email);
      if (clash) {
        throw new ConflictError('An employee with this email already exists');
      }
    }

    try {
      const employee = await this.repo.update(id, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        employeeNumber: input.employeeNumber,
        position: input.position,
        hireDate: input.hireDate === null ? null : input.hireDate,
        employmentType: input.employmentType,
        status: input.status,
        avatarUrl: input.avatarUrl,
        ...(input.departmentId === null
          ? { department: { disconnect: true } }
          : input.departmentId
            ? { department: { connect: { id: input.departmentId } } }
            : {}),
        ...(input.locationId === null
          ? { location: { disconnect: true } }
          : input.locationId
            ? { location: { connect: { id: input.locationId } } }
            : {}),
        ...(input.managerId === null
          ? { manager: { disconnect: true } }
          : input.managerId
            ? { manager: { connect: { id: input.managerId } } }
            : {}),
      });

      await this.repo.createAuditLog({
        actorId: userId,
        action: 'employees.update',
        entityType: 'Employee',
        entityId: employee.id,
      });

      return toEmployeeDto(employee);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('An employee with this email already exists');
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findEmployee(companyId, id);
    if (!existing) {
      throw new NotFoundError('Employee not found');
    }

    await this.repo.softDelete(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'employees.delete',
      entityType: 'Employee',
      entityId: id,
    });

    return { deleted: true };
  }

  async exportCsv(userId: string, query: Pick<EmployeeListQuery, 'search' | 'departmentId' | 'status'>) {
    const companyId = await this.requireCompanyId(userId);
    const rows = await this.repo.listForExport(companyId, {
      search: query.search,
      departmentId: query.departmentId,
      status: query.status,
    });

    const header = [
      'First Name',
      'Last Name',
      'Email',
      'Department',
      'Position',
      'Manager',
      'Status',
      'Joined',
      'Employment Type',
    ];

    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.firstName,
          row.lastName,
          row.email,
          row.department?.name ?? '',
          row.position ?? '',
          row.manager ? `${row.manager.firstName} ${row.manager.lastName}` : '',
          row.status,
          row.hireDate ? row.hireDate.toISOString().slice(0, 10) : '',
          row.employmentType,
        ]
          .map((cell) => escape(String(cell)))
          .join(','),
      ),
    ];

    return lines.join('\n');
  }
}
