import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
  } catch (error) {
    logger.warn('Database connection deferred — ensure PostgreSQL is running', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`Zenith HR API listening on port ${env.PORT}`, {
      env: env.NODE_ENV,
      prefix: env.API_PREFIX,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await disconnectDatabase().catch(() => undefined);
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
