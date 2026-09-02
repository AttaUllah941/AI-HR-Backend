import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { AttendanceController } from './controllers/attendance.controller.js';
import {
  clockActionSchema,
  createAttendanceSchema,
  createHolidaySchema,
  createOvertimeSchema,
  createShiftSchema,
  reviewOvertimeSchema,
  updateAttendanceSchema,
  updateHolidaySchema,
  updateShiftSchema,
} from './validators/attendance.validators.js';

const controller = new AttendanceController();

export const attendanceRouter = Router();

attendanceRouter.use(authMiddleware);

attendanceRouter.get('/summary', requirePermissions('attendance:view'), asyncHandler(controller.summary));
attendanceRouter.get('/report', requirePermissions('attendance:view'), asyncHandler(controller.report));
attendanceRouter.get('/timesheet', requirePermissions('attendance:view'), asyncHandler(controller.timesheet));
attendanceRouter.get('/me/today', requirePermissions('attendance:view'), asyncHandler(controller.myToday));

attendanceRouter.get('/records', requirePermissions('attendance:view'), asyncHandler(controller.list));
attendanceRouter.get('/records/:id', requirePermissions('attendance:view'), asyncHandler(controller.getById));
attendanceRouter.post(
  '/records',
  requirePermissions('attendance:create'),
  validateBody(createAttendanceSchema),
  asyncHandler(controller.create),
);
attendanceRouter.patch(
  '/records/:id',
  requirePermissions('attendance:update'),
  validateBody(updateAttendanceSchema),
  asyncHandler(controller.update),
);
attendanceRouter.delete(
  '/records/:id',
  requirePermissions('attendance:update'),
  asyncHandler(controller.remove),
);

attendanceRouter.post(
  '/clock-in',
  requirePermissions('attendance:create'),
  validateBody(clockActionSchema),
  asyncHandler(controller.clockIn),
);
attendanceRouter.post(
  '/clock-out',
  requirePermissions('attendance:create'),
  validateBody(clockActionSchema),
  asyncHandler(controller.clockOut),
);

attendanceRouter.get('/shifts', requirePermissions('attendance:view'), asyncHandler(controller.listShifts));
attendanceRouter.post(
  '/shifts',
  requirePermissions('attendance:update'),
  validateBody(createShiftSchema),
  asyncHandler(controller.createShift),
);
attendanceRouter.patch(
  '/shifts/:id',
  requirePermissions('attendance:update'),
  validateBody(updateShiftSchema),
  asyncHandler(controller.updateShift),
);
attendanceRouter.delete(
  '/shifts/:id',
  requirePermissions('attendance:update'),
  asyncHandler(controller.deleteShift),
);

attendanceRouter.get('/holidays', requirePermissions('attendance:view'), asyncHandler(controller.listHolidays));
attendanceRouter.post(
  '/holidays',
  requirePermissions('attendance:update'),
  validateBody(createHolidaySchema),
  asyncHandler(controller.createHoliday),
);
attendanceRouter.patch(
  '/holidays/:id',
  requirePermissions('attendance:update'),
  validateBody(updateHolidaySchema),
  asyncHandler(controller.updateHoliday),
);
attendanceRouter.delete(
  '/holidays/:id',
  requirePermissions('attendance:update'),
  asyncHandler(controller.deleteHoliday),
);

attendanceRouter.get('/overtime', requirePermissions('attendance:view'), asyncHandler(controller.listOvertime));
attendanceRouter.post(
  '/overtime',
  requirePermissions('attendance:create'),
  validateBody(createOvertimeSchema),
  asyncHandler(controller.createOvertime),
);
attendanceRouter.post(
  '/overtime/:id/approve',
  requirePermissions('attendance:approve'),
  validateBody(reviewOvertimeSchema),
  asyncHandler(controller.approveOvertime),
);
attendanceRouter.post(
  '/overtime/:id/reject',
  requirePermissions('attendance:approve'),
  validateBody(reviewOvertimeSchema),
  asyncHandler(controller.rejectOvertime),
);
