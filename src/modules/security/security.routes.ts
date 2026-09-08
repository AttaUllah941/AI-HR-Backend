import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { SecurityController } from './controllers/security.controller.js';
import { updateSecurityPolicySchema } from './validators/security.validators.js';

const controller = new SecurityController();

export const securityRouter = Router();

securityRouter.use(authMiddleware);

securityRouter.get(
  '/status',
  requirePermissions('settings:view'),
  asyncHandler(controller.status),
);
securityRouter.get(
  '/review',
  requirePermissions('settings:view'),
  asyncHandler(controller.review),
);
securityRouter.get(
  '/policy',
  requirePermissions('settings:view'),
  asyncHandler(controller.getPolicy),
);
securityRouter.patch(
  '/policy',
  requirePermissions('settings:update'),
  validateBody(updateSecurityPolicySchema),
  asyncHandler(controller.updatePolicy),
);
securityRouter.get(
  '/login-attempts',
  requirePermissions('settings:view'),
  asyncHandler(controller.listLoginAttempts),
);
