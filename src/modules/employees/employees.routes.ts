import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { EmployeeController } from './controllers/employee.controller.js';

const controller = new EmployeeController();

export const employeesRouter = Router();

employeesRouter.use(authMiddleware);

employeesRouter.get(
  '/',
  requirePermissions('employees:view'),
  asyncHandler(controller.list),
);

employeesRouter.get(
  '/export',
  requirePermissions('employees:view'),
  asyncHandler(controller.exportCsv),
);

employeesRouter.get(
  '/:id',
  requirePermissions('employees:view'),
  asyncHandler(controller.getById),
);

employeesRouter.post(
  '/',
  requirePermissions('employees:create'),
  asyncHandler(controller.create),
);

employeesRouter.patch(
  '/:id',
  requirePermissions('employees:update'),
  asyncHandler(controller.update),
);

employeesRouter.delete(
  '/:id',
  requirePermissions('employees:delete'),
  asyncHandler(controller.remove),
);
