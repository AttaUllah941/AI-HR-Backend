import { z } from 'zod';

export const updateSecurityPolicySchema = z.object({
  maxFailedLogins: z.number().int().min(1).max(50).optional(),
  lockoutMinutes: z.number().int().min(1).max(1440).optional(),
  passwordMinLength: z.number().int().min(8).max(128).optional(),
  passwordRequireLetter: z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  passwordRequireSpecial: z.boolean().optional(),
  requireMfaForPrivileged: z.boolean().optional(),
  allowSelfRegistration: z.boolean().optional(),
  refreshRateLimitPerWindow: z.number().int().min(5).max(1000).optional(),
  ipAllowlist: z.array(z.string().min(1).max(80)).max(100).optional().nullable(),
});

export type UpdateSecurityPolicyInput = z.infer<typeof updateSecurityPolicySchema>;
