import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { OrganizationController } from './controllers/organization.controller.js';

const controller = new OrganizationController();

export const organizationRouter = Router();

organizationRouter.use(authMiddleware);

organizationRouter.get(
  '/overview',
  requirePermissions('organization:view'),
  asyncHandler(controller.overview),
);

organizationRouter.get(
  '/company',
  requirePermissions('organization:view'),
  asyncHandler(controller.getCompany),
);

organizationRouter.patch(
  '/company',
  requirePermissions('organization:update'),
  asyncHandler(controller.updateCompany),
);

organizationRouter.get(
  '/departments',
  requirePermissions('organization:view'),
  asyncHandler(controller.listDepartments),
);

organizationRouter.post(
  '/departments',
  requirePermissions('organization:create'),
  asyncHandler(controller.createDepartment),
);

organizationRouter.patch(
  '/departments/:id',
  requirePermissions('organization:update'),
  asyncHandler(controller.updateDepartment),
);

organizationRouter.delete(
  '/departments/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteDepartment),
);

organizationRouter.get(
  '/locations',
  requirePermissions('organization:view'),
  asyncHandler(controller.listLocations),
);

organizationRouter.post(
  '/locations',
  requirePermissions('organization:create'),
  asyncHandler(controller.createLocation),
);

organizationRouter.patch(
  '/locations/:id',
  requirePermissions('organization:update'),
  asyncHandler(controller.updateLocation),
);

organizationRouter.delete(
  '/locations/:id',
  requirePermissions('organization:delete'),
  asyncHandler(controller.deleteLocation),
);
