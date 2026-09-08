import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { successResponse } from '../../interfaces/api-response.js';
import { asyncHandler } from '../../middleware/async-handler.js';

export const healthRouter = Router();

async function checkDatabase(): Promise<'up' | 'down'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'up';
  } catch {
    return 'down';
  }
}

/** Liveness — process is up (no dependency checks). */
healthRouter.get('/live', (_req, res) => {
  res.status(200).json(
    successResponse(
      {
        status: 'ok',
        service: 'zenith-hr-api',
        timestamp: new Date().toISOString(),
      },
      'Alive',
    ),
  );
});

/** Readiness — database must be reachable. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const database = await checkDatabase();
    const ready = database === 'up';
    res.status(ready ? 200 : 503).json(
      successResponse(
        {
          status: ready ? 'ok' : 'not_ready',
          service: 'zenith-hr-api',
          database,
          timestamp: new Date().toISOString(),
        },
        ready ? 'Ready' : 'Not ready',
      ),
    );
  }),
);

/** Full health summary for operators / load balancers. */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const database = await checkDatabase();
    const payload = {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'zenith-hr-api',
      version: '1.0.0',
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      database,
      uptimeSeconds: Math.floor(process.uptime()),
    };

    const statusCode = database === 'up' ? 200 : 503;
    res.status(statusCode).json(successResponse(payload, 'Health check'));
  }),
);

/** Lightweight process metrics for monitoring scrapes (no secrets). */
healthRouter.get('/metrics', (_req, res) => {
  const mem = process.memoryUsage();
  res.status(200).json(
    successResponse(
      {
        service: 'zenith-hr-api',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
        nodeVersion: process.version,
        pid: process.pid,
      },
      'Metrics',
    ),
  );
});
