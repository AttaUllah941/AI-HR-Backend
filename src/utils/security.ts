import { env, isProduction } from '../config/env.js';
import { isIpAllowed as matchIpAllowlist, isValidIpOrCidr, normalizeCidr } from './ip-matcher.js';

const WEAK_SECRET_MARKERS = ['change-me', 'changeme', 'secret-min-32', 'your-secret', 'example'];

export function isWeakSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return WEAK_SECRET_MARKERS.some((marker) => lower.includes(marker)) || value.length < 32;
}

export function assertProductionSecrets(): void {
  if (!isProduction) return;

  if (isWeakSecret(env.JWT_ACCESS_SECRET) || isWeakSecret(env.JWT_REFRESH_SECRET)) {
    console.error(
      'Refusing to start: JWT secrets look weak or default. Set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production.',
    );
    process.exit(1);
  }

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    console.error(
      'Refusing to start: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production.',
    );
    process.exit(1);
  }
}

export function validatePasswordAgainstPolicy(
  password: string,
  policy: {
    passwordMinLength: number;
    passwordRequireLetter: boolean;
    passwordRequireNumber: boolean;
    passwordRequireSpecial: boolean;
  },
): string | null {
  if (password.length < policy.passwordMinLength) {
    return `Password must be at least ${policy.passwordMinLength} characters`;
  }
  if (password.length > 128) {
    return 'Password must be at most 128 characters';
  }
  if (policy.passwordRequireLetter && !/[A-Za-z]/.test(password)) {
    return 'Password must include a letter';
  }
  if (policy.passwordRequireNumber && !/[0-9]/.test(password)) {
    return 'Password must include a number';
  }
  if (policy.passwordRequireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include a special character';
  }
  return null;
}

export function normalizeIpAllowlist(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const item of values) {
    if (typeof item !== 'string' || !item.trim()) continue;
    if (!isValidIpOrCidr(item)) {
      throw new Error(`Invalid IP/CIDR in allowlist: ${item}`);
    }
    out.push(normalizeCidr(item));
  }
  return out;
}

/** Empty allowlist = allow all. Non-empty = must match. */
export function isClientIpAllowed(ip: string | undefined, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  if (!ip) return false;
  return matchIpAllowlist(ip, allowlist);
}

export const DEFAULT_SECURITY_POLICY = {
  maxFailedLogins: 5,
  lockoutMinutes: 15,
  passwordMinLength: 8,
  passwordRequireLetter: true,
  passwordRequireNumber: true,
  passwordRequireSpecial: false,
  requireMfaForPrivileged: false,
  allowSelfRegistration: true,
  refreshRateLimitPerWindow: 60,
  ipAllowlist: [] as string[],
};

export const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'HR_ADMIN']);
