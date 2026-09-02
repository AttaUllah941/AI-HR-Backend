import type { EmployeeStatus } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { EmployeeRepository, type EmployeeListQuery } from '../repositories/employee.repository.js';
import type {
  CreateCertificationInput,
  CreateDocumentInput,
  CreateEducationInput,
  CreateEmergencyContactInput,
  CreateEmployeeInput,
  CreateExperienceInput,
  CreateSkillInput,
  UpdateCertificationInput,
  UpdateDocumentInput,
  UpdateEducationInput,
  UpdateEmergencyContactInput,
  UpdateEmployeeInput,
  UpdateExperienceInput,
  UpdateSkillInput,
} from '../validators/employee.validators.js';

type AuthActor = { id: string; permissions: string[] };

export type EmployeeListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  branchId?: string;
  departmentId?: string;
  teamId?: string;
  designationId?: string;
  sortBy?: string;
  sortDir?: string;
};

export class EmployeeService {
  constructor(private readonly repo = new EmployeeRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  private parseListQuery(params: EmployeeListParams): EmployeeListQuery {
    const page = Math.max(1, Number(params.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 20) || 20));
    const sortBy = ['firstName', 'lastName', 'employeeCode', 'joinDate', 'createdAt'].includes(
      params.sortBy ?? '',
    )
      ? (params.sortBy as EmployeeListQuery['sortBy'])
      : 'lastName';
    const sortDir = params.sortDir === 'desc' ? 'desc' : 'asc';
    const status = params.status as EmployeeStatus | undefined;

    return {
      page,
      pageSize,
      search: params.search?.trim() || undefined,
      status: status && status.length > 0 ? status : undefined,
      branchId: params.branchId || undefined,
      departmentId: params.departmentId || undefined,
      teamId: params.teamId || undefined,
      designationId: params.designationId || undefined,
      sortBy,
      sortDir,
    };
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      throw new ConflictError(message);
    }
    throw error;
  }

  private async validateOrgRefs(companyId: string, input: CreateEmployeeInput | UpdateEmployeeInput) {
    if (input.branchId) {
      const branch = await this.repo.findBranch(companyId, input.branchId);
      if (!branch) throw new ValidationError('Invalid branch');
    }
    if (input.departmentId) {
      const dept = await this.repo.findDepartment(companyId, input.departmentId);
      if (!dept) throw new ValidationError('Invalid department');
    }
    if (input.teamId) {
      const team = await this.repo.findTeam(companyId, input.teamId);
      if (!team) throw new ValidationError('Invalid team');
    }
    if (input.designationId) {
      const designation = await this.repo.findDesignation(companyId, input.designationId);
      if (!designation) throw new ValidationError('Invalid designation');
    }
    if (input.managerId) {
      const manager = await this.repo.findEmployeeBasic(companyId, input.managerId);
      if (!manager) throw new ValidationError('Invalid manager');
    }
  }

  private async requireEmployee(companyId: string, id: string) {
    const employee = await this.repo.findEmployeeBasic(companyId, id);
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }

  async list(actor: AuthActor, params: EmployeeListParams) {
    const companyId = await this.requireCompanyId(actor.id);
    const query = this.parseListQuery(params);
    const [items, total] = await this.repo.listEmployees(companyId, query);
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getById(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const employee = await this.repo.findEmployee(companyId, id);
    if (!employee) throw new NotFoundError('Employee not found');
    return employee;
  }

  async create(actor: AuthActor, input: CreateEmployeeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.validateOrgRefs(companyId, input);
    try {
      const employee = await this.repo.createEmployee(companyId, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'employees.create',
        entityType: 'Employee',
        entityId: employee.id,
        metadata: { employeeCode: employee.employeeCode },
      });
      return employee;
    } catch (error) {
      this.rethrowUnique(error, 'Employee code or email already exists');
    }
  }

  async update(actor: AuthActor, id: string, input: UpdateEmployeeInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, id);
    if (input.managerId === id) {
      throw new ValidationError('Employee cannot be their own manager');
    }
    await this.validateOrgRefs(companyId, input);
    try {
      const employee = await this.repo.updateEmployee(id, input);
      await this.repo.createAuditLog({
        actorId: actor.id,
        action: 'employees.update',
        entityType: 'Employee',
        entityId: id,
      });
      return employee;
    } catch (error) {
      this.rethrowUnique(error, 'Employee code or email already exists');
    }
  }

  async remove(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, id);
    const reports = await this.repo.countDirectReports(id);
    if (reports > 0) {
      throw new ValidationError('Cannot delete an employee who has direct reports');
    }
    await this.repo.softDeleteEmployee(id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'employees.delete',
      entityType: 'Employee',
      entityId: id,
    });
    return { id, deleted: true };
  }

  async getTimeline(actor: AuthActor, id: string) {
    const companyId = await this.requireCompanyId(actor.id);
    const employee = await this.requireEmployee(companyId, id);
    const events: Array<{ date: string; label: string; type: string }> = [];

    if (employee.joinDate) {
      events.push({ date: employee.joinDate.toISOString(), label: 'Joined company', type: 'join' });
    }
    if (employee.probationEndDate) {
      events.push({
        date: employee.probationEndDate.toISOString(),
        label: 'Probation ended',
        type: 'probation',
      });
    }
    if (employee.confirmationDate) {
      events.push({
        date: employee.confirmationDate.toISOString(),
        label: 'Confirmed',
        type: 'confirmation',
      });
    }
    if (employee.exitDate) {
      events.push({ date: employee.exitDate.toISOString(), label: 'Exit date', type: 'exit' });
    }
    events.push({
      date: employee.createdAt.toISOString(),
      label: 'Profile created',
      type: 'created',
    });

    return {
      employeeId: id,
      status: employee.status,
      events: events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  }

  async getActivity(actor: AuthActor, id: string, limit = 20) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, id);
    const items = await this.repo.listActivity(id, Math.min(50, Math.max(1, limit)));
    return { items };
  }

  // —— Emergency contacts ——
  async createEmergencyContact(actor: AuthActor, employeeId: string, input: CreateEmergencyContactInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const contact = await this.repo.createEmergencyContact(employeeId, input);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'employees.emergency_contact.create',
      entityType: 'Employee',
      entityId: employeeId,
    });
    return contact;
  }

  async updateEmergencyContact(
    actor: AuthActor,
    employeeId: string,
    contactId: string,
    input: UpdateEmergencyContactInput,
  ) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findEmergencyContact(employeeId, contactId);
    if (!existing) throw new NotFoundError('Emergency contact not found');
    return this.repo.updateEmergencyContact(contactId, input);
  }

  async deleteEmergencyContact(actor: AuthActor, employeeId: string, contactId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findEmergencyContact(employeeId, contactId);
    if (!existing) throw new NotFoundError('Emergency contact not found');
    await this.repo.softDeleteEmergencyContact(contactId);
    return { id: contactId, deleted: true };
  }

  // —— Education ——
  async createEducation(actor: AuthActor, employeeId: string, input: CreateEducationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    return this.repo.createEducation(employeeId, input);
  }

  async updateEducation(actor: AuthActor, employeeId: string, eduId: string, input: UpdateEducationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findEducation(employeeId, eduId);
    if (!existing) throw new NotFoundError('Education record not found');
    return this.repo.updateEducation(eduId, input);
  }

  async deleteEducation(actor: AuthActor, employeeId: string, eduId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findEducation(employeeId, eduId);
    if (!existing) throw new NotFoundError('Education record not found');
    await this.repo.softDeleteEducation(eduId);
    return { id: eduId, deleted: true };
  }

  // —— Experience ——
  async createExperience(actor: AuthActor, employeeId: string, input: CreateExperienceInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    return this.repo.createExperience(employeeId, input);
  }

  async updateExperience(
    actor: AuthActor,
    employeeId: string,
    expId: string,
    input: UpdateExperienceInput,
  ) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findExperience(employeeId, expId);
    if (!existing) throw new NotFoundError('Experience record not found');
    return this.repo.updateExperience(expId, input);
  }

  async deleteExperience(actor: AuthActor, employeeId: string, expId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findExperience(employeeId, expId);
    if (!existing) throw new NotFoundError('Experience record not found');
    await this.repo.softDeleteExperience(expId);
    return { id: expId, deleted: true };
  }

  // —— Skills ——
  async createSkill(actor: AuthActor, employeeId: string, input: CreateSkillInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    try {
      return await this.repo.createSkill(employeeId, input);
    } catch (error) {
      this.rethrowUnique(error, 'Skill already exists for this employee');
    }
  }

  async updateSkill(actor: AuthActor, employeeId: string, skillId: string, input: UpdateSkillInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findSkill(employeeId, skillId);
    if (!existing) throw new NotFoundError('Skill not found');
    try {
      return await this.repo.updateSkill(skillId, input);
    } catch (error) {
      this.rethrowUnique(error, 'Skill already exists for this employee');
    }
  }

  async deleteSkill(actor: AuthActor, employeeId: string, skillId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findSkill(employeeId, skillId);
    if (!existing) throw new NotFoundError('Skill not found');
    await this.repo.softDeleteSkill(skillId);
    return { id: skillId, deleted: true };
  }

  // —— Certifications ——
  async createCertification(actor: AuthActor, employeeId: string, input: CreateCertificationInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    return this.repo.createCertification(employeeId, input);
  }

  async updateCertification(
    actor: AuthActor,
    employeeId: string,
    certId: string,
    input: UpdateCertificationInput,
  ) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findCertification(employeeId, certId);
    if (!existing) throw new NotFoundError('Certification not found');
    return this.repo.updateCertification(certId, input);
  }

  async deleteCertification(actor: AuthActor, employeeId: string, certId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findCertification(employeeId, certId);
    if (!existing) throw new NotFoundError('Certification not found');
    await this.repo.softDeleteCertification(certId);
    return { id: certId, deleted: true };
  }

  // —— Documents ——
  async createDocument(actor: AuthActor, employeeId: string, input: CreateDocumentInput) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const doc = await this.repo.createDocument(employeeId, input, actor.id);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'employees.document.create',
      entityType: 'Employee',
      entityId: employeeId,
      metadata: { title: input.title, category: input.category },
    });
    return doc;
  }

  async updateDocument(
    actor: AuthActor,
    employeeId: string,
    docId: string,
    input: UpdateDocumentInput,
  ) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findDocument(employeeId, docId);
    if (!existing) throw new NotFoundError('Document not found');
    return this.repo.updateDocument(docId, input);
  }

  async deleteDocument(actor: AuthActor, employeeId: string, docId: string) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.requireEmployee(companyId, employeeId);
    const existing = await this.repo.findDocument(employeeId, docId);
    if (!existing) throw new NotFoundError('Document not found');
    await this.repo.softDeleteDocument(docId);
    return { id: docId, deleted: true };
  }
}
