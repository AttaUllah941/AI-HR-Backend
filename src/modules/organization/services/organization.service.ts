import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { OrganizationRepository } from '../repositories/organization.repository.js';
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

type AuthActor = { id: string; permissions: string[] };

export type OrgChartNode = {
  id: string;
  name: string;
  code: string;
  branch: { id: string; name: string; code: string } | null;
  teams: Array<{ id: string; name: string; code: string }>;
  children: OrgChartNode[];
};

export class OrganizationService {
  constructor(private readonly repo = new OrganizationRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  async getOverview(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const company = await this.repo.findCompany(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }

    const [branches, departments, teams, designations] = await Promise.all([
      this.repo.countBranches(companyId),
      this.repo.countDepartments(companyId),
      this.repo.countTeams(companyId),
      this.repo.countDesignations(companyId),
    ]);

    return {
      company,
      counts: { branches, departments, teams, designations },
    };
  }

  async getOrgChart(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const company = await this.repo.findCompany(companyId);
    const departments = await this.repo.chartDepartments(companyId);

    const byId = new Map<string, OrgChartNode>();
    for (const dept of departments) {
      byId.set(dept.id, {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        branch: dept.branch,
        teams: dept.teams,
        children: [],
      });
    }

    const roots: OrgChartNode[] = [];
    for (const dept of departments) {
      const node = byId.get(dept.id)!;
      if (dept.parentId && byId.has(dept.parentId)) {
        byId.get(dept.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return {
      company,
      tree: roots,
    };
  }

  // —— Branches ——
  async listBranches(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return { items: await this.repo.listBranches(companyId) };
  }

  async createBranch(actor: AuthActor, input: CreateBranchInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const branch = await this.repo.createBranch(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.branch.create',
        entityType: 'Branch',
        entityId: branch.id,
      });
      return branch;
    } catch (error) {
      this.rethrowUnique(error, 'Branch code already exists');
    }
  }

  async updateBranch(actor: AuthActor, id: string, input: UpdateBranchInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findBranch(companyId, id);
    if (!existing) {
      throw new NotFoundError('Branch not found');
    }
    if (input.isHeadOffice) {
      await this.repo.clearOtherHeadOffices(companyId, id);
    }
    try {
      const branch = await this.repo.updateBranch(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.branch.update',
        entityType: 'Branch',
        entityId: branch.id,
      });
      return branch;
    } catch (error) {
      this.rethrowUnique(error, 'Branch code already exists');
    }
  }

  async deleteBranch(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findBranch(companyId, id);
    if (!existing) {
      throw new NotFoundError('Branch not found');
    }
    const departmentCount = await this.repo.countDepartmentsForBranch(companyId, id);
    if (departmentCount > 0) {
      throw new ValidationError(
        'Cannot delete a branch that still has departments. Reassign or remove them first.',
      );
    }
    await this.repo.softDeleteBranch(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'organization.branch.delete',
      entityType: 'Branch',
      entityId: id,
    });
    return { deleted: true };
  }

  // —— Departments ——
  async listDepartments(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const items = await this.repo.listDepartments(companyId);
    return {
      items: items.map(({ _count, ...item }) => ({
        ...item,
        teamCount: _count.teams,
      })),
    };
  }

