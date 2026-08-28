import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error.js';
import { errorResponse } from '../interfaces/api-response.js';
import { logger } from '../config/logger.js';
import { isProduction } from '../config/env.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('Route not found', 404, 'ROUTE_NOT_FOUND'));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorResponse(err.message, { code: err.code, errors: err.details }),
    );
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json(
      errorResponse('Validation failed', {
        code: 'VALIDATION_ERROR',
        errors: err.flatten(),
      }),
    );
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json(
        errorResponse('A record with this value already exists', {
          code: 'UNIQUE_CONSTRAINT',
        }),
      );
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json(errorResponse('Record not found', { code: 'NOT_FOUND' }));
      return;
    }
  }

  logger.error('Unhandled error', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json(
    errorResponse(isProduction ? 'Internal server error' : 'Unexpected server error', {
      code: 'INTERNAL_ERROR',
      errors: isProduction ? undefined : err instanceof Error ? err.message : err,
    }),
  );
}
