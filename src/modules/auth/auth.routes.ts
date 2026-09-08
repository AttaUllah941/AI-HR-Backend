import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { AuthController } from './controllers/auth.controller.js';

const controller = new AuthController();

/** Stricter limiter for credential and token exchange endpoints. */
const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMITED',
  },
});

export const authRouter = Router();

authRouter.get('/status', asyncHandler(controller.status));

authRouter.post('/register', authSensitiveLimiter, asyncHandler(controller.register));
authRouter.post('/login', authSensitiveLimiter, asyncHandler(controller.login));
authRouter.post('/refresh', authSensitiveLimiter, asyncHandler(controller.refresh));
authRouter.post('/forgot-password', authSensitiveLimiter, asyncHandler(controller.forgotPassword));
authRouter.post('/reset-password', authSensitiveLimiter, asyncHandler(controller.resetPassword));
authRouter.post('/verify-email', authSensitiveLimiter, asyncHandler(controller.verifyEmail));
authRouter.post('/mfa/verify', authSensitiveLimiter, asyncHandler(controller.verifyMfa));

authRouter.get('/me', authMiddleware, asyncHandler(controller.me));
authRouter.post('/logout', authMiddleware, asyncHandler(controller.logout));
authRouter.post('/mfa/setup', authMiddleware, asyncHandler(controller.setupMfa));
authRouter.post('/mfa/enable', authMiddleware, asyncHandler(controller.enableMfa));
authRouter.post('/mfa/disable', authMiddleware, asyncHandler(controller.disableMfa));
