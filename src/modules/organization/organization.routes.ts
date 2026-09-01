import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { OrganizationController } from './controllers/organization.controller.js';
import {
  createBranchSchema,
  createDepartmentSchema,
  createDesignationSchema,
  createTeamSchema,
  updateBranchSchema,
  updateDepartmentSchema,
  updateDesignationSchema,
  updateTeamSchema,
} from './validators/organization.validators.js';

const controller = new OrganizationController();

export const organizationRouter = Router();

organizationRouter.use(authMiddleware);

organizationRouter.get(
  '/overview',
  requirePermissions('organization:view'),
  asyncHandler(controller.overview),
);
organizationRouter.get(
  '/chart',
  requirePermissions('organization:view'),
  asyncHandler(controller.chart),
);

organizationRouter.get(
  '/branches',
  requirePermissions('organization:view'),
  asyncHandler(controller.listBranches),
);
organizationRouter.post(
  '/branches',
  requirePermissions('organization:create'),
  validateBody(createBranchSchema),
  asyncHandler(controller.createBranch),
);
organizationRouter.patch(
  '/branches/:id',
  requirePermissions('organization:update'),
  validateBody(updateBranchSchema),
  asyncHandler(controller.updateBranch),
);
organizationRouter.delete(
  '/branches/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteBranch),
);

organizationRouter.get(
  '/departments',
  requirePermissions('organization:view'),
  asyncHandler(controller.listDepartments),
);
organizationRouter.post(
  '/departments',
  requirePermissions('organization:create'),
  validateBody(createDepartmentSchema),
  asyncHandler(controller.createDepartment),
);
organizationRouter.patch(
  '/departments/:id',
  requirePermissions('organization:update'),
  validateBody(updateDepartmentSchema),
  asyncHandler(controller.updateDepartment),
);
organizationRouter.delete(
  '/departments/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteDepartment),
);

organizationRouter.get(
  '/teams',
  requirePermissions('organization:view'),
  asyncHandler(controller.listTeams),
);
organizationRouter.post(
  '/teams',
  requirePermissions('organization:create'),
  validateBody(createTeamSchema),
  asyncHandler(controller.createTeam),
);
organizationRouter.patch(
  '/teams/:id',
  requirePermissions('organization:update'),
  validateBody(updateTeamSchema),
  asyncHandler(controller.updateTeam),
);
organizationRouter.delete(
  '/teams/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteTeam),
);

organizationRouter.get(
  '/designations',
  requirePermissions('organization:view'),
  asyncHandler(controller.listDesignations),
);
organizationRouter.post(
  '/designations',
  requirePermissions('organization:create'),
  validateBody(createDesignationSchema),
  asyncHandler(controller.createDesignation),
);
organizationRouter.patch(
  '/designations/:id',
  requirePermissions('organization:update'),
  validateBody(updateDesignationSchema),
  asyncHandler(controller.updateDesignation),
);
organizationRouter.delete(
  '/designations/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteDesignation),
);
