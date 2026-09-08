import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { PerformanceController } from './controllers/performance.controller.js';

const controller = new PerformanceController();

export const performanceRouter = Router();

performanceRouter.use(authMiddleware);

performanceRouter.get(
  '/summary',
  requirePermissions('performance:view'),
  asyncHandler(controller.summary),
);

performanceRouter.get(
  '/top-performers',
  requirePermissions('performance:view'),
  asyncHandler(controller.topPerformers),
);

performanceRouter.get(
  '/insights',
  requirePermissions('performance:view'),
  asyncHandler(controller.insights),
);

performanceRouter.get(
  '/reviews',
  requirePermissions('performance:view'),
  asyncHandler(controller.listReviews),
);

performanceRouter.post(
  '/reviews',
  requirePermissions('performance:create'),
  asyncHandler(controller.createReview),
);

performanceRouter.patch(
  '/reviews/:id',
  requirePermissions('performance:update'),
  asyncHandler(controller.updateReview),
);

performanceRouter.delete(
  '/reviews/:id',
  requirePermissions('performance:delete'),
  asyncHandler(controller.removeReview),
);
