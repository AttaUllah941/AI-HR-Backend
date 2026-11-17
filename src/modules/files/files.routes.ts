import { Router, type NextFunction, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { requirePermissions } from '../../middleware/rbac.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.middleware.js';
import { FilesController } from './controllers/files.controller.js';
import { uploadSingleFile } from './middleware/upload.middleware.js';
import { listFilesQuerySchema, updateFileSchema } from './validators/files.validators.js';

const controller = new FilesController();

export const filesRouter = Router();

filesRouter.use(authMiddleware);

filesRouter.get('/summary', requirePermissions('files:view'), asyncHandler(controller.summary));
filesRouter.get(
  '/',
  requirePermissions('files:view'),
  validateQuery(listFilesQuerySchema),
  asyncHandler(controller.list),
);
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

// The category lives in the multipart body, so it is only known after parsing. Self-avatar uploads
// (category AVATAR, only ever applied to the caller's own user) skip files:create; every other
// category still requires it, and the service re-checks this as defence in depth.
const requireCreateUnlessAvatar = (req: Request, res: Response, next: NextFunction): void => {
  if (req.body?.category === 'AVATAR') {
    next();
    return;
  }
  requirePermissions('files:create')(req, res, next);
};

filesRouter.post(
  '/upload',
  uploadSingleFile,
  requireCreateUnlessAvatar,
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
