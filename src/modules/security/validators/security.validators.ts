import { z } from 'zod';
import { isValidIpOrCidr } from '../../../utils/ip-matcher.js';

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : value;

const optionalBool = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const ipOrCidrSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => isValidIpOrCidr(value), {
    message: 'Each allowlist entry must be a valid IP or CIDR',
  });

export const listLoginAttemptsQuerySchema = z.object({
  email: z.preprocess(emptyToUndefined, z.string().max(255).optional()),
  success: optionalBool,
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).optional(),
  ),
});

export const updateSecurityPolicySchema = z
  .object({
    maxFailedLogins: z.number().int().min(1).max(50).optional(),
    lockoutMinutes: z.number().int().min(1).max(1440).optional(),
    passwordMinLength: z.number().int().min(8).max(128).optional(),
    passwordRequireLetter: z.boolean().optional(),
    passwordRequireNumber: z.boolean().optional(),
    passwordRequireSpecial: z.boolean().optional(),
    requireMfaForPrivileged: z.boolean().optional(),
    allowSelfRegistration: z.boolean().optional(),
    refreshRateLimitPerWindow: z.number().int().min(5).max(1000).optional(),
    ipAllowlist: z.array(ipOrCidrSchema).max(100).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one security policy field is required',
  });

export type ListLoginAttemptsQueryInput = z.infer<typeof listLoginAttemptsQuerySchema>;
export type UpdateSecurityPolicyInput = z.infer<typeof updateSecurityPolicySchema>;
