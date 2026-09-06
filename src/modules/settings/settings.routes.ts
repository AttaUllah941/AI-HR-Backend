import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { SettingsController } from './controllers/settings.controller.js';
import {
  createUserSchema,
  updateCompanySchema,
  updateEmailSettingsSchema,
  updateIntegrationsSchema,
  updateRolePermissionsSchema,
  updateStorageSettingsSchema,
  updateSystemSettingsSchema,
  updateUserSchema,
} from './validators/settings.validators.js';

const controller = new SettingsController();

export const settingsRouter = Router();

settingsRouter.use(authMiddleware);

settingsRouter.get('/summary', requirePermissions('settings:view'), asyncHandler(controller.summary));

settingsRouter.get('/company', requirePermissions('settings:view'), asyncHandler(controller.getCompany));
settingsRouter.patch(
  '/company',
  requirePermissions('settings:update'),
  validateBody(updateCompanySchema),
  asyncHandler(controller.updateCompany),
);

settingsRouter.get('/config', requirePermissions('settings:view'), asyncHandler(controller.getConfig));
settingsRouter.patch(
  '/config/email',
  requirePermissions('settings:update'),
  validateBody(updateEmailSettingsSchema),
  asyncHandler(controller.updateEmail),
);
settingsRouter.patch(
  '/config/storage',
  requirePermissions('settings:update'),
  validateBody(updateStorageSettingsSchema),
  asyncHandler(controller.updateStorage),
);
settingsRouter.patch(
  '/config/integrations',
  requirePermissions('settings:update'),
  validateBody(updateIntegrationsSchema),
  asyncHandler(controller.updateIntegrations),
);
settingsRouter.patch(
  '/config/system',
  requirePermissions('settings:update'),
  validateBody(updateSystemSettingsSchema),
  asyncHandler(controller.updateSystem),
);

settingsRouter.get('/users', requirePermissions('users:view'), asyncHandler(controller.listUsers));
settingsRouter.post(
  '/users',
  requirePermissions('users:create'),
  validateBody(createUserSchema),
  asyncHandler(controller.createUser),
);
settingsRouter.patch(
  '/users/:id',
  requirePermissions('users:update'),
  validateBody(updateUserSchema),
  asyncHandler(controller.updateUser),
);
settingsRouter.delete(
  '/users/:id',
  requirePermissions('users:delete'),
  asyncHandler(controller.deleteUser),
);

settingsRouter.get('/roles', requirePermissions('roles:view'), asyncHandler(controller.listRoles));
settingsRouter.get(
  '/permissions',
  requirePermissions('roles:view'),
  asyncHandler(controller.listPermissions),
);
settingsRouter.put(
  '/roles/:id/permissions',
  requirePermissions('roles:manage'),
  validateBody(updateRolePermissionsSchema),
  asyncHandler(controller.updateRolePermissions),
);

settingsRouter.get('/audit-logs', requirePermissions('settings:view'), asyncHandler(controller.listAuditLogs));
