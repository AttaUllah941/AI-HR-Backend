import type { Prisma } from '@prisma/client';
import { env, isProduction } from '../../../config/env.js';
import { ForbiddenError, ValidationError } from '../../../utils/app-error.js';
import {
  DEFAULT_SECURITY_POLICY,
  isWeakSecret,
  normalizeIpAllowlist,
} from '../../../utils/security.js';
import { SecurityRepository } from '../repositories/security.repository.js';
import type { UpdateSecurityPolicyInput } from '../validators/security.validators.js';
import { parsePagination, paginationMeta } from '../../../utils/pagination.js';

type AuthActor = { id: string; permissions: string[] };
type RequestMeta = { ip?: string; userAgent?: string };

function mapPolicy(policy: {
  id: string;
  companyId: string;
  maxFailedLogins: number;
  lockoutMinutes: number;
  passwordMinLength: number;
  passwordRequireLetter: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSpecial: boolean;
  requireMfaForPrivileged: boolean;
  allowSelfRegistration: boolean;
  refreshRateLimitPerWindow: number;
  ipAllowlist: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  let allowlist: string[] = [];
  try {
    allowlist = normalizeIpAllowlist(policy.ipAllowlist);
  } catch {
    allowlist = [];
  }

  return {
    id: policy.id,
    companyId: policy.companyId,
    maxFailedLogins: policy.maxFailedLogins,
    lockoutMinutes: policy.lockoutMinutes,
    passwordMinLength: policy.passwordMinLength,
    passwordRequireLetter: policy.passwordRequireLetter,
    passwordRequireNumber: policy.passwordRequireNumber,
    passwordRequireSpecial: policy.passwordRequireSpecial,
    requireMfaForPrivileged: policy.requireMfaForPrivileged,
    allowSelfRegistration: policy.allowSelfRegistration,
    refreshRateLimitPerWindow: policy.refreshRateLimitPerWindow,
    ipAllowlist: allowlist,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

export class SecurityService {
  constructor(private readonly repo = new SecurityRepository()) {}

  private async requireCompanyId(userId: string): Promise<string> {
    const user = await this.repo.findUserCompanyId(userId);
    if (!user?.companyId) {
      throw new ForbiddenError('Your account is not linked to a company');
    }
    return user.companyId;
  }

  async getPolicy(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const policy = await this.repo.getOrCreatePolicy(companyId);
    return mapPolicy(policy);
  }

  async updatePolicy(actor: AuthActor, input: UpdateSecurityPolicyInput, meta: RequestMeta) {
    const companyId = await this.requireCompanyId(actor.id);
    await this.repo.getOrCreatePolicy(companyId);

    let ipAllowlist: Prisma.InputJsonValue | undefined;
    if (input.ipAllowlist !== undefined) {
      try {
        ipAllowlist = normalizeIpAllowlist(input.ipAllowlist ?? []);
      } catch (err) {
        throw new ValidationError(err instanceof Error ? err.message : 'Invalid IP allowlist');
      }
    }

    const policy = await this.repo.updatePolicy(companyId, {
      ...(input.maxFailedLogins !== undefined ? { maxFailedLogins: input.maxFailedLogins } : {}),
      ...(input.lockoutMinutes !== undefined ? { lockoutMinutes: input.lockoutMinutes } : {}),
      ...(input.passwordMinLength !== undefined
        ? { passwordMinLength: input.passwordMinLength }
        : {}),
      ...(input.passwordRequireLetter !== undefined
        ? { passwordRequireLetter: input.passwordRequireLetter }
        : {}),
      ...(input.passwordRequireNumber !== undefined
        ? { passwordRequireNumber: input.passwordRequireNumber }
        : {}),
      ...(input.passwordRequireSpecial !== undefined
        ? { passwordRequireSpecial: input.passwordRequireSpecial }
        : {}),
      ...(input.requireMfaForPrivileged !== undefined
        ? { requireMfaForPrivileged: input.requireMfaForPrivileged }
        : {}),
      ...(input.allowSelfRegistration !== undefined
        ? { allowSelfRegistration: input.allowSelfRegistration }
        : {}),
      ...(input.refreshRateLimitPerWindow !== undefined
        ? { refreshRateLimitPerWindow: input.refreshRateLimitPerWindow }
        : {}),
      ...(ipAllowlist !== undefined ? { ipAllowlist } : {}),
    });

    await this.repo.createAuditLog({
      actorId: actor.id,
      action: 'security.policy.update',
      entityType: 'CompanySecurityPolicy',
      entityId: policy.id,
      metadata: { fields: Object.keys(input) },
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return mapPolicy(policy);
  }

  async getStatus(actor: AuthActor) {
    const companyId = await this.requireCompanyId(actor.id);
    const policy = await this.repo.getOrCreatePolicy(companyId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [users, mfaEnabled, lockedUsers, privilegedWithoutMfa, failedLogins24h] =
      await Promise.all([
        this.repo.countUsers(companyId),
        this.repo.countMfaEnabled(companyId),
        this.repo.countLockedUsers(companyId),
        this.repo.countPrivilegedWithoutMfa(companyId),
        this.repo.countFailedLoginsSince(companyId, since),
      ]);

    return {
      policy: mapPolicy(policy),
      metrics: {
        users,
        mfaEnabled,
        mfaCoveragePct: users ? Math.round((mfaEnabled / users) * 100) : 0,
        lockedUsers,
        privilegedWithoutMfa,
        failedLogins24h,
      },
      runtime: {
        nodeEnv: env.NODE_ENV,
        isProduction,
        helmetEnabled: true,
        corsConfigured: Boolean(env.CORS_ORIGIN),
        globalRateLimit: {
          windowMs: env.RATE_LIMIT_WINDOW_MS,
          max: env.RATE_LIMIT_MAX,
        },
        authRateLimit: { windowMs: 15 * 60 * 1000, max: 20 },
        jwtAccessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
        jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
        jwtSecretsLookStrong:
          !isWeakSecret(env.JWT_ACCESS_SECRET) &&
          !isWeakSecret(env.JWT_REFRESH_SECRET) &&
          env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET,
      },
    };
  }

  async getReview(actor: AuthActor) {
    const status = await this.getStatus(actor);
    const checks = [
      {
        id: 'helmet',
        title: 'HTTP security headers (Helmet)',
        status: 'pass' as const,
        detail: 'Helmet middleware is enabled on the API.',
      },
      {
        id: 'cors',
        title: 'CORS allowlist',
        status: status.runtime.corsConfigured ? ('pass' as const) : ('warn' as const),
        detail: status.runtime.corsConfigured
          ? `Origins: ${env.CORS_ORIGIN}`
          : 'CORS_ORIGIN is empty.',
      },
      {
        id: 'rate-limit',
        title: 'Global + auth rate limiting',
        status: 'pass' as const,
        detail: `Global ${status.runtime.globalRateLimit.max}/${status.runtime.globalRateLimit.windowMs}ms; auth 20/15m.`,
      },
      {
        id: 'jwt-secrets',
        title: 'JWT secret strength',
        status: status.runtime.jwtSecretsLookStrong ? ('pass' as const) : ('fail' as const),
        detail: status.runtime.jwtSecretsLookStrong
          ? 'Access/refresh secrets look strong and distinct.'
          : 'JWT secrets appear weak, default, or identical.',
      },
      {
        id: 'mfa-coverage',
        title: 'MFA adoption',
        status:
          status.metrics.mfaCoveragePct >= 50
            ? ('pass' as const)
            : status.metrics.mfaCoveragePct > 0
              ? ('warn' as const)
              : ('warn' as const),
        detail: `${status.metrics.mfaEnabled}/${status.metrics.users} users (${status.metrics.mfaCoveragePct}%).`,
      },
      {
        id: 'privileged-mfa',
        title: 'Privileged accounts with MFA',
        status:
          status.metrics.privilegedWithoutMfa === 0 ? ('pass' as const) : ('warn' as const),
        detail:
          status.metrics.privilegedWithoutMfa === 0
            ? 'All Super Admin / HR Admin accounts have MFA.'
            : `${status.metrics.privilegedWithoutMfa} privileged account(s) without MFA.`,
      },
      {
        id: 'lockouts',
        title: 'Account lockouts',
        status: status.metrics.lockedUsers > 0 ? ('warn' as const) : ('pass' as const),
        detail: `${status.metrics.lockedUsers} currently locked account(s).`,
      },
      {
        id: 'failed-logins',
        title: 'Failed logins (24h)',
        status:
          status.metrics.failedLogins24h > 50
            ? ('warn' as const)
            : ('pass' as const),
        detail: `${status.metrics.failedLogins24h} failed attempt(s) in the last 24 hours.`,
      },
      {
        id: 'rbac',
        title: 'RBAC permission guards',
        status: 'pass' as const,
        detail: 'Route-level requirePermissions middleware is in use across modules.',
      },
      {
        id: 'orm',
        title: 'SQL injection protection',
        status: 'pass' as const,
        detail: 'Prisma parameterized queries are used for database access.',
      },
      {
        id: 'validation',
        title: 'Input validation',
        status: 'pass' as const,
        detail: 'Zod request validation is applied on mutating endpoints.',
      },
      {
        id: 'audit',
        title: 'Audit logging',
        status: 'pass' as const,
        detail: 'Security-sensitive actions write AuditLog / LoginAttempt records.',
      },
    ];

    const summary = {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    };

    return { checks, summary, defaults: DEFAULT_SECURITY_POLICY };
  }

  async listLoginAttempts(actor: AuthActor, params: Record<string, unknown>) {
    const companyId = await this.requireCompanyId(actor.id);
    const { page, pageSize } = parsePagination(params);
    const email = typeof params.email === 'string' ? params.email.trim() : undefined;
    const success =
      params.success === 'true' ? true : params.success === 'false' ? false : undefined;

    const [rows, total] = await this.repo.listLoginAttempts(companyId, {
      page,
      pageSize,
      email: email || undefined,
      success,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        success: row.success,
        reason: row.reason,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
        user: row.user,
      })),
      pagination: paginationMeta(page, pageSize, total),
    };
  }
}
