// this file is used to connect to the database
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected PostgreSQL pool error', {
      error: err.message,
    });
  });

  return pool;
}

function createPrismaClient(pool: Pool): PrismaClient {
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function isClientCurrent(client: PrismaClient | undefined): client is PrismaClient {
  // Recreate cached clients that predate newly generated models (dev hot-reload safety).
  return Boolean(
    client &&
      'employee' in client &&
      client.employee &&
      'attendanceRecord' in client &&
      'branchAllowedIp' in client &&
      'leaveRequest' in client,
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
