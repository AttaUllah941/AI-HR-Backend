import type { EmployeeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
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

const notDeleted = { deletedAt: null };

const employeeListSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  status: true,
  employmentType: true,
  joinDate: true,
  workLocation: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  team: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true, level: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} satisfies Prisma.EmployeeSelect;

const employeeDetailInclude = {
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true, code: true } },
  team: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true, level: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  emergencyContacts: { where: notDeleted, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
  education: { where: notDeleted, orderBy: { startDate: 'desc' } },
  experience: { where: notDeleted, orderBy: { startDate: 'desc' } },
  skills: { where: notDeleted, orderBy: { name: 'asc' } },
  certifications: { where: notDeleted, orderBy: { issuedDate: 'desc' } },
  documents: { where: notDeleted, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  status?: EmployeeStatus;
  branchId?: string;
  departmentId?: string;
  teamId?: string;
  designationId?: string;
  sortBy: 'firstName' | 'lastName' | 'employeeCode' | 'joinDate' | 'createdAt';
  sortDir: 'asc' | 'desc';
};

export class EmployeeRepository {
  findUserCompanyId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { companyId: true },
    });
  }

  countEmployees(companyId: string) {
    return prisma.employee.count({ where: { companyId, ...notDeleted } });
  }

  listEmployees(companyId: string, query: EmployeeListQuery) {
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      ...notDeleted,
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.designationId ? { designationId: query.designationId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.EmployeeOrderByWithRelationInput =
      query.sortBy === 'joinDate'
        ? { joinDate: query.sortDir }
        : query.sortBy === 'employeeCode'
          ? { employeeCode: query.sortDir }
          : query.sortBy === 'createdAt'
            ? { createdAt: query.sortDir }
            : query.sortBy === 'firstName'
              ? { firstName: query.sortDir }
              : { lastName: query.sortDir };

    const skip = (query.page - 1) * query.pageSize;

    return Promise.all([
      prisma.employee.findMany({
        where,
        select: employeeListSelect,
        orderBy,
        skip,
        take: query.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);
  }

  findEmployee(companyId: string, id: string) {
    return prisma.employee.findFirst({
      where: { id, companyId, ...notDeleted },
      include: employeeDetailInclude,
    });
  }

  findEmployeeBasic(companyId: string, id: string) {
    return prisma.employee.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  createEmployee(companyId: string, data: CreateEmployeeInput) {
    return prisma.employee.create({
      data: {
        companyId,
        employeeCode: data.employeeCode.trim().toUpperCase(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone ?? null,
        personalEmail: data.personalEmail?.trim().toLowerCase() ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
        gender: data.gender ?? null,
        nationality: data.nationality ?? null,
        maritalStatus: data.maritalStatus ?? null,
        avatarUrl: data.avatarUrl ?? null,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        country: data.country ?? null,
        postalCode: data.postalCode ?? null,
        branchId: data.branchId || null,
        departmentId: data.departmentId || null,
        teamId: data.teamId || null,
        designationId: data.designationId || null,
        managerId: data.managerId || null,
        employmentType: data.employmentType ?? 'FULL_TIME',
        status: data.status ?? 'DRAFT',
        joinDate: data.joinDate ?? null,
        probationEndDate: data.probationEndDate ?? null,
        confirmationDate: data.confirmationDate ?? null,
        exitDate: data.exitDate ?? null,
        workLocation: data.workLocation ?? null,
        bio: data.bio ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive ?? true,
      },
      include: employeeDetailInclude,
    });
  }

  updateEmployee(id: string, data: UpdateEmployeeInput) {
    return prisma.employee.update({
      where: { id },
      data: {
        ...(data.employeeCode !== undefined
          ? { employeeCode: data.employeeCode.trim().toUpperCase() }
          : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
        ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.personalEmail !== undefined
          ? { personalEmail: data.personalEmail?.trim().toLowerCase() ?? null }
          : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.nationality !== undefined ? { nationality: data.nationality } : {}),
        ...(data.maritalStatus !== undefined ? { maritalStatus: data.maritalStatus } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
        ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId || null } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId || null } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId || null } : {}),
        ...(data.designationId !== undefined ? { designationId: data.designationId || null } : {}),
        ...(data.managerId !== undefined ? { managerId: data.managerId || null } : {}),
        ...(data.employmentType !== undefined ? { employmentType: data.employmentType } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.joinDate !== undefined ? { joinDate: data.joinDate } : {}),
        ...(data.probationEndDate !== undefined ? { probationEndDate: data.probationEndDate } : {}),
        ...(data.confirmationDate !== undefined ? { confirmationDate: data.confirmationDate } : {}),
        ...(data.exitDate !== undefined ? { exitDate: data.exitDate } : {}),
        ...(data.workLocation !== undefined ? { workLocation: data.workLocation } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: employeeDetailInclude,
    });
  }

  softDeleteEmployee(id: string) {
    return prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: 'INACTIVE' },
    });
  }

  countDirectReports(employeeId: string) {
    return prisma.employee.count({ where: { managerId: employeeId, ...notDeleted } });
  }

  // —— Emergency contacts ——
  createEmergencyContact(employeeId: string, data: CreateEmergencyContactInput) {
    return prisma.employeeEmergencyContact.create({
      data: { employeeId, ...data, email: data.email ?? null },
    });
  }

  updateEmergencyContact(id: string, data: UpdateEmergencyContactInput) {
    return prisma.employeeEmergencyContact.update({ where: { id }, data });
  }

  softDeleteEmergencyContact(id: string) {
    return prisma.employeeEmergencyContact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  findEmergencyContact(employeeId: string, id: string) {
    return prisma.employeeEmergencyContact.findFirst({
      where: { id, employeeId, ...notDeleted },
    });
  }

  // —— Education ——
  createEducation(employeeId: string, data: CreateEducationInput) {
    return prisma.employeeEducation.create({ data: { employeeId, ...data } });
  }

  updateEducation(id: string, data: UpdateEducationInput) {
    return prisma.employeeEducation.update({ where: { id }, data });
  }

  softDeleteEducation(id: string) {
    return prisma.employeeEducation.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  findEducation(employeeId: string, id: string) {
    return prisma.employeeEducation.findFirst({ where: { id, employeeId, ...notDeleted } });
  }

  // —— Experience ——
  createExperience(employeeId: string, data: CreateExperienceInput) {
    return prisma.employeeExperience.create({ data: { employeeId, ...data } });
  }

  updateExperience(id: string, data: UpdateExperienceInput) {
    return prisma.employeeExperience.update({ where: { id }, data });
  }

  softDeleteExperience(id: string) {
    return prisma.employeeExperience.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  findExperience(employeeId: string, id: string) {
    return prisma.employeeExperience.findFirst({ where: { id, employeeId, ...notDeleted } });
  }

  // —— Skills ——
  createSkill(employeeId: string, data: CreateSkillInput) {
    return prisma.employeeSkill.create({
      data: { employeeId, name: data.name.trim(), level: data.level ?? null, years: data.years ?? null },
    });
  }

  updateSkill(id: string, data: UpdateSkillInput) {
    return prisma.employeeSkill.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.level !== undefined ? { level: data.level } : {}),
        ...(data.years !== undefined ? { years: data.years } : {}),
      },
    });
  }

  softDeleteSkill(id: string) {
    return prisma.employeeSkill.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  findSkill(employeeId: string, id: string) {
    return prisma.employeeSkill.findFirst({ where: { id, employeeId, ...notDeleted } });
  }

  // —— Certifications ——
  createCertification(employeeId: string, data: CreateCertificationInput) {
    return prisma.employeeCertification.create({ data: { employeeId, ...data } });
  }

  updateCertification(id: string, data: UpdateCertificationInput) {
    return prisma.employeeCertification.update({ where: { id }, data });
  }

  softDeleteCertification(id: string) {
    return prisma.employeeCertification.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  findCertification(employeeId: string, id: string) {
    return prisma.employeeCertification.findFirst({ where: { id, employeeId, ...notDeleted } });
  }

  // —— Documents ——
  createDocument(employeeId: string, data: CreateDocumentInput, uploadedBy?: string) {
    return prisma.employeeDocument.create({
      data: {
        employeeId,
        title: data.title,
        category: data.category,
        fileName: data.fileName ?? null,
        fileUrl: data.fileUrl ?? null,
        mimeType: data.mimeType ?? null,
        fileSize: data.fileSize ?? null,
        uploadedBy: uploadedBy ?? null,
      },
    });
  }

  updateDocument(id: string, data: UpdateDocumentInput) {
    return prisma.employeeDocument.update({ where: { id }, data });
  }

  softDeleteDocument(id: string) {
    return prisma.employeeDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  findDocument(employeeId: string, id: string) {
    return prisma.employeeDocument.findFirst({ where: { id, employeeId, ...notDeleted } });
  }

  // —— Activity ——
  listActivity(entityId: string, limit: number) {
    return prisma.auditLog.findMany({
      where: { entityType: 'Employee', entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
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

  // —— Org FK validation ——
  findBranch(companyId: string, id: string) {
    return prisma.branch.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  findDepartment(companyId: string, id: string) {
    return prisma.department.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  findTeam(companyId: string, id: string) {
    return prisma.team.findFirst({ where: { id, companyId, ...notDeleted } });
  }

  findDesignation(companyId: string, id: string) {
    return prisma.designation.findFirst({ where: { id, companyId, ...notDeleted } });
  }
}
