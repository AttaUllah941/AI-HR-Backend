import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { successResponse } from '../../interfaces/api-response.js';
import { asyncHandler } from '../../middleware/async-handler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'down';

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const payload = {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'zenith-hr-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database,
    };

    const statusCode = database === 'up' ? 200 : 503;
    res.status(statusCode).json(successResponse(payload, 'Health check'));
  }),
);
