import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { ReportsController } from './controllers/reports.controller.js';
import { exportReportSchema } from './validators/reports.validators.js';

const controller = new ReportsController();

export const reportsRouter = Router();

reportsRouter.use(authMiddleware);

reportsRouter.get('/summary', requirePermissions('reports:view'), asyncHandler(controller.summary));
reportsRouter.get(
  '/attendance',
  requirePermissions('reports:view'),
  asyncHandler(controller.attendance),
);
reportsRouter.get('/leave', requirePermissions('reports:view'), asyncHandler(controller.leave));
reportsRouter.get('/payroll', requirePermissions('reports:view'), asyncHandler(controller.payroll));
reportsRouter.get(
  '/recruitment',
  requirePermissions('reports:view'),
  asyncHandler(controller.recruitment),
);
reportsRouter.get(
  '/performance',
  requirePermissions('reports:view'),
  asyncHandler(controller.performance),
);
reportsRouter.get(
  '/employees',
  requirePermissions('reports:view'),
  asyncHandler(controller.employees),
);
reportsRouter.get(
  '/exports',
  requirePermissions('reports:view'),
  asyncHandler(controller.listExports),
);

reportsRouter.post(
  '/export',
  requirePermissions('reports:export'),
  validateBody(exportReportSchema),
  asyncHandler(controller.exportReport),
);
reportsRouter.get(
  '/export',
  requirePermissions('reports:export'),
  asyncHandler(controller.exportReport),
);
