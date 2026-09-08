import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { LeaveController } from './controllers/leave.controller.js';

const controller = new LeaveController();

export const leaveRouter = Router();

leaveRouter.use(authMiddleware);

leaveRouter.get(
  '/summary',
  requirePermissions('leave:view'),
  asyncHandler(controller.summary),
);

leaveRouter.get(
  '/pending',
  requirePermissions('leave:view'),
  asyncHandler(controller.pending),
);

leaveRouter.get(
  '/holidays',
  requirePermissions('leave:view'),
  asyncHandler(controller.holidays),
);

leaveRouter.get('/', requirePermissions('leave:view'), asyncHandler(controller.list));

leaveRouter.post('/', requirePermissions('leave:create'), asyncHandler(controller.create));

leaveRouter.patch(
  '/:id',
  requirePermissions('leave:update'),
  asyncHandler(controller.update),
);

leaveRouter.delete(
  '/:id',
  requirePermissions('leave:delete'),
  asyncHandler(controller.remove),
);
