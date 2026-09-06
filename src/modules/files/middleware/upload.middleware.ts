import multer from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../../../config/env.js';
import { ValidationError } from '../../../utils/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.FILE_MAX_BYTES,
    files: 1,
  },
});

export const uploadSingleFile: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        next(
          new ValidationError(
            `File exceeds the maximum size of ${Math.floor(env.FILE_MAX_BYTES / (1024 * 1024))}MB`,
          ),
        );
        return;
      }
      next(new ValidationError(err.message));
      return;
    }

    next(err);
  });
};
