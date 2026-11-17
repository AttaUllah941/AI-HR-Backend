import rateLimit from 'express-rate-limit';
import { DEFAULT_SECURITY_POLICY } from '../utils/security.js';

/**
 * Stricter limiter for credential endpoints to slow brute-force attempts.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMITED',
  },
});

/**
 * Separate budget for refresh tokens so session refresh does not share the
 * login/register brute-force bucket. Default aligns with company policy default.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: DEFAULT_SECURITY_POLICY.refreshRateLimitPerWindow,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many token refresh attempts, please try again later',
    code: 'REFRESH_RATE_LIMITED',
  },
});
