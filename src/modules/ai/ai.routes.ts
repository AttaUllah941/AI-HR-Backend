import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

/** Per-user budget for endpoints that call the external AI provider (and cost money). */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: {
    success: false,
    message: 'Too many AI requests, please slow down',
    code: 'AI_RATE_LIMITED',
  },
});

aiRouter.get('/status', requirePermissions('ai:view'), asyncHandler(controller.status));
aiRouter.get('/summary', requirePermissions('ai:view'), asyncHandler(controller.summary));

aiRouter.get('/insights', requirePermissions('ai:view'), asyncHandler(controller.getInsights));
aiRouter.post(
  '/insights',
  aiRateLimiter,
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
  aiRateLimiter,
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
  aiRateLimiter,
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
  aiRateLimiter,
  requirePermissions('ai:create'),
  validateBody(resumeScreeningSchema),
  asyncHandler(controller.screenResume),
);
aiRouter.post(
  '/appraisals',
  aiRateLimiter,
  requirePermissions('ai:create'),
  validateBody(appraisalSchema),
  asyncHandler(controller.generateAppraisal),
);
aiRouter.post(
  '/policies',
  aiRateLimiter,
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
