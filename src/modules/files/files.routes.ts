import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody } from '../../middleware/validate.middleware.js';
import { FilesController } from './controllers/files.controller.js';
import { uploadSingleFile } from './middleware/upload.middleware.js';
import { updateFileSchema } from './validators/files.validators.js';

const controller = new FilesController();

export const filesRouter = Router();

filesRouter.use(authMiddleware);

filesRouter.get('/summary', requirePermissions('files:view'), asyncHandler(controller.summary));
filesRouter.get('/', requirePermissions('files:view'), asyncHandler(controller.list));
filesRouter.get(
  '/:id/download',
  requirePermissions('files:view'),
  asyncHandler(controller.download),
);
filesRouter.get(
  '/:id/preview',
  requirePermissions('files:view'),
  asyncHandler(controller.preview),
);
filesRouter.get('/:id', requirePermissions('files:view'), asyncHandler(controller.getById));

filesRouter.post(
  '/upload',
  requirePermissions('files:create'),
  uploadSingleFile,
  asyncHandler(controller.upload),
);

filesRouter.patch(
  '/:id',
  requirePermissions('files:update'),
  validateBody(updateFileSchema),
  asyncHandler(controller.update),
);

filesRouter.delete(
  '/:id',
  requirePermissions('files:delete'),
  asyncHandler(controller.remove),
);
