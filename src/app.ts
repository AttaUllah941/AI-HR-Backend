import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isDevelopment } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());

  const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
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
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMITED',
      },
    }),
  );

  if (isDevelopment) {
    app.use(
      morgan('dev', {
        stream: {
          write: (message: string) => logger.http(message.trim()),
        },
      }),
    );
  } else {
    app.use(morgan('combined'));
  }

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

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
