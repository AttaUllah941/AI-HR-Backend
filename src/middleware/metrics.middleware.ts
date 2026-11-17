import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isIP } from 'node:net';
import { env } from '../config/env.js';
import { httpRequestDuration, httpRequestsInFlight, metricsRegistry } from '../config/metrics.js';

/** Records duration per method/route/status. `route` is the matched pattern, never the raw URL. */
export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const stop = httpRequestDuration.startTimer();
  httpRequestsInFlight.inc();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    httpRequestsInFlight.dec();
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
    stop({ method: req.method, route, status: String(res.statusCode) });
  };
  res.once('finish', finish);
  res.once('close', finish);
  next();
}

/** Loopback and RFC1918 / unique-local addresses count as "internal". */
export function isInternalAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^f[cd][0-9a-f]{2}:/i.test(ip);
}

export interface MetricsAccessOptions {
  enabled: boolean;
  token: string;
}

/**
 * GET /metrics access rule:
 *   - disabled (default): 404, as if the endpoint did not exist;
 *   - token configured: `Authorization: Bearer <token>` required;
 *   - no token: only loopback / private network addresses may scrape.
 */
export function metricsAccess(options: MetricsAccessOptions): RequestHandler {
  return (req, res, next) => {
    if (!options.enabled) {
      res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
      return;
    }
    if (options.token) {
      const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (supplied !== options.token) {
        res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
        return;
      }
    } else if (!isInternalAddress(req.socket.remoteAddress)) {
      res.status(403).json({ success: false, message: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

export const metricsHandler: RequestHandler = async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
};

export const defaultMetricsAccess = (): RequestHandler =>
  metricsAccess({ enabled: env.METRICS_ENABLED, token: env.METRICS_TOKEN });