  async createDepartment(actor: AuthActor, input: CreateDepartmentInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.assertDepartmentRefs(companyId, input.branchId, input.parentId);
    try {
      const department = await this.repo.createDepartment(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.department.create',
        entityType: 'Department',
        entityId: department.id,
      });
      return department;
    } catch (error) {
      this.rethrowUnique(error, 'Department code already exists');
    }
  }

  async updateDepartment(actor: AuthActor, id: string, input: UpdateDepartmentInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findDepartment(companyId, id);
    if (!existing) {
      throw new NotFoundError('Department not found');
    }
    if (input.parentId === id) {
      throw new ValidationError('A department cannot be its own parent');
    }
    if (input.parentId) {
      await this.assertNoDepartmentCycle(companyId, id, input.parentId);
    }
    await this.assertDepartmentRefs(companyId, input.branchId, input.parentId);
    try {
      const department = await this.repo.updateDepartment(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.department.update',
        entityType: 'Department',
        entityId: department.id,
      });
      return department;
    } catch (error) {
      this.rethrowUnique(error, 'Department code already exists');
    }
  }

  async deleteDepartment(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findDepartment(companyId, id);
    if (!existing) {
      throw new NotFoundError('Department not found');
    }
    const [childCount, teamCount] = await Promise.all([
      this.repo.countChildDepartments(companyId, id),
      this.repo.countTeamsForDepartment(companyId, id),
    ]);
    if (childCount > 0) {
      throw new ValidationError(
        'Cannot delete a department that has child departments. Remove or reassign them first.',
      );
    }
    if (teamCount > 0) {
      throw new ValidationError(
        'Cannot delete a department that still has teams. Remove or reassign them first.',
      );
    }
    await this.repo.softDeleteDepartment(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'organization.department.delete',
      entityType: 'Department',
      entityId: id,
    });
    return { deleted: true };
  }

  // —— Teams ——
  async listTeams(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return { items: await this.repo.listTeams(companyId) };
  }

  async createTeam(actor: AuthActor, input: CreateTeamInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const department = await this.repo.findDepartment(companyId, input.departmentId);
    if (!department) {
      throw new ValidationError('Department not found');
    }
    try {
      const team = await this.repo.createTeam(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.team.create',
        entityType: 'Team',
        entityId: team.id,
      });
      return team;
    } catch (error) {
      this.rethrowUnique(error, 'Team code already exists');
    }
  }

  async updateTeam(actor: AuthActor, id: string, input: UpdateTeamInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findTeam(companyId, id);
    if (!existing) {
      throw new NotFoundError('Team not found');
    }
    if (input.departmentId) {
      const department = await this.repo.findDepartment(companyId, input.departmentId);
      if (!department) {
        throw new ValidationError('Department not found');
      }
    }
    try {
      const team = await this.repo.updateTeam(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.team.update',
        entityType: 'Team',
        entityId: team.id,
      });
      return team;
    } catch (error) {
      this.rethrowUnique(error, 'Team code already exists');
    }
  }

  async deleteTeam(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findTeam(companyId, id);
    if (!existing) {
      throw new NotFoundError('Team not found');
    }
    await this.repo.softDeleteTeam(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'organization.team.delete',
      entityType: 'Team',
      entityId: id,
    });
    return { deleted: true };
  }

  // —— Designations ——
  async listDesignations(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    return { items: await this.repo.listDesignations(companyId) };
  }

  async createDesignation(actor: AuthActor, input: CreateDesignationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    try {
      const designation = await this.repo.createDesignation(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.designation.create',
        entityType: 'Designation',
        entityId: designation.id,
      });
      return designation;
    } catch (error) {
      this.rethrowUnique(error, 'Designation code already exists');
    }
  }

  async updateDesignation(actor: AuthActor, id: string, input: UpdateDesignationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findDesignation(companyId, id);
    if (!existing) {
      throw new NotFoundError('Designation not found');
    }
    try {
      const designation = await this.repo.updateDesignation(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'organization.designation.update',
        entityType: 'Designation',
        entityId: designation.id,
      });
      return designation;
    } catch (error) {
      this.rethrowUnique(error, 'Designation code already exists');
    }
  }

  async deleteDesignation(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findDesignation(companyId, id);
    if (!existing) {
      throw new NotFoundError('Designation not found');
    }
    await this.repo.softDeleteDesignation(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'organization.designation.delete',
      entityType: 'Designation',
      entityId: id,
    });
    return { deleted: true };
  }

  private async assertNoDepartmentCycle(
    companyId: string,
    departmentId: string,
    parentId: string,
  ) {
    let current: string | null = parentId;
    while (current) {
      if (current === departmentId) {
        throw new ValidationError('Department hierarchy cannot contain a circular reference');
      }
      const row = await this.repo.getDepartmentParentId(companyId, current);
      current = row?.parentId ?? null;
    }
  }

  private async assertDepartmentRefs(
    companyId: string,
    branchId?: string | null,
    parentId?: string | null,
  ) {
    if (branchId) {
      const branch = await this.repo.findBranch(companyId, branchId);
      if (!branch) {
        throw new ValidationError('Branch not found');
      }
    }
    if (parentId) {
      const parent = await this.repo.findDepartment(companyId, parentId);
      if (!parent) {
        throw new ValidationError('Parent department not found');
      }
    }
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      throw new ConflictError(message);
    }
    throw error;
  }
}
