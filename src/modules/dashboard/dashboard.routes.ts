import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { DashboardController } from './controllers/dashboard.controller.js';

const controller = new DashboardController();

export const dashboardRouter = Router();

dashboardRouter.use(authMiddleware, requirePermissions('dashboard:view'));

dashboardRouter.get('/summary', asyncHandler(controller.summary));
dashboardRouter.get('/activity', asyncHandler(controller.activity));
dashboardRouter.get('/notifications', asyncHandler(controller.notifications));
