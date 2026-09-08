import { randomBytes } from 'node:crypto';
import type { Prisma, UserStatus } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { hashPassword } from '../../../utils/password.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';
import type {
  CreateUserInput,
  UpdateCompanyInput,
  UpdateEmailSettingsInput,
  UpdateIntegrationsInput,
  UpdateRolePermissionsInput,
  UpdateStorageSettingsInput,
  UpdateSystemSettingsInput,
  UpdateUserInput,
} from '../validators/settings.validators.js';

type AuthActor = { id: string; permissions: string[] };
type RequestMeta = { ip?: string; userAgent?: string };

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

function mapUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  userRoles: Array<{ role: { id: string; code: string; name: string } }>;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: user.userRoles.map((ur) => ur.role),
  };
}

function mapRole(role: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: Array<{
    permission: {
      id: string;
      code: string;
      module: string;
      action: string;
      description: string | null;
    };
  }>;
  _count: { userRoles: number };
}) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.userRoles,
    permissions: role.rolePermissions.map((rp) => rp.permission),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function mapSettings(settings: {
  id: string;
  companyId: string;
  emailProvider: string;
  emailFrom: string | null;
  emailSmtpUrl: string | null;
  emailApiKeySet: boolean;
  storageProvider: string;
  storageBucket: string | null;
  storageRegion: string | null;
  storagePublicBaseUrl: string | null;
  integrations: Prisma.JsonValue;
  system: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: settings.id,
    companyId: settings.companyId,
    email: {
      provider: settings.emailProvider,
      from: settings.emailFrom,
      smtpUrl: settings.emailSmtpUrl,
      apiKeySet: settings.emailApiKeySet,
    },
    storage: {
      provider: settings.storageProvider,
      bucket: settings.storageBucket,
      region: settings.storageRegion,
      publicBaseUrl: settings.storagePublicBaseUrl,
    },
    integrations: (settings.integrations as Record<string, unknown> | null) ?? {},
    system: (settings.system as Record<string, unknown> | null) ?? {
      maintenanceMode: false,
      allowSelfRegistration: false,
      defaultTimezone: 'UTC',
      defaultLocale: 'en-US',
    },
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

export class SettingsService {
  constructor(private readonly repo = new SettingsRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  private actorHas(actor: AuthActor, code: string) {
    return actor.permissions.includes(code);
  }

  async getSummary(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const [company, settings, users, activeUsers, roles, permissions] = await Promise.all([
      this.repo.findCompany(companyId),
      this.repo.ensureSettings(companyId),
      this.repo.countUsers(companyId),
      this.repo.countUsers(companyId, { status: 'ACTIVE' }),
      this.repo.listRoles(),
      this.repo.listPermissions(),
    ]);

    if (!company) {
      throw new NotFoundError('Company not found');
    }

    return {
      company: {
        id: company.id,
        name: company.name,
        legalName: company.legalName,
        email: company.email,
        timezone: company.timezone,
        locale: company.locale,
        isActive: company.isActive,
      },
      counts: {
        users,
        activeUsers,
        roles: roles.length,
        permissions: permissions.length,
      },
      config: {
        emailProvider: settings.emailProvider,
        storageProvider: settings.storageProvider,
        emailApiKeySet: settings.emailApiKeySet,
      },
    };
  }

  async getCompany(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const company = await this.repo.findCompany(companyId);
    if (!company) {
      throw new NotFoundError('Company not found');
    }
    return company;
  }

  async updateCompany(actor: AuthActor, input: UpdateCompanyInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findCompany(companyId);
    if (!existing) {
      throw new NotFoundError('Company not found');
    }

    const company = await this.repo.updateCompany(companyId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.legalName !== undefined ? { legalName: emptyToNull(input.legalName) } : {}),
      ...(input.email !== undefined ? { email: emptyToNull(input.email) } : {}),
      ...(input.phone !== undefined ? { phone: emptyToNull(input.phone) } : {}),
      ...(input.website !== undefined ? { website: emptyToNull(input.website) } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: emptyToNull(input.logoUrl) } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.company.update',
      entityType: 'Company',
      entityId: companyId,
      metadata: { fields: Object.keys(input) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return company;
  }

  async getConfig(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const settings = await this.repo.ensureSettings(companyId);
    return mapSettings(settings);
  }

  async updateEmail(actor: AuthActor, input: UpdateEmailSettingsInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.repo.ensureSettings(companyId);

    let emailApiKeySet: boolean | undefined;
    if (input.clearApiKey) {
      emailApiKeySet = false;
    } else if (input.emailApiKey !== undefined && input.emailApiKey !== null && input.emailApiKey !== '') {
      emailApiKeySet = true;
    }

    const settings = await this.repo.updateSettings(companyId, {
      ...(input.emailProvider !== undefined ? { emailProvider: input.emailProvider } : {}),
      ...(input.emailFrom !== undefined ? { emailFrom: emptyToNull(input.emailFrom) } : {}),
      ...(input.emailSmtpUrl !== undefined ? { emailSmtpUrl: emptyToNull(input.emailSmtpUrl) } : {}),
      ...(emailApiKeySet !== undefined ? { emailApiKeySet } : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.email.update',
      entityType: 'CompanySettings',
      entityId: settings.id,
      metadata: {
        provider: settings.emailProvider,
        apiKeySet: settings.emailApiKeySet,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapSettings(settings);
  }

  async updateStorage(actor: AuthActor, input: UpdateStorageSettingsInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.repo.ensureSettings(companyId);

    const settings = await this.repo.updateSettings(companyId, {
      ...(input.storageProvider !== undefined ? { storageProvider: input.storageProvider } : {}),
      ...(input.storageBucket !== undefined ? { storageBucket: emptyToNull(input.storageBucket) } : {}),
      ...(input.storageRegion !== undefined ? { storageRegion: emptyToNull(input.storageRegion) } : {}),
      ...(input.storagePublicBaseUrl !== undefined
        ? { storagePublicBaseUrl: emptyToNull(input.storagePublicBaseUrl) }
        : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.storage.update',
      entityType: 'CompanySettings',
      entityId: settings.id,
      metadata: { provider: settings.storageProvider },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapSettings(settings);
  }

  async updateIntegrations(actor: AuthActor, input: UpdateIntegrationsInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.repo.ensureSettings(companyId);

    const settings = await this.repo.updateSettings(companyId, {
      integrations: input.integrations as Prisma.InputJsonValue,
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.integrations.update',
      entityType: 'CompanySettings',
      entityId: settings.id,
      metadata: { keys: Object.keys(input.integrations) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapSettings(settings);
  }

  async updateSystem(actor: AuthActor, input: UpdateSystemSettingsInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.repo.ensureSettings(companyId);

    const settings = await this.repo.updateSettings(companyId, {
      system: input.system as Prisma.InputJsonValue,
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.system.update',
      entityType: 'CompanySettings',
      entityId: settings.id,
      metadata: { keys: Object.keys(input.system) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapSettings(settings);
  }

  async listUsers(actor: AuthActor, params: Record<string, unknown>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination(params);
    const search = typeof params.search === 'string' ? params.search.trim() : undefined;
    const status =
      typeof params.status === 'string' && params.status
        ? (params.status as UserStatus)
        : undefined;

    const [rows, total] = await this.repo.listUsers(companyId, {
      page,
      pageSize,
      search: search || undefined,
      status,
    });

    return {
      items: rows.map(mapUser),
      pagination: paginationMeta(page, pageSize, total),
    };
  }

  async createUser(actor: AuthActor, input: CreateUserInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const roles = await this.repo.findRolesByCodes(input.roleCodes);
    if (roles.length !== input.roleCodes.length) {
      throw new ValidationError('One or more roles were not found');
    }

    if (
      roles.some((r) => r.code === 'SUPER_ADMIN') &&
      !this.actorHas(actor, 'roles:manage')
    ) {
      throw new ForbiddenError('Only Super Admin can assign the Super Admin role');
    }

    const temporaryPassword =
      input.temporaryPassword ?? `Tmp${randomBytes(4).toString('hex')}A1!`;
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await this.repo.createUser({
      companyId,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      status: 'ACTIVE',
      roleIds: roles.map((r) => r.id),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.users.create',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, roleCodes: input.roleCodes },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: mapUser(user),
      temporaryPassword: input.temporaryPassword ? undefined : temporaryPassword,
    };
  }

  async updateUser(actor: AuthActor, userId: string, input: UpdateUserInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findUserInCompany(companyId, userId);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    let roleIds: string[] | undefined;
    if (input.roleCodes) {
      const roles = await this.repo.findRolesByCodes(input.roleCodes);
      if (roles.length !== input.roleCodes.length) {
        throw new ValidationError('One or more roles were not found');
      }
      if (
        roles.some((r) => r.code === 'SUPER_ADMIN') &&
        !this.actorHas(actor, 'roles:manage')
      ) {
        throw new ForbiddenError('Only Super Admin can assign the Super Admin role');
      }
      roleIds = roles.map((r) => r.id);
    }

    if (userId === actor.id && input.status && input.status !== 'ACTIVE') {
      throw new ValidationError('You cannot deactivate your own account');
    }

    const user = await this.repo.updateUser(userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      status: input.status,
      roleIds,
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.users.update',
      entityType: 'User',
      entityId: userId,
      metadata: { fields: Object.keys(input) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapUser(user);
  }

  async deleteUser(actor: AuthActor, userId: string, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    if (userId === actor.id) {
      throw new ValidationError('You cannot delete your own account');
    }

    const existing = await this.repo.findUserInCompany(companyId, userId);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    if (existing.userRoles.some((ur) => ur.role.code === 'SUPER_ADMIN')) {
      throw new ForbiddenError('Super Admin accounts cannot be deleted from settings');
    }

    await this.repo.softDeleteUser(userId);

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.users.delete',
      entityType: 'User',
      entityId: userId,
      metadata: { email: existing.email },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { deleted: true };
  }

  async listRoles(actor: AuthActor) {
    await this.requireCompanyId(actor.id);
    const roles = await this.repo.listRoles();
    return { items: roles.map(mapRole) };
  }

  async listPermissions(actor: AuthActor) {
    await this.requireCompanyId(actor.id);
    const permissions = await this.repo.listPermissions();
    return { items: permissions };
  }

  async updateRolePermissions(
    actor: AuthActor,
    roleId: string,
    input: UpdateRolePermissionsInput,
    meta: RequestMeta,
  ) {
    await this.requireCompanyId(actor.id);
    const role = await this.repo.findRoleById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    if (role.code === 'SUPER_ADMIN') {
      throw new ForbiddenError('Super Admin permissions cannot be edited');
    }

    const permissions = await this.repo.findPermissionsByCodes(input.permissionCodes);
    if (permissions.length !== input.permissionCodes.length) {
      throw new ValidationError('One or more permissions were not found');
    }

    // Non–super-admin operators cannot grant roles:manage
    if (
      input.permissionCodes.includes('roles:manage') &&
      !this.actorHas(actor, 'roles:manage')
    ) {
      throw new ForbiddenError('You cannot grant roles:manage');
    }

    const updated = await this.repo.replaceRolePermissions(
      roleId,
      permissions.map((p) => p.id),
    );

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'settings.roles.permissions.update',
      entityType: 'Role',
      entityId: roleId,
      metadata: {
        roleCode: role.code,
        permissionCount: input.permissionCodes.length,
      },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapRole(updated);
  }

  async listAuditLogs(actor: AuthActor, params: Record<string, unknown>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination(params);
    const search = typeof params.search === 'string' ? params.search.trim() : undefined;
    const entityType =
      typeof params.entityType === 'string' ? params.entityType.trim() : undefined;
    const actorId = typeof params.actorId === 'string' ? params.actorId.trim() : undefined;

    const [rows, total] = await this.repo.listAuditLogs(companyId, {
      page,
      pageSize,
      search: search || undefined,
      entityType: entityType || undefined,
      actorId: actorId || undefined,
    });

    const items = rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      actor: row.actor
        ? {
            id: row.actor.id,
            email: row.actor.email,
            firstName: row.actor.firstName,
            lastName: row.actor.lastName,
          }
        : null,
    }));

    return {
      items,
      pagination: paginationMeta(page, pageSize, total),
    };
  }
}
