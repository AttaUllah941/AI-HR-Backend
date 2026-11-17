import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/app-error.js';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { DEFAULT_SECURITY_POLICY, validatePasswordAgainstPolicy } from '../../../utils/security.js';
import { extractRolesAndPermissions } from '../../auth/dto/auth.dto.js';
import { ProfileRepository } from '../repositories/profile.repository.js';
import type {
  ActivityQueryInput,
  ChangePasswordInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '../validators/profile.validators.js';

type AuthActor = { id: string; permissions: string[]; sessionId?: string };

function humanizeAction(action: string): string {
  return action
    .split('.')
    .map((part) => part.replace(/-/g, ' '))
    .join(' · ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const short = ua.slice(0, 120);
  if (/Edg\//i.test(ua)) return 'Microsoft Edge';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return short;
}

export class ProfileService {
  constructor(private readonly repo = new ProfileRepository()) {}

  private async requireUser(userId: string) {
    const user = await this.repo.findUser(userId);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  private toProfile(user: Awaited<ReturnType<ProfileRepository['findUser']>>) {
    if (!user) throw new NotFoundError('User not found');
    const { roles, permissions } = extractRolesAndPermissions(user as never);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      companyId: user.companyId,
      roles,
      permissions,
      employee: user.employee,
      preferences: user.preference ?? {
        theme: 'system',
        locale: 'en-US',
        timezone: 'UTC',
        dateFormat: 'DD MMM YYYY',
        timeFormat: '24h',
        weekStartsOn: 1,
      },
    };
  }

  async getProfile(actor: AuthActor) {
    const user = await this.requireUser(actor.id);
    if (!user.preference) {
      await this.repo.getOrCreatePreferences(actor.id);
      return this.toProfile(await this.requireUser(actor.id));
    }
    return this.toProfile(user);
  }

  async updateProfile(
    actor: AuthActor,
    input: UpdateProfileInput,
    meta: { ip?: string; userAgent?: string },
  ) {
    const avatarUrl =
      input.avatarUrl === undefined
        ? undefined
        : input.avatarUrl === null || input.avatarUrl === ''
          ? null
          : input.avatarUrl;

    const phone =
      input.phone === undefined
        ? undefined
        : input.phone === null || input.phone.trim() === ''
          ? null
          : input.phone.trim();

    const updated = await this.repo.updateUser(actor.id, {
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.update',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.toProfile(updated);
  }

  async changePassword(
    actor: AuthActor,
    input: ChangePasswordInput,
    meta: { ip?: string; userAgent?: string },
  ) {
    const user = await this.repo.findUserAuth(actor.id);
    if (!user) throw new NotFoundError('User not found');

    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Current password is incorrect');

    if (input.currentPassword === input.newPassword) {
      throw new ValidationError('New password must be different from the current password');
    }

    const policy = user.companyId
      ? await this.repo.getSecurityPolicy(user.companyId)
      : DEFAULT_SECURITY_POLICY;
    const passwordError = validatePasswordAgainstPolicy(input.newPassword, {
      passwordMinLength: policy.passwordMinLength,
      passwordRequireLetter: policy.passwordRequireLetter,
      passwordRequireNumber: policy.passwordRequireNumber,
      passwordRequireSpecial: policy.passwordRequireSpecial,
    });
    if (passwordError) {
      throw new ValidationError(passwordError);
    }

    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updateUser(actor.id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });

    // Keep the current session; only revoke others when we know the session id.
    let otherSessionsRevoked = 0;
    if (actor.sessionId) {
      const result = await this.repo.revokeOtherSessions(actor.id, actor.sessionId);
      otherSessionsRevoked = result.count;
    }

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.password.change',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { otherSessionsRevoked },
    });

    return { changed: true, otherSessionsRevoked };
  }

  async getPreferences(actor: AuthActor) {
    const prefs = await this.repo.getOrCreatePreferences(actor.id);
    return prefs;
  }

  async updatePreferences(actor: AuthActor, input: UpdatePreferencesInput) {
    return this.repo.updatePreferences(actor.id, input);
  }

  async listSessions(actor: AuthActor) {
    const rows = await this.repo.listSessions(actor.id);
    const now = Date.now();
    return {
      items: rows.map((row) => {
        const expired = row.expiresAt.getTime() < now;
        const active = row.status === 'ACTIVE' && !expired && !row.revokedAt;
        return {
          id: row.id,
          status: expired && row.status === 'ACTIVE' ? 'EXPIRED' : row.status,
          current: Boolean(actor.sessionId) && actor.sessionId === row.id,
          ipAddress: row.ipAddress,
          userAgent: row.userAgent,
          deviceLabel: parseUserAgent(row.userAgent),
          expiresAt: row.expiresAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          active,
        };
      }),
    };
  }

  async revokeSession(actor: AuthActor, sessionId: string) {
    const session = await this.repo.findSession(actor.id, sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (actor.sessionId && session.id === actor.sessionId) {
      throw new ForbiddenError('Cannot revoke the current session from this endpoint — use logout');
    }
    if (session.status !== 'ACTIVE') {
      return { id: sessionId, revoked: true };
    }
    await this.repo.revokeSession(sessionId);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.session.revoke',
      entityType: 'Session',
      entityId: sessionId,
    });
    return { id: sessionId, revoked: true };
  }

  async revokeOtherSessions(actor: AuthActor) {
    if (!actor.sessionId) {
      throw new ValidationError(
        'Current session could not be identified; re-authenticate and try again',
      );
    }
    const result = await this.repo.revokeOtherSessions(actor.id, actor.sessionId);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.session.revoke_others',
      entityType: 'User',
      entityId: actor.id,
      metadata: { count: result.count },
    });
    return { revoked: result.count };
  }

  async listActivity(actor: AuthActor, params: ActivityQueryInput = {}) {
    const take = params.limit ?? 30;
    const rows = await this.repo.listActivity(actor.id, take);
    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        title: humanizeAction(row.action),
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
