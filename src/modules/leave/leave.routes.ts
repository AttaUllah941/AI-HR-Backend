import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { LeaveController } from './controllers/leave.controller.js';
import {
  createLeaveRequestSchema,
  createLeaveTypeSchema,
  reviewLeaveRequestSchema,
  updateLeavePolicySchema,
  updateLeaveRequestSchema,
  updateLeaveTypeSchema,
  upsertLeaveBalanceSchema,
} from './validators/leave.validators.js';

const controller = new LeaveController();

export const leaveRouter = Router();

leaveRouter.use(authMiddleware);

leaveRouter.get('/me/summary', requirePermissions('leave:view'), asyncHandler(controller.mySummary));
leaveRouter.get('/calendar', requirePermissions('leave:view'), asyncHandler(controller.calendar));
leaveRouter.get('/report', requirePermissions('leave:view'), asyncHandler(controller.report));

leaveRouter.get('/types', requirePermissions('leave:view'), asyncHandler(controller.listTypes));
leaveRouter.post(
  '/types',
  requirePermissions('leave:update'),
  validateBody(createLeaveTypeSchema),
  asyncHandler(controller.createType),
);
leaveRouter.patch(
  '/types/:id',
  requirePermissions('leave:update'),
  validateBody(updateLeaveTypeSchema),
  asyncHandler(controller.updateType),
);
leaveRouter.delete(
  '/types/:id',
  requirePermissions('leave:update'),
  asyncHandler(controller.deleteType),
);

leaveRouter.get('/policy', requirePermissions('leave:view'), asyncHandler(controller.getPolicy));
leaveRouter.patch(
  '/policy',
  requirePermissions('leave:update'),
  validateBody(updateLeavePolicySchema),
  asyncHandler(controller.updatePolicy),
);

leaveRouter.get('/balances', requirePermissions('leave:view'), asyncHandler(controller.listBalances));
leaveRouter.post(
  '/balances',
  requirePermissions('leave:update'),
  validateBody(upsertLeaveBalanceSchema),
  asyncHandler(controller.upsertBalance),
);

leaveRouter.get('/requests', requirePermissions('leave:view'), asyncHandler(controller.listRequests));
leaveRouter.get(
  '/requests/:id',
  requirePermissions('leave:view'),
  asyncHandler(controller.getRequest),
);
leaveRouter.post(
  '/requests',
  requirePermissions('leave:create'),
  validateBody(createLeaveRequestSchema),
  asyncHandler(controller.createRequest),
);
leaveRouter.patch(
  '/requests/:id',
  requirePermissions('leave:create'),
  validateBody(updateLeaveRequestSchema),
  asyncHandler(controller.updateRequest),
);
leaveRouter.post(
  '/requests/:id/approve',
  requirePermissions('leave:approve'),
  validateBody(reviewLeaveRequestSchema),
  asyncHandler(controller.approveRequest),
);
leaveRouter.post(
  '/requests/:id/reject',
  requirePermissions('leave:approve'),
  validateBody(reviewLeaveRequestSchema),
  asyncHandler(controller.rejectRequest),
);
leaveRouter.post(
  '/requests/:id/cancel',
  requirePermissions('leave:create'),
  asyncHandler(controller.cancelRequest),
);
