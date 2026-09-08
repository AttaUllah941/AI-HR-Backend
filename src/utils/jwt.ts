import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export interface MfaChallengePayload {
  sub: string;
  email: string;
  remember?: boolean;
  type: 'mfa_challenge';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>,
  expiresIn: string = env.JWT_REFRESH_EXPIRES_IN,
): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function signMfaChallengeToken(payload: Omit<MfaChallengePayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'mfa_challenge' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '5m',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (payload.type !== 'access') {
    throw new Error('Invalid access token type');
  }
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }
  return payload;
}

export function verifyMfaChallengeToken(token: string): MfaChallengePayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as MfaChallengePayload;
  if (payload.type !== 'mfa_challenge') {
    throw new Error('Invalid MFA challenge token type');
  }
  return payload;
}

const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Remember-me sessions last 30 days; otherwise use JWT_REFRESH_EXPIRES_IN (default 7d). */
export const REMEMBER_REFRESH_EXPIRES_IN = '30d';

export function parseDurationToMs(duration: string, fallbackMs = 7 * 24 * 60 * 60 * 1000): number {
  const match = /^(\d+)([smhd])$/i.exec(duration);
  if (!match) {
    return fallbackMs;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return value * (DURATION_MULTIPLIERS[unit] ?? DURATION_MULTIPLIERS.d);
}

export function getRefreshExpiryDate(remember = false): Date {
  const duration = remember ? REMEMBER_REFRESH_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;
  return new Date(Date.now() + parseDurationToMs(duration));
}

export function getRefreshExpiresIn(remember = false): string {
  return remember ? REMEMBER_REFRESH_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;
}

/** Convert a millisecond duration into a jwt `expiresIn` seconds string. */
export function msToJwtDuration(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return `${seconds}s`;
}
