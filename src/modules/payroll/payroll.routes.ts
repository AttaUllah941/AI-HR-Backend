import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { PayrollController } from './controllers/payroll.controller.js';
import {
  createPayrollRunSchema,
  createSalaryComponentSchema,
  createSalaryStructureSchema,
  updatePayrollRunSchema,
  updateSalaryComponentSchema,
  updateSalaryStructureSchema,
  updateTaxSettingSchema,
} from './validators/payroll.validators.js';

const controller = new PayrollController();

export const payrollRouter = Router();

payrollRouter.use(authMiddleware);

payrollRouter.get('/summary', requirePermissions('payroll:view'), asyncHandler(controller.summary));
payrollRouter.get(
  '/me/summary',
  requirePermissions('payroll:view'),
  asyncHandler(controller.mySummary),
);
payrollRouter.get('/report', requirePermissions('payroll:view'), asyncHandler(controller.report));

payrollRouter.get(
  '/components',
  requirePermissions('payroll:view'),
  asyncHandler(controller.listComponents),
);
payrollRouter.post(
  '/components',
  requirePermissions('payroll:create'),
  validateBody(createSalaryComponentSchema),
  asyncHandler(controller.createComponent),
);
payrollRouter.patch(
  '/components/:id',
  requirePermissions('payroll:update'),
  validateBody(updateSalaryComponentSchema),
  asyncHandler(controller.updateComponent),
);
payrollRouter.delete(
  '/components/:id',
  requirePermissions('payroll:delete'),
  asyncHandler(controller.deleteComponent),
);

payrollRouter.get(
  '/structures',
  requirePermissions('payroll:view'),
  asyncHandler(controller.listStructures),
);
payrollRouter.post(
  '/structures',
  requirePermissions('payroll:create'),
  validateBody(createSalaryStructureSchema),
  asyncHandler(controller.createStructure),
);
payrollRouter.get(
  '/structures/:id',
  requirePermissions('payroll:view'),
  asyncHandler(controller.getStructure),
);
payrollRouter.patch(
  '/structures/:id',
  requirePermissions('payroll:update'),
  validateBody(updateSalaryStructureSchema),
  asyncHandler(controller.updateStructure),
);
payrollRouter.delete(
  '/structures/:id',
  requirePermissions('payroll:delete'),
  asyncHandler(controller.deleteStructure),
);

payrollRouter.get('/tax', requirePermissions('payroll:view'), asyncHandler(controller.getTax));
payrollRouter.patch(
  '/tax',
  requirePermissions('payroll:update'),
  validateBody(updateTaxSettingSchema),
  asyncHandler(controller.updateTax),
);

payrollRouter.get('/runs', requirePermissions('payroll:view'), asyncHandler(controller.listRuns));
payrollRouter.post(
  '/runs',
  requirePermissions('payroll:create'),
  validateBody(createPayrollRunSchema),
  asyncHandler(controller.createRun),
);
payrollRouter.get('/runs/:id', requirePermissions('payroll:view'), asyncHandler(controller.getRun));
payrollRouter.patch(
  '/runs/:id',
  requirePermissions('payroll:update'),
  validateBody(updatePayrollRunSchema),
  asyncHandler(controller.updateRun),
);
payrollRouter.post(
  '/runs/:id/process',
  requirePermissions('payroll:update'),
  asyncHandler(controller.processRun),
);
payrollRouter.post(
  '/runs/:id/approve',
  requirePermissions('payroll:approve'),
  asyncHandler(controller.approveRun),
);
payrollRouter.post(
  '/runs/:id/mark-paid',
  requirePermissions('payroll:approve'),
  asyncHandler(controller.markRunPaid),
);
payrollRouter.post(
  '/runs/:id/cancel',
  requirePermissions('payroll:delete'),
  asyncHandler(controller.cancelRun),
);
payrollRouter.get(
  '/runs/:id/entries',
  requirePermissions('payroll:view'),
  asyncHandler(controller.listEntries),
);

payrollRouter.get(
  '/payslips',
  requirePermissions('payroll:view'),
  asyncHandler(controller.listPayslips),
);
payrollRouter.get(
  '/me/payslips',
  requirePermissions('payroll:view'),
  asyncHandler(controller.myPayslips),
);
payrollRouter.get(
  '/payslips/:id',
  requirePermissions('payroll:view'),
  asyncHandler(controller.getPayslip),
);
