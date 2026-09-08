import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { RecruitmentController } from './controllers/recruitment.controller.js';

const controller = new RecruitmentController();

export const recruitmentRouter = Router();

recruitmentRouter.use(authMiddleware);

recruitmentRouter.get(
  '/summary',
  requirePermissions('recruitment:view'),
  asyncHandler(controller.summary),
);

recruitmentRouter.get(
  '/pipeline',
  requirePermissions('recruitment:view'),
  asyncHandler(controller.pipeline),
);

recruitmentRouter.post(
  '/ai-screen',
  requirePermissions('recruitment:update'),
  asyncHandler(controller.aiScreen),
);

recruitmentRouter.get(
  '/jobs',
  requirePermissions('recruitment:view'),
  asyncHandler(controller.listJobs),
);

recruitmentRouter.post(
  '/jobs',
  requirePermissions('recruitment:create'),
  asyncHandler(controller.createJob),
);

recruitmentRouter.patch(
  '/jobs/:id',
  requirePermissions('recruitment:update'),
  asyncHandler(controller.updateJob),
);

recruitmentRouter.delete(
  '/jobs/:id',
  requirePermissions('recruitment:delete'),
  asyncHandler(controller.removeJob),
);

recruitmentRouter.get(
  '/candidates',
  requirePermissions('recruitment:view'),
  asyncHandler(controller.listCandidates),
);

recruitmentRouter.post(
  '/candidates',
  requirePermissions('recruitment:create'),
  asyncHandler(controller.createCandidate),
);

recruitmentRouter.patch(
  '/candidates/:id',
  requirePermissions('recruitment:update'),
  asyncHandler(controller.updateCandidate),
);

recruitmentRouter.delete(
  '/candidates/:id',
  requirePermissions('recruitment:delete'),
  asyncHandler(controller.removeCandidate),
);
