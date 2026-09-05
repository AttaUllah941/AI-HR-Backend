import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { AiController } from './controllers/ai.controller.js';
import {
  appraisalSchema,
  assistantChatSchema,
  insightsSchema,
  policyGenerateSchema,
  recommendationsSchema,
  resumeScreeningSchema,
} from './validators/ai.validators.js';

const controller = new AiController();

export const aiRouter = Router();

aiRouter.use(authMiddleware);

aiRouter.get('/status', requirePermissions('ai:view'), asyncHandler(controller.status));
aiRouter.get('/summary', requirePermissions('ai:view'), asyncHandler(controller.summary));

aiRouter.get('/insights', requirePermissions('ai:view'), asyncHandler(controller.getInsights));
aiRouter.post(
  '/insights',
  requirePermissions('ai:create'),
  validateBody(insightsSchema),
  asyncHandler(controller.refreshInsights),
);

aiRouter.get(
  '/recommendations',
  requirePermissions('ai:view'),
  asyncHandler(controller.getRecommendations),
);
aiRouter.post(
  '/recommendations',
  requirePermissions('ai:create'),
  validateBody(recommendationsSchema),
  asyncHandler(controller.refreshRecommendations),
);

aiRouter.get(
  '/conversations',
  requirePermissions('ai:view'),
  asyncHandler(controller.listConversations),
);
aiRouter.post(
  '/assistant/chat',
  requirePermissions('ai:create'),
  validateBody(assistantChatSchema),
  asyncHandler(controller.chat),
);
aiRouter.get(
  '/conversations/:id',
  requirePermissions('ai:view'),
  asyncHandler(controller.getConversation),
);
aiRouter.delete(
  '/conversations/:id',
  requirePermissions('ai:delete'),
  asyncHandler(controller.deleteConversation),
);

aiRouter.post(
  '/resume-screening',
  requirePermissions('ai:create'),
  validateBody(resumeScreeningSchema),
  asyncHandler(controller.screenResume),
);
aiRouter.post(
  '/appraisals',
  requirePermissions('ai:create'),
  validateBody(appraisalSchema),
  asyncHandler(controller.generateAppraisal),
);
aiRouter.post(
  '/policies',
  requirePermissions('ai:create'),
  validateBody(policyGenerateSchema),
  asyncHandler(controller.generatePolicy),
);

aiRouter.get(
  '/generations',
  requirePermissions('ai:view'),
  asyncHandler(controller.listGenerations),
);
aiRouter.get(
  '/generations/:id',
  requirePermissions('ai:view'),
  asyncHandler(controller.getGeneration),
);
aiRouter.delete(
  '/generations/:id',
  requirePermissions('ai:delete'),
  asyncHandler(controller.deleteGeneration),
);
