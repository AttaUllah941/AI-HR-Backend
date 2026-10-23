import type { Request } from 'express';

/**
 * Resolves the client IP from an Express request.
 * Relies on `req.ip`, which honours the app's `trust proxy` setting; the raw
 * X-Forwarded-For header is client-controlled and must never be read directly.
 */
export function getRequestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}
