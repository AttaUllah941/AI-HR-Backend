import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../utils/app-error.js';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { extractRolesAndPermissions } from '../../auth/dto/auth.dto.js';
import { ProfileRepository } from '../repositories/profile.repository.js';
import type {
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
    if (
      input.firstName === undefined &&
      input.lastName === undefined &&
      input.phone === undefined &&
      input.avatarUrl === undefined
    ) {
      throw new ValidationError('No profile fields to update');
    }

    const avatarUrl =
      input.avatarUrl === '' || input.avatarUrl === undefined
        ? input.avatarUrl === ''
          ? null
          : undefined
        : input.avatarUrl;

    const updated = await this.repo.updateUser(actor.id, {
      ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
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

    const passwordHash = await hashPassword(input.newPassword);
    await this.repo.updateUser(actor.id, {
      passwordHash,
      passwordChangedAt: new Date(),
    });

    // Revoke other sessions for security after password change
    await this.repo.revokeOtherSessions(actor.id, actor.sessionId ?? null);

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.password.change',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { changed: true, otherSessionsRevoked: true };
  }

  async getPreferences(actor: AuthActor) {
    const prefs = await this.repo.getOrCreatePreferences(actor.id);
    return prefs;
  }

  async updatePreferences(actor: AuthActor, input: UpdatePreferencesInput) {
    if (Object.keys(input).length === 0) {
      throw new ValidationError('No preference fields to update');
    }
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
          current: actor.sessionId === row.id,
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
    const result = await this.repo.revokeOtherSessions(actor.id, actor.sessionId ?? null);
    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'profile.session.revoke_others',
      entityType: 'User',
      entityId: actor.id,
      metadata: { count: result.count },
    });
    return { revoked: result.count };
  }

  async listActivity(actor: AuthActor, params: Record<string, string | undefined>) {
    const take = Math.min(100, Math.max(1, Number(params.limit) || 30));
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
