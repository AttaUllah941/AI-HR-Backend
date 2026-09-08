import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { AttendanceController } from './controllers/attendance.controller.js';

const controller = new AttendanceController();

export const attendanceRouter = Router();

attendanceRouter.use(authMiddleware);

attendanceRouter.get(
  '/summary',
  requirePermissions('attendance:view'),
  asyncHandler(controller.summary),
);

attendanceRouter.get(
  '/check-ins',
  requirePermissions('attendance:view'),
  asyncHandler(controller.checkIns),
);

attendanceRouter.get(
  '/calendar',
  requirePermissions('attendance:view'),
  asyncHandler(controller.calendar),
);

attendanceRouter.get(
  '/',
  requirePermissions('attendance:view'),
  asyncHandler(controller.list),
);

attendanceRouter.post(
  '/',
  requirePermissions('attendance:create'),
  asyncHandler(controller.create),
);

attendanceRouter.patch(
  '/:id',
  requirePermissions('attendance:update'),
  asyncHandler(controller.update),
);

attendanceRouter.delete(
  '/:id',
  requirePermissions('attendance:delete'),
  asyncHandler(controller.remove),
);
