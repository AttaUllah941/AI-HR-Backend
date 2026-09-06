import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { ProfileController } from './controllers/profile.controller.js';
import {
  changePasswordSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from './validators/profile.validators.js';

const controller = new ProfileController();

export const profileRouter = Router();

profileRouter.use(authMiddleware);

profileRouter.get('/', asyncHandler(controller.get));
profileRouter.patch('/', validateBody(updateProfileSchema), asyncHandler(controller.update));
profileRouter.post(
  '/password',
  validateBody(changePasswordSchema),
  asyncHandler(controller.changePassword),
);

profileRouter.get('/preferences', asyncHandler(controller.getPreferences));
profileRouter.put(
  '/preferences',
  validateBody(updatePreferencesSchema),
  asyncHandler(controller.updatePreferences),
);

profileRouter.get('/sessions', asyncHandler(controller.listSessions));
profileRouter.delete('/sessions/:id', asyncHandler(controller.revokeSession));
profileRouter.post('/sessions/revoke-others', asyncHandler(controller.revokeOtherSessions));

profileRouter.get('/activity', asyncHandler(controller.listActivity));
