import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import {
  createTemplateSchema,
  registerDeviceSchema,
  sendNotificationSchema,
  updateTemplateSchema,
  upsertPreferencesSchema,
} from './validators/notifications.validators.js';

const controller = new NotificationsController();

export const notificationsRouter = Router();

notificationsRouter.use(authMiddleware);

notificationsRouter.get(
  '/status',
  requirePermissions('notifications:view'),
  asyncHandler(controller.status),
);
notificationsRouter.get(
  '/summary',
  requirePermissions('notifications:view'),
  asyncHandler(controller.summary),
);
notificationsRouter.get(
  '/feed',
  requirePermissions('notifications:view'),
  asyncHandler(controller.feed),
);

notificationsRouter.get(
  '/',
  requirePermissions('notifications:view'),
  asyncHandler(controller.list),
);
notificationsRouter.post(
  '/read-all',
  requirePermissions('notifications:view'),
  asyncHandler(controller.markAllRead),
);
notificationsRouter.get(
  '/preferences',
  requirePermissions('notifications:view'),
  asyncHandler(controller.getPreferences),
);
notificationsRouter.put(
  '/preferences',
  requirePermissions('notifications:view'),
  validateBody(upsertPreferencesSchema),
  asyncHandler(controller.upsertPreferences),
);

notificationsRouter.get(
  '/templates',
  requirePermissions('notifications:manage'),
  asyncHandler(controller.listTemplates),
);
notificationsRouter.post(
  '/templates',
  requirePermissions('notifications:manage'),
  validateBody(createTemplateSchema),
  asyncHandler(controller.createTemplate),
);
notificationsRouter.patch(
  '/templates/:id',
  requirePermissions('notifications:manage'),
  validateBody(updateTemplateSchema),
  asyncHandler(controller.updateTemplate),
);
notificationsRouter.delete(
  '/templates/:id',
  requirePermissions('notifications:manage'),
  asyncHandler(controller.deleteTemplate),
);

notificationsRouter.get(
  '/devices',
  requirePermissions('notifications:view'),
  asyncHandler(controller.listDevices),
);
notificationsRouter.post(
  '/devices',
  requirePermissions('notifications:view'),
  validateBody(registerDeviceSchema),
  asyncHandler(controller.registerDevice),
);
notificationsRouter.delete(
  '/devices/:id',
  requirePermissions('notifications:view'),
  asyncHandler(controller.removeDevice),
);

notificationsRouter.post(
  '/send',
  requirePermissions('notifications:manage'),
  validateBody(sendNotificationSchema),
  asyncHandler(controller.send),
);

notificationsRouter.get(
  '/:id',
  requirePermissions('notifications:view'),
  asyncHandler(controller.getOne),
);
notificationsRouter.post(
  '/:id/read',
  requirePermissions('notifications:view'),
  asyncHandler(controller.markRead),
);
notificationsRouter.delete(
  '/:id',
  requirePermissions('notifications:view'),
  asyncHandler(controller.deleteOne),
);
