import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { OrganizationRepository } from '../repositories/organization.repository.js';
import type {
  CreateDepartmentInput,
  CreateLocationInput,
  ListQueryInput,
  UpdateCompanyInput,
  UpdateDepartmentInput,
  UpdateLocationInput,
} from '../validators/organization.validators.js';

function toCompanyDto(company: NonNullable<Awaited<ReturnType<OrganizationRepository['findCompanyById']>>>) {
  return {
    id: company.id,
    name: company.name,
    legalName: company.legalName,
    email: company.email,
    phone: company.phone,
    website: company.website,
    logoUrl: company.logoUrl,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    state: company.state,
    country: company.country,
    postalCode: company.postalCode,
    timezone: company.timezone,
    locale: company.locale,
    isActive: company.isActive,
    updatedAt: company.updatedAt,
  };
}

function toDepartmentDto(
  department: NonNullable<Awaited<ReturnType<OrganizationRepository['findDepartment']>>>,
) {
  return {
    id: department.id,
    companyId: department.companyId,
    name: department.name,
    code: department.code,
    description: department.description,
    parentId: department.parentId,
    isActive: department.isActive,
    createdAt: department.createdAt,
    updatedAt: department.updatedAt,
  };
}

function toLocationDto(
  location: NonNullable<Awaited<ReturnType<OrganizationRepository['findLocation']>>>,
) {
  return {
    id: location.id,
    companyId: location.companyId,
    name: location.name,
    code: location.code,
    addressLine1: location.addressLine1,
    city: location.city,
    state: location.state,
    country: location.country,
    postalCode: location.postalCode,
    timezone: location.timezone,
    isHeadquarters: location.isHeadquarters,
    isActive: location.isActive,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

export class OrganizationService {
  constructor(private readonly repo = new OrganizationRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('User is not assigned to a company');
    }
    return user.companyId;
  }

  async getOverview(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const company = await this.repo.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const [departmentCount, locationCount] = await this.repo.countOrgSummary(companyId);

    return {
      company: toCompanyDto(company),
      stats: {
        departments: departmentCount,
        locations: locationCount,
      },
    };
  }

  async getCompany(userId: string) {
    const companyId = await this.requireCompanyId(userId);
    const company = await this.repo.findCompanyById(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    return toCompanyDto(company);
  }

  async updateCompany(userId: string, input: UpdateCompanyInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findCompanyById(companyId);
    if (!existing) {
      throw new NotFoundError('Company not found');
    }

    const company = await this.repo.updateCompany(companyId, input);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'organization.company.update',
      entityType: 'Company',
      entityId: company.id,
    });

    return toCompanyDto(company);
  }

  async listDepartments(userId: string, query: ListQueryInput) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listDepartments(
      companyId,
      query.search,
      skip,
      query.pageSize,
    );

    return {
      items: items.map(toDepartmentDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async createDepartment(userId: string, input: CreateDepartmentInput) {
    const companyId = await this.requireCompanyId(userId);

    if (input.parentId) {
      const parent = await this.repo.findDepartment(companyId, input.parentId);
      if (!parent) {
        throw new ValidationError('Parent department not found');
      }
    }

    try {
      const department = await this.repo.createDepartment({
        name: input.name,
        code: input.code,
        description: input.description,
        isActive: input.isActive ?? true,
        company: { connect: { id: companyId } },
        ...(input.parentId ? { parent: { connect: { id: input.parentId } } } : {}),
      });

      await this.repo.createAuditLog({
        actorId: userId,
        action: 'organization.department.create',
        entityType: 'Department',
        entityId: department.id,
      });

      return toDepartmentDto(department);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('A department with this name already exists');
      }
      throw error;
    }
  }

  async updateDepartment(userId: string, id: string, input: UpdateDepartmentInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findDepartment(companyId, id);
    if (!existing) {
      throw new NotFoundError('Department not found');
    }

    if (input.parentId === id) {
      throw new ValidationError('A department cannot be its own parent');
    }

    if (input.parentId) {
      const parent = await this.repo.findDepartment(companyId, input.parentId);
      if (!parent) {
        throw new ValidationError('Parent department not found');
      }
    }

    try {
      const department = await this.repo.updateDepartment(id, {
        name: input.name,
        code: input.code,
        description: input.description,
        isActive: input.isActive,
        ...(input.parentId === null
          ? { parent: { disconnect: true } }
          : input.parentId
            ? { parent: { connect: { id: input.parentId } } }
            : {}),
      });

      await this.repo.createAuditLog({
        actorId: userId,
        action: 'organization.department.update',
        entityType: 'Department',
        entityId: department.id,
      });

      return toDepartmentDto(department);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('A department with this name already exists');
      }
      throw error;
    }
  }

  async deleteDepartment(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findDepartment(companyId, id);
    if (!existing) {
      throw new NotFoundError('Department not found');
    }

    await this.repo.softDeleteDepartment(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'organization.department.delete',
      entityType: 'Department',
      entityId: id,
    });

    return { deleted: true };
  }

  async listLocations(userId: string, query: ListQueryInput) {
    const companyId = await this.requireCompanyId(userId);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await this.repo.listLocations(
      companyId,
      query.search,
      skip,
      query.pageSize,
    );

    return {
      items: items.map(toLocationDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async createLocation(userId: string, input: CreateLocationInput) {
    const companyId = await this.requireCompanyId(userId);

    if (input.isHeadquarters) {
      await this.repo.clearHeadquarters(companyId);
    }

    try {
      const location = await this.repo.createLocation({
        name: input.name,
        code: input.code,
        addressLine1: input.addressLine1,
        city: input.city,
        state: input.state,
        country: input.country,
        postalCode: input.postalCode,
        timezone: input.timezone,
        isHeadquarters: input.isHeadquarters ?? false,
        isActive: input.isActive ?? true,
        company: { connect: { id: companyId } },
      });

      await this.repo.createAuditLog({
        actorId: userId,
        action: 'organization.location.create',
        entityType: 'Location',
        entityId: location.id,
      });

      return toLocationDto(location);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('A location with this name already exists');
      }
      throw error;
    }
  }

  async updateLocation(userId: string, id: string, input: UpdateLocationInput) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findLocation(companyId, id);
    if (!existing) {
      throw new NotFoundError('Location not found');
    }

    if (input.isHeadquarters) {
      await this.repo.clearHeadquarters(companyId, id);
    }

    try {
      const location = await this.repo.updateLocation(id, input);
      await this.repo.createAuditLog({
        actorId: userId,
        action: 'organization.location.update',
        entityType: 'Location',
        entityId: location.id,
      });
      return toLocationDto(location);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictError('A location with this name already exists');
      }
      throw error;
    }
  }

  async deleteLocation(userId: string, id: string) {
    const companyId = await this.requireCompanyId(userId);
    const existing = await this.repo.findLocation(companyId, id);
    if (!existing) {
      throw new NotFoundError('Location not found');
    }

    await this.repo.softDeleteLocation(id);
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'organization.location.delete',
      entityType: 'Location',
      entityId: id,
    });

    return { deleted: true };
  }
}
