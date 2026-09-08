import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PayrollController } from './controllers/payroll.controller.js';

const controller = new PayrollController();

export const payrollRouter = Router();

payrollRouter.use(authMiddleware);

payrollRouter.get(
  '/summary',
  requirePermissions('payroll:view'),
  asyncHandler(controller.summary),
);

payrollRouter.get(
  '/entries',
  requirePermissions('payroll:view'),
  asyncHandler(controller.list),
);

payrollRouter.get(
  '/export',
  requirePermissions('payroll:view'),
  asyncHandler(controller.exportCsv),
);

payrollRouter.post(
  '/run',
  requirePermissions('payroll:update'),
  asyncHandler(controller.runPayroll),
);

payrollRouter.post(
  '/entries',
  requirePermissions('payroll:create'),
  asyncHandler(controller.createEntry),
);

payrollRouter.patch(
  '/entries/:id',
  requirePermissions('payroll:update'),
  asyncHandler(controller.updateEntry),
);

payrollRouter.delete(
  '/entries/:id',
  requirePermissions('payroll:delete'),
  asyncHandler(controller.removeEntry),
);
