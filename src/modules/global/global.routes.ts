import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { GlobalController } from './controllers/global.controller.js';
import {
  createBookmarkSchema,
  updateBookmarkSchema,
} from './validators/global.validators.js';

const controller = new GlobalController();

export const globalRouter = Router();

globalRouter.use(authMiddleware);

globalRouter.get('/search', asyncHandler(controller.search));
globalRouter.get('/shortcuts', asyncHandler(controller.shortcuts));

globalRouter.get('/recent-searches', asyncHandler(controller.listRecent));
globalRouter.delete('/recent-searches', asyncHandler(controller.clearRecent));
globalRouter.delete('/recent-searches/:id', asyncHandler(controller.deleteRecent));

globalRouter.get('/bookmarks', asyncHandler(controller.listBookmarks));
globalRouter.post(
  '/bookmarks',
  validateBody(createBookmarkSchema),
  asyncHandler(controller.createBookmark),
);
globalRouter.patch(
  '/bookmarks/:id',
  validateBody(updateBookmarkSchema),
  asyncHandler(controller.updateBookmark),
);
globalRouter.delete('/bookmarks/:id', asyncHandler(controller.deleteBookmark));
