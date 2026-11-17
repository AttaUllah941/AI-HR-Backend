import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { requestTimeouts } from '../config/metrics.js';

export interface TimeoutOverride {
  /** Matched against `req.originalUrl` (path only). */
  pattern: RegExp;
  ms: number;
}

/**
 * Routes that legitimately run long: payroll processing (120 s transaction), exports and AI
 * generation, and uploads on slow links.
 */
export const LONG_RUNNING_ROUTES: TimeoutOverride[] = [
  { pattern: /\/payroll\/runs\/[^/]+\/process$/, ms: 150_000 },
  { pattern: /\/reports\/export/, ms: 120_000 },
  { pattern: /\/ai\//, ms: 90_000 },
  { pattern: /\/files\/upload/, ms: 120_000 },
];

export function timeoutFor(
  path: string,
  defaultMs: number,
  overrides: TimeoutOverride[] = LONG_RUNNING_ROUTES,
): number {
  return overrides.find((o) => o.pattern.test(path))?.ms ?? defaultMs;
}

/**
 * Answers 503 REQUEST_TIMEOUT when a handler takes longer than its budget, so slow requests
 * release the client (and nginx) instead of hanging. The handler itself cannot be cancelled;
 * the late result is dropped because headers are already sent.
 */
export function requestTimeout(
  defaultMs: number,
  overrides: TimeoutOverride[] = LONG_RUNNING_ROUTES,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ms = timeoutFor(req.originalUrl.split('?')[0], defaultMs, overrides);
    const timer = setTimeout(() => {
      if (res.headersSent) {
        return;
      }
      requestTimeouts.inc();
      res.status(503).json({
        success: false,
        message: 'The request took too long to complete. Please try again.',
        code: 'REQUEST_TIMEOUT',
      });
    }, ms);
    timer.unref();

    const clear = () => clearTimeout(timer);
    res.once('finish', clear);
    res.once('close', clear);
    next();
  };
}
