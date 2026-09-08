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
  getRefreshExpiresIn,
  msToJwtDuration,
  signAccessToken,
  signMfaChallengeToken,
  signRefreshToken,
  verifyMfaChallengeToken,
  verifyRefreshToken,
} from '../../../utils/jwt.js';
import { buildMfaUri, createMfaSecret, verifyMfaCode } from '../../../utils/mfa.js';
import { emailService } from '../../../services/email/email.service.js';
import { isDevelopment } from '../../../config/env.js';
import { AuthRepository, type UserWithAuth } from '../repositories/auth.repository.js';
import { extractRolesAndPermissions, toPublicUser } from '../dto/auth.dto.js';
import type {
  ForgotPasswordInput,
  LoginInput,
  MfaDisableInput,
  MfaEnableInput,
  MfaVerifyInput,
  RefreshInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../validators/auth.validators.js';

export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async register(input: RegisterInput, meta: { ip?: string; userAgent?: string }) {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('An account with this email already exists');
    }

    let companyId: string | undefined;
    if (input.companyName) {
      const company = await this.repo.createCompany(input.companyName);
      companyId = company.id;
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.repo.createUser({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      companyId,
      roleCode: 'EMPLOYEE',
      status: 'PENDING_VERIFICATION',
    });

    const rawVerifyToken = generateRawToken();
    await this.repo.createEmailVerificationToken(
      user.id,
      hashToken(rawVerifyToken),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    const verifyLink = emailService.buildAppLink(`/auth/verify-email?token=${rawVerifyToken}`);
    await emailService.send({
      to: user.email,
      subject: 'Verify your Zenith HR email',
      text: `Welcome to Zenith HR. Verify your email: ${verifyLink}`,
    });

    await this.repo.createAuditLog({
      actorId: user.id,
      action: 'auth.register',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: toPublicUser(user),
      ...(isDevelopment ? { verificationToken: rawVerifyToken } : {}),
    };
  }

  async login(input: LoginInput, meta: { ip?: string; userAgent?: string }) {
    const user = await this.repo.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (
      user.status === 'SUSPENDED' ||
      user.status === 'DELETED' ||
      user.status === 'INACTIVE'
    ) {
      throw new ForbiddenError('Account is not allowed to sign in');
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new ForbiddenError('Please verify your email before signing in');
    }

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = signMfaChallengeToken({
        sub: user.id,
        email: user.email,
        remember: Boolean(input.remember),
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

    return this.issueSession(user, meta, 'auth.login', Boolean(input.remember));
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

    if (!verifyMfaCode(user.mfaSecret, input.code)) {
      throw new UnauthorizedError('Invalid authentication code');
    }

    return this.issueSession(user, meta, 'auth.mfa.verify', Boolean(challenge.remember));
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
      user.status === 'INACTIVE' ||
      user.status === 'PENDING_VERIFICATION'
    ) {
      throw new UnauthorizedError('Account is not allowed to refresh');
    }

    const { roles, permissions } = extractRolesAndPermissions(user);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    });

    // Preserve remaining session lifetime on rotation (do not extend beyond DB expiry).
    const refreshToken = signRefreshToken(
      { sub: user.id, sid: session.id },
      msToJwtDuration(Math.max(session.expiresAt.getTime() - Date.now(), 60_000)),
    );
    await this.repo.updateSession(session.id, {
      refreshTokenHash: hashToken(refreshToken),
    });

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }

  async logout(userId: string, refreshToken?: string) {
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
        ...(isDevelopment ? { resetToken: rawToken } : {}),
      };
    }

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(input: ResetPasswordInput) {
    const record = await this.repo.findPasswordResetToken(hashToken(input.token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await hashPassword(input.password);
    await this.repo.updateUser(record.userId, {
      passwordHash,
      passwordChangedAt: new Date(),
    });
    await this.repo.markPasswordResetUsed(record.id);
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

  async setupMfa(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.mfaEnabled) {
      throw new ConflictError('MFA is already enabled for this account');
    }

    const secret = createMfaSecret();
    await this.repo.updateUser(userId, { mfaSecret: secret, mfaEnabled: false });

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

    if (!verifyMfaCode(user.mfaSecret, input.code)) {
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

    if (user.mfaEnabled && user.mfaSecret && !verifyMfaCode(user.mfaSecret, input.code)) {
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
    const refreshExpiresIn = getRefreshExpiresIn(remember);

    const session = await this.repo.createSession({
      userId: user.id,
      refreshTokenHash: 'pending',
      expiresAt: getRefreshExpiryDate(remember),
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
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
      metadata: { remember },
    });

    return {
      mfaRequired: false as const,
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
