// this file is used to connect to the database
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';
import { dbQueryDuration, dbSlowQueries, registerPoolMetrics } from './metrics.js';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
  });

  registerPoolMetrics(pool);

  pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', {
      error: err.message,
    });
  });

  return pool;
}

function createPrismaClient(pool: Pool): PrismaClient {
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  });

  // Slow-query log + latency histogram. Only the SQL text is logged, never the bound parameters
  // (they can contain personal data).
  (client as unknown as {
    $on: (event: 'query', cb: (e: { query: string; duration: number }) => void) => void;
  }).$on('query', (event) => {
    dbQueryDuration.observe(event.duration / 1000);
    if (event.duration > env.DB_SLOW_QUERY_MS) {
      dbSlowQueries.inc();
      logger.warn('Slow query', {
        durationMs: event.duration,
        thresholdMs: env.DB_SLOW_QUERY_MS,
        query: event.query.length > 600 ? `${event.query.slice(0, 600)}...` : event.query,
      });
    }
  });

  return client;
}

function isClientCurrent(client: PrismaClient | undefined): client is PrismaClient {
  // Recreate cached clients that predate newly generated models (dev hot-reload safety).
  return Boolean(
    client &&
      'employee' in client &&
      client.employee &&
      'attendanceRecord' in client &&
      client.attendanceRecord &&
      'branchAllowedIp' in client &&
      client.branchAllowedIp &&
      'leaveRequest' in client &&
      client.leaveRequest &&
      'payrollRun' in client &&
      client.payrollRun &&
      'jobOpening' in client &&
      client.jobOpening &&
      'performanceGoal' in client &&
      client.performanceGoal &&
      'aiUsageLog' in client &&
      client.aiUsageLog,
  );
}

const cachedPool = globalForPrisma.pgPool;
const cachedClient = globalForPrisma.prisma;

const pool =
  cachedPool && isClientCurrent(cachedClient) ? cachedPool : createPool();
export const prisma = isClientCurrent(cachedClient)
  ? cachedClient
  : createPrismaClient(pool);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.pgPool = pool;
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end().catch(() => undefined);
  logger.info('Database disconnected');
}
