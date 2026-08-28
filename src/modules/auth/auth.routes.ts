import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { authRateLimiter } from '../../middleware/auth-rate-limit.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { AuthController } from './controllers/auth.controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './validators/auth.validators.js';

const controller = new AuthController();

export const authRouter = Router();

authRouter.get('/status', asyncHandler(controller.status));

authRouter.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  asyncHandler(controller.register),
);
authRouter.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  asyncHandler(controller.login),
);
authRouter.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(controller.refresh),
);
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(controller.forgotPassword),
);
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(controller.resetPassword),
);
authRouter.post(
  '/verify-email',
  authRateLimiter,
  validateBody(verifyEmailSchema),
  asyncHandler(controller.verifyEmail),
);
authRouter.post(
  '/mfa/verify',
  authRateLimiter,
  validateBody(mfaVerifySchema),
  asyncHandler(controller.verifyMfa),
);

authRouter.get('/me', authMiddleware, asyncHandler(controller.me));
authRouter.post('/logout', authMiddleware, asyncHandler(controller.logout));
authRouter.post('/mfa/setup', authMiddleware, asyncHandler(controller.setupMfa));
authRouter.post(
  '/mfa/enable',
  authMiddleware,
  validateBody(mfaEnableSchema),
  asyncHandler(controller.enableMfa),
);
authRouter.post(
  '/mfa/disable',
  authMiddleware,
  validateBody(mfaDisableSchema),
  asyncHandler(controller.disableMfa),
);
