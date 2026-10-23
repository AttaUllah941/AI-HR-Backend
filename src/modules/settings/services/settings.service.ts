import { randomBytes } from 'node:crypto';
import type { Prisma, UserStatus } from '@prisma/client';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../utils/app-error.js';
import { env, isDevelopment } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { emailService } from '../../../services/email/email.service.js';
import { AppError } from '../../../utils/app-error.js';
import { hashPassword } from '../../../utils/password.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';
import type {
  CreateUserInput,
  ListAuditLogsQueryInput,
  ListUsersQueryInput,
  UpdateCompanyInput,
  UpdateEmailSettingsInput,
  UpdateIntegrationsInput,
  UpdateRolePermissionsInput,
  UpdateStorageSettingsInput,
  UpdateSystemSettingsInput,
  UpdateUserInput,
} from '../validators/settings.validators.js';

type AuthActor = { id: string; permissions: string[]; roles: string[] };
type RequestMeta = { ip?: string; userAgent?: string };

function emptyToNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

/** Hides credentials embedded in a relay URL (https://user:pass@host -> https://***:***@host). */
function maskSmtpUrl(value: string | null): string | null {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = '***';
      url.password = '***';
    }
    url.search = '';
    return url.toString();
  } catch {
    return '***';
  }
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
      smtpUrl: maskSmtpUrl(settings.emailSmtpUrl),
      // The API key is only ever read from the server environment (EMAIL_API_KEY).
      apiKeySet: Boolean(env.EMAIL_API_KEY),
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

  private isSuperAdmin(actor: AuthActor) {
    return actor.roles.includes('SUPER_ADMIN');
  }

  /** Roles an actor may assign: never SUPER_ADMIN, nor any role holding permissions the actor lacks. */
  private assertCanAssignRoles(
    actor: AuthActor,
    roles: Array<{ code: string; rolePermissions: Array<{ permission: { code: string } }> }>,
  ) {
    if (this.isSuperAdmin(actor)) return;
    if (roles.some((r) => r.code === 'SUPER_ADMIN')) {
      throw new ForbiddenError('Only Super Admin can assign the Super Admin role');
    }
    for (const role of roles) {
      const missing = role.rolePermissions.find((rp) => !this.actorHas(actor, rp.permission.code));
      if (missing) {
        throw new ForbiddenError(
          `You cannot assign the ${role.code} role because it grants permissions you do not hold`,
        );
      }
    }
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

    if (input.emailApiKey !== undefined && input.emailApiKey !== null && input.emailApiKey !== '') {
      throw new ValidationError(
        'The email API key cannot be stored through settings. Set EMAIL_API_KEY in the server environment instead.',
      );
    }
    const emailApiKeySet: boolean | undefined = input.clearApiKey ? false : undefined;

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
        apiKeySet: Boolean(env.EMAIL_API_KEY),
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

  async listUsers(actor: AuthActor, params: ListUsersQueryInput = {}) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination({
      page: params.page,
      pageSize: params.pageSize,
    });

    const [rows, total] = await this.repo.listUsers(companyId, {
      page,
      pageSize,
      search: params.search?.trim() || undefined,
      status: params.status,
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

    this.assertCanAssignRoles(actor, roles);

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

    // A generated password is only returned in the response for local development with the
    // console email provider; otherwise it is delivered by email and never echoed back.
    let generatedPasswordForResponse: string | undefined;
    if (!input.temporaryPassword) {
      if (isDevelopment && emailService.providerName === 'console') {
        generatedPasswordForResponse = temporaryPassword;
      } else {
        try {
          await emailService.send({
            to: user.email,
            subject: 'Your account has been created',
            text: `An account was created for you.\n\nSign in: ${emailService.buildAppLink('/auth/login')}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change it after signing in.`,
          });
        } catch (error) {
          logger.error('Failed to email temporary password', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          await this.repo.softDeleteUser(user.id);
          throw new AppError(
            'The user could not be created because the credentials email failed to send',
            502,
            'EMAIL_DELIVERY_FAILED',
          );
        }
      }
    }

    return {
      user: mapUser(user),
      temporaryPassword: generatedPasswordForResponse,
      temporaryPasswordEmailed: !input.temporaryPassword && !generatedPasswordForResponse,
    };
  }

  async updateUser(actor: AuthActor, userId: string, input: UpdateUserInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    const existing = await this.repo.findUserInCompany(companyId, userId);
    if (!existing) {
      throw new NotFoundError('User not found');
    }

    const targetIsSuperAdmin = existing.userRoles.some((ur) => ur.role.code === 'SUPER_ADMIN');
    if (
      targetIsSuperAdmin &&
      !this.isSuperAdmin(actor) &&
      (input.roleCodes !== undefined || input.status !== undefined)
    ) {
      throw new ForbiddenError('Only Super Admin can change the status or roles of a Super Admin');
    }
    if (userId === actor.id && input.roleCodes !== undefined) {
      throw new ForbiddenError('You cannot change your own roles');
    }

    let roleIds: string[] | undefined;
    if (input.roleCodes) {
      const roles = await this.repo.findRolesByCodes(input.roleCodes);
      if (roles.length !== input.roleCodes.length) {
        throw new ValidationError('One or more roles were not found');
      }
      this.assertCanAssignRoles(actor, roles);
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

    if ((input.status !== undefined && input.status !== 'ACTIVE') || roleIds !== undefined) {
      await this.repo.revokeUserSessions(userId);
    }

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
    await this.repo.revokeUserSessions(userId);

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
    // Roles are shared across all tenants, so only a Super Admin may edit them.
    if (!this.isSuperAdmin(actor)) {
      throw new ForbiddenError('Only Super Admin can edit role permissions');
    }
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

  async listAuditLogs(actor: AuthActor, params: ListAuditLogsQueryInput = {}) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination({
      page: params.page,
      pageSize: params.pageSize,
    });

    const [rows, total] = await this.repo.listAuditLogs(companyId, {
      page,
      pageSize,
      search: params.search?.trim() || undefined,
      entityType: params.entityType?.trim() || undefined,
      actorId: params.actorId || undefined,
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
