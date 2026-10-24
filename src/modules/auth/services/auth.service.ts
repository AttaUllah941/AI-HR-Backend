import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../utils/app-error.js';
import { hashPassword, verifyPassword } from '../../../utils/password.js';
import { generateRawToken, hashToken } from '../../../utils/token-hash.js';
import {
  getRefreshExpiryDate,
  signAccessToken,
  signMfaChallengeToken,
  signRefreshToken,
  verifyMfaChallengeToken,
  verifyRefreshToken,
} from '../../../utils/jwt.js';
import {
  buildMfaUri,
  createMfaSecret,
  isLegacyMfaSecret,
  openMfaSecret,
  sealMfaSecret,
  verifyMfaCode,
} from '../../../utils/mfa.js';
import { emailService } from '../../../services/email/email.service.js';
import { Prisma } from '@prisma/client';
import { isDevelopment } from '../../../config/env.js';
import {
  DEFAULT_SECURITY_POLICY,
  isClientIpAllowed,
  normalizeIpAllowlist,
  PRIVILEGED_ROLES,
  validatePasswordAgainstPolicy,
} from '../../../utils/security.js';
import { AuthRepository, type UserWithAuth } from '../repositories/auth.repository.js';
import { extractRolesAndPermissions, toPublicUser } from '../dto/auth.dto.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  MfaDisableInput,
  MfaEnableInput,
  MfaSetupInput,
  MfaVerifyInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../validators/auth.validators.js';

/** Raw verification/reset tokens are only echoed in local dev with the console email sink. */
function exposeDevTokens(): boolean {
  return isDevelopment && emailService.providerName === 'console';
}

