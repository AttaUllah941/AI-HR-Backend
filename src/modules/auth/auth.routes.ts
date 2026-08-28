import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { AuthController } from './controllers/auth.controller.js';

const controller = new AuthController();

export const authRouter = Router();

authRouter.get('/status', asyncHandler(controller.status));
authRouter.post('/register', asyncHandler(controller.register));
authRouter.post('/login', asyncHandler(controller.login));
authRouter.post('/refresh', asyncHandler(controller.refresh));
authRouter.post('/forgot-password', asyncHandler(controller.forgotPassword));
authRouter.post('/reset-password', asyncHandler(controller.resetPassword));
authRouter.post('/verify-email', asyncHandler(controller.verifyEmail));
authRouter.post('/mfa/verify', asyncHandler(controller.verifyMfa));

authRouter.get('/me', authMiddleware, asyncHandler(controller.me));
authRouter.post('/logout', authMiddleware, asyncHandler(controller.logout));
authRouter.post('/mfa/setup', authMiddleware, asyncHandler(controller.setupMfa));
authRouter.post('/mfa/enable', authMiddleware, asyncHandler(controller.enableMfa));
authRouter.post('/mfa/disable', authMiddleware, asyncHandler(controller.disableMfa));
