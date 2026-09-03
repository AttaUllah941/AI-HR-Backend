import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Parses and replaces req.body with the validated Zod output.
 * Failures propagate to the global error handler as ZodError → 400.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
}
