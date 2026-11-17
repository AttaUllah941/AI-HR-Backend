import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { attachRouteMeta } from '../docs/route-meta.js';

/**
 * Parses and replaces req.body with the validated Zod output.
 * Failures propagate to the global error handler as ZodError → 400.
 * The schema is attached to the handler so the OpenAPI generator can document it.
 */
export function validateBody<T>(schema: ZodType<T>) {
  const handler = (req: Request, _res: Response, next: NextFunction): void => {
    req.body = schema.parse(req.body);
    next();
  };
  return attachRouteMeta(handler, { schema: { kind: 'body', zod: schema as ZodType } });
}

/**
 * Parses and replaces req.query with the validated Zod output.
 * Failures propagate to the global error handler as ZodError → 400.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  const handler = (req: Request, _res: Response, next: NextFunction): void => {
    // Express 5 exposes req.query as a getter-only property, so shadow it on the instance.
    Object.defineProperty(req, 'query', {
      value: schema.parse(req.query),
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
  return attachRouteMeta(handler, { schema: { kind: 'query', zod: schema as ZodType } });
}
