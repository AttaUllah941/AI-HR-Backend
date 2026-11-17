import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env.js';

/** winston's `http` level has no pino equivalent; it is informational traffic. */
const level = env.LOG_LEVEL === 'http' ? 'info' : env.LOG_LEVEL;

/** Structured (JSON) access logger. Sensitive headers are never written. */
export const httpLogger = pino({
  level,
  base: { service: 'zenith-hr-api' },
  // Readable level names ("warn") instead of pino's numeric codes (40).
  formatters: { level: (label: string) => ({ level: label }) },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Logs one line per request, carrying the request id set by requestIdMiddleware
 * (also returned to clients as X-Request-Id) so a user report can be traced end to end.
 */
export const httpLogMiddleware: RequestHandler = pinoHttp({
  logger: httpLogger,
  genReqId: (req: IncomingMessage) => (req as IncomingMessage & { requestId?: string }).requestId ?? '-',
  customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes and metrics scrapes would otherwise dominate the log.
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      const url = req.url ?? '';
      return url.startsWith('/metrics') || url.includes('/health');
    },
  },
  serializers: {
    req: (req: { id: unknown; method: string; url: string; headers: Record<string, unknown> }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  customProps: (req: IncomingMessage) => ({
    userId: (req as IncomingMessage & { user?: { id?: string } }).user?.id,
  }),
});