export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async register(input: RegisterInput, meta: { ip?: string; userAgent?: string }) {
    // Self-registration always creates a brand-new tenant that starts from the default policy.
    if (!DEFAULT_SECURITY_POLICY.allowSelfRegistration) {
      throw new ForbiddenError('Self-registration is disabled');
    }

    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    // New tenants start with DEFAULT_SECURITY_POLICY; validate before creating company.
    const passwordError = validatePasswordAgainstPolicy(input.password, DEFAULT_SECURITY_POLICY);
    if (passwordError) {
      throw new ValidationError(passwordError);
    }

    const passwordHash = await hashPassword(input.password);
    let user;
    try {
      user = await this.repo.registerUser({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        companyName: input.companyName,
        // Whoever founds a company administers it; company-less signups stay regular employees.
        roleCode: input.companyName ? 'HR_ADMIN' : 'EMPLOYEE',
        status: 'PENDING_VERIFICATION',
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }

    const rawVerifyToken = generateRawToken();
    const verificationTokenHash = hashToken(rawVerifyToken);
    await this.repo.createEmailVerificationToken(
      user.id,
      verificationTokenHash,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    const verifyLink = emailService.buildAppLink(`/auth/verify-email?token=${rawVerifyToken}`);
    await emailService.send({
      to: user.email,
      subject: 'Verify your Zenith HR email',
      text: `Welcome to Zenith HR. Verify your email: ${verifyLink}`,
    });

    // Local/dev has no real inbox — activate immediately so login works after register.
    let publicUser = user;
    if (isDevelopment) {
      const verification = await this.repo.findEmailVerificationToken(verificationTokenHash);
      if (verification) {
        await this.repo.markEmailVerificationUsed(verification.id);
      }
      publicUser = await this.repo.updateUser(user.id, {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
    }

    await this.repo.createAuditLog({
      actorId: user.id,
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: toPublicUser(publicUser),
      ...(exposeDevTokens() ? { verificationToken: rawVerifyToken } : {}),
    };
  }

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string }) {
    const email = input.email.toLowerCase();
    const user = await this.repo.findByEmail(email);

    if (!user) {
      await this.repo.createLoginAttempt({
        email,
        success: false,
        reason: 'unknown_user',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    const policy = user.companyId ? await this.repo.getSecurityPolicy(user.companyId) : null;
    const maxFailed = policy?.maxFailedLogins ?? 5;
    const lockoutMinutes = policy?.lockoutMinutes ?? 15;
    const now = new Date();
    const isLocked = user.lockedUntil != null && user.lockedUntil > now;

    // Account state, lockout and network restrictions are only disclosed after the
    // password has been verified, so they cannot be used to enumerate accounts.
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const staleLock = user.lockedUntil != null && user.lockedUntil <= now;
      const nextCount = (staleLock ? 0 : (user.failedLoginCount ?? 0)) + 1;
      const shouldLock = !isLocked && nextCount >= maxFailed;
      if (!isLocked) {
        await this.repo.updateUser(user.id, {
          failedLoginCount: nextCount,
          ...(shouldLock ? { lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) } : {}),
        });
      }
      await this.repo.createLoginAttempt({
        companyId: user.companyId,
        userId: user.id,
        email,
        success: false,
        reason: isLocked ? 'account_locked' : shouldLock ? 'locked_after_failures' : 'bad_password',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    if (policy) {
      let allowlist: string[] = [];
      try {
        allowlist = normalizeIpAllowlist(policy.ipAllowlist);
      } catch {
        allowlist = [];
      }
      if (!isClientIpAllowed(meta.ip, allowlist)) {
        await this.repo.createLoginAttempt({
          companyId: user.companyId,
          userId: user.id,
          email,
          success: false,
          reason: 'ip_blocked',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        });
        throw new ForbiddenError('Sign-in from this network is not allowed');
      }
    }

    if (isLocked) {
      throw new ForbiddenError('Account is temporarily locked due to failed sign-in attempts');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      await this.repo.createLoginAttempt({
        companyId: user.companyId,
        userId: user.id,
        email,
        success: false,
        reason: 'status_blocked',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new ForbiddenError('Account is not allowed to sign in');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenError('Please verify your email before signing in');
    }

    if (user.mfaEnabled && user.mfaSecret) {
      await this.repo.createLoginAttempt({
        companyId: user.companyId,
        userId: user.id,
        email,
        success: true,
        reason: 'mfa_challenge',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      const mfaToken = signMfaChallengeToken({
        sub: user.id,
        email: user.email,
        remember: input.remember ?? false,
      });
      return {
        mfaRequired: true as const,
        mfaToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      };
    }

    await this.repo.updateUser(user.id, { failedLoginCount: 0, lockedUntil: null });

    const { roles } = extractRolesAndPermissions(user);
    const privileged = roles.some((r) => PRIVILEGED_ROLES.has(r));
    const securityWarnings: string[] = [];
    if (policy?.requireMfaForPrivileged && privileged && !user.mfaEnabled) {
      securityWarnings.push('MFA_REQUIRED_FOR_PRIVILEGED');
    }

    const session = await this.issueSession(user, meta, 'auth.login', input.remember);
    await this.repo.createLoginAttempt({
      companyId: user.companyId,
      userId: user.id,
      email,
      success: true,
      reason: 'ok',
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...session,
      ...(securityWarnings.length ? { securityWarnings } : {}),
    };
  }

  async verifyMfa(input: MfaVerifyInput, meta: { ip?: string; userAgent?: string }) {
    let challenge;
    try {
      challenge = verifyMfaChallengeToken(input.mfaToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired MFA challenge');
    }

    const user = await this.repo.findById(challenge.sub);
    if (!user?.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedError('MFA is not enabled for this account');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenError('Please verify your email before signing in');
    }

    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new ForbiddenError('Account is not allowed to sign in');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenError('Account is temporarily locked due to failed sign-in attempts');
    }

    const mfaPlain = openMfaSecret(user.mfaSecret);
    if (!verifyMfaCode(mfaPlain, input.code)) {
      const policy = user.companyId ? await this.repo.getSecurityPolicy(user.companyId) : null;
      const maxFailed = policy?.maxFailedLogins ?? 5;
      const lockoutMinutes = policy?.lockoutMinutes ?? 15;
      const staleLock = user.lockedUntil != null && user.lockedUntil <= new Date();
      const nextCount = (staleLock ? 0 : (user.failedLoginCount ?? 0)) + 1;
      const shouldLock = nextCount >= maxFailed;
      await this.repo.updateUser(user.id, {
        failedLoginCount: nextCount,
        ...(shouldLock ? { lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) } : {}),
      });
      await this.repo.createLoginAttempt({
        companyId: user.companyId,
        userId: user.id,
        email: user.email,
        success: false,
        reason: shouldLock ? 'locked_after_failures' : 'bad_mfa_code',
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid authentication code');
    }

    await this.repo.updateUser(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
      // Lazily migrate legacy plaintext secrets to encrypted storage.
      ...(isLegacyMfaSecret(user.mfaSecret) ? { mfaSecret: sealMfaSecret(mfaPlain) } : {}),
    });
    return this.issueSession(user, meta, 'auth.mfa.verify', challenge.remember);
  }

  async refresh(input: RefreshInput) {
    let payload;
    try {
      payload = verifyRefreshToken(input.refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const tokenHash = hashToken(input.refreshToken);
    const session = await this.repo.findActiveSession(payload.sub, tokenHash);
    if (!session || session.id !== payload.sid) {
      throw new UnauthorizedError('Session expired or revoked');
    }

    const user = await this.repo.findById(payload.sub);
    if (
      !user ||
      user.status === 'SUSPENDED' ||
      user.status === 'DELETED' ||
      user.status === 'PENDING_VERIFICATION' ||
      (user.lockedUntil != null && user.lockedUntil > new Date())
    ) {
      throw new UnauthorizedError('Account is not allowed to refresh');
    }

    const { roles, permissions } = extractRolesAndPermissions(user);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      sid: session.id,
    });

    // Preserve the lifetime the session was issued with (e.g. "remember me" = 30d).
    const lifetimeSeconds =
      payload.exp && payload.iat && payload.exp > payload.iat ? payload.exp - payload.iat : undefined;
    const refreshExpiresIn = lifetimeSeconds ? `${lifetimeSeconds}s` : undefined;
    const refreshToken = signRefreshToken({ sub: user.id, sid: session.id }, refreshExpiresIn);
    const rotated = await this.repo.rotateSession(session.id, tokenHash, {
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: getRefreshExpiryDate(refreshExpiresIn),
    });
    if (!rotated) {
      throw new UnauthorizedError('Session expired or revoked');
    }

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  async logout(userId: string, refreshToken?: string, currentSessionId?: string) {
    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken);
        const session = await this.repo.findActiveSession(userId, hashToken(refreshToken));
        if (session && payload.sid === session.id) {
          await this.repo.updateSession(session.id, {
            status: 'REVOKED',
            revokedAt: new Date(),
          });
        }
      } catch {
        // Ignore invalid refresh on logout
      }
      // Always end the session the access token belongs to, even if the refresh token was stale.
      if (currentSessionId) {
        await this.repo.revokeSessionForUser(userId, currentSessionId);
      }
    } else {
      await this.repo.revokeUserSessions(userId);
    }

    await this.repo.createAuditLog({
      actorId: userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: userId,
    });

    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toPublicUser(user);
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await this.repo.findByEmail(input.email);
    if (user) {
      await this.repo.invalidatePasswordResetTokens(user.id);
      const rawToken = generateRawToken();
      await this.repo.createPasswordResetToken(
        user.id,
        hashToken(rawToken),
        new Date(Date.now() + 60 * 60 * 1000),
      );

      const resetLink = emailService.buildAppLink(`/auth/reset-password?token=${rawToken}`);
      await emailService.send({
        to: user.email,
        subject: 'Reset your Zenith HR password',
        text: `Reset your password using this link (valid 1 hour): ${resetLink}`,
      });

      return {
        message: 'If an account exists, a reset link has been sent',
        ...(exposeDevTokens() ? { resetToken: rawToken } : {}),
      };
    }

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(input: ResetPasswordInput) {
    const record = await this.repo.findPasswordResetToken(hashToken(input.token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    if (record.user.companyId) {
      const policy = await this.repo.getSecurityPolicy(record.user.companyId);
      const passwordError = validatePasswordAgainstPolicy(input.password, {
        passwordMinLength: policy.passwordMinLength,
        passwordRequireLetter: policy.passwordRequireLetter,
        passwordRequireNumber: policy.passwordRequireNumber,
        passwordRequireSpecial: policy.passwordRequireSpecial,
      });
      if (passwordError) {
        throw new ValidationError(passwordError);
      }
    }

    const consumed = await this.repo.consumePasswordResetToken(record.id);
    if (!consumed) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(input.password);
    await this.repo.updateUser(record.userId, {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    });
    await this.repo.revokeUserSessions(record.userId);

    await this.repo.createAuditLog({
      actorId: record.userId,
      action: 'auth.password.reset',
      entityType: 'User',
      entityId: record.userId,
    });

    return { reset: true };
  }

  async verifyEmail(input: VerifyEmailInput) {
    const record = await this.repo.findEmailVerificationToken(hashToken(input.token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired verification token');
    }

    await this.repo.updateUser(record.userId, {
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
    await this.repo.markEmailVerificationUsed(record.id);

    return { verified: true };
  }

  async setupMfa(userId: string, input: MfaSetupInput = {}) {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Re-running setup replaces the secret and turns MFA off, so re-authenticate first.
    if (user.mfaEnabled) {
      if (!input.password || !input.code) {
        throw new ValidationError('Current password and authentication code are required');
      }
      const validPassword = await verifyPassword(input.password, user.passwordHash);
      if (!validPassword) {
        throw new UnauthorizedError('Invalid password');
      }
      if (!user.mfaSecret || !verifyMfaCode(openMfaSecret(user.mfaSecret), input.code)) {
        throw new UnauthorizedError('Invalid authentication code');
      }
    }

    const secret = createMfaSecret();
    await this.repo.updateUser(userId, { mfaSecret: sealMfaSecret(secret), mfaEnabled: false });

    return {
      secret,
      otpauthUrl: buildMfaUri(secret, user.email),
    };
  }

  async enableMfa(userId: string, input: MfaEnableInput) {
    const user = await this.repo.findById(userId);
    if (!user?.mfaSecret) {
      throw new ValidationError('Run MFA setup first');
    }

    if (!verifyMfaCode(openMfaSecret(user.mfaSecret), input.code)) {
      throw new UnauthorizedError('Invalid authentication code');
    }

    await this.repo.updateUser(userId, { mfaEnabled: true });
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'auth.mfa.enable',
      entityType: 'User',
      entityId: userId,
    });

    return { mfaEnabled: true };
  }

  async disableMfa(userId: string, input: MfaDisableInput) {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const validPassword = await verifyPassword(input.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid password');
    }

    if (user.mfaEnabled && user.mfaSecret && !verifyMfaCode(openMfaSecret(user.mfaSecret), input.code)) {
      throw new UnauthorizedError('Invalid authentication code');
    }

    await this.repo.updateUser(userId, { mfaEnabled: false, mfaSecret: null });
    await this.repo.createAuditLog({
      actorId: userId,
      action: 'auth.mfa.disable',
      entityType: 'User',
      entityId: userId,
    });

    return { mfaEnabled: false };
  }

  private async issueSession(
    user: UserWithAuth,
    meta: { ip?: string; userAgent?: string },
    action: string,
    remember = false,
  ) {
    const { roles, permissions } = extractRolesAndPermissions(user);
    const refreshExpiresIn = remember ? '30d' : undefined;

    const session = await this.repo.createSession({
      userId: user.id,
      refreshTokenHash: 'pending',
      expiresAt: getRefreshExpiryDate(refreshExpiresIn),
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      sid: session.id,
    });
    const refreshToken = signRefreshToken({ sub: user.id, sid: session.id }, refreshExpiresIn);

    await this.repo.updateSession(session.id, {
      refreshTokenHash: hashToken(refreshToken),
    });

    await this.repo.updateUser(user.id, { lastLoginAt: new Date() });
    await this.repo.createAuditLog({
      actorId: user.id,
      action,
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      mfaRequired: false as const,
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
