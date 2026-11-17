import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isDevelopment, isProduction } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { docsRouter } from './docs/docs.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { httpLogMiddleware } from './middleware/http-logger.middleware.js';
import { lookupCache } from './middleware/lookup-cache.middleware.js';
import { defaultMetricsAccess, httpMetrics, metricsHandler } from './middleware/metrics.middleware.js';
import { requestTimeout } from './middleware/request-timeout.middleware.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  // Structured access log (JSON) tagged with the request id; metrics and timeouts follow.
  app.use(httpLogMiddleware);
  app.use(httpMetrics);
  app.use(requestTimeout(env.REQUEST_TIMEOUT_MS));

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isLocalDevOrigin = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (no Origin header) are allowed.
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.includes(origin) || (isDevelopment && isLocalDevOrigin(origin))) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  // Skipped when a reverse proxy already compresses (COMPRESSION_ENABLED=false, see docs/PRODUCTION.md).
  if (env.COMPRESSION_ENABLED) {
    app.use(compression());
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        const path = req.path || '';
        return path === '/' || path.startsWith(`${env.API_PREFIX}/health`);
      },
      message: {
        success: false,
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMITED',
      },
    }),
  );

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Zenith Enterprise AI HR API',
        version: '1.0.0',
        docs: env.API_PREFIX,
      },
      message: 'Welcome to Zenith HR API',
    });
  });

  // Prometheus scrape endpoint: 404 unless METRICS_ENABLED; token or private network only.
  app.get('/metrics', defaultMetricsAccess(), metricsHandler);

  // Swagger UI + openapi.json, generated from the routers/validators. Never in production.
  if (!isProduction) {
    app.use('/api/docs', docsRouter);
  }

  app.use(env.API_PREFIX, lookupCache, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
