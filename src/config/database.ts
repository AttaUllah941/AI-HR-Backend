// this file is used to connect to the database
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from './logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

function isClientCurrent(client: PrismaClient | undefined): client is PrismaClient {
  // Recreate cached clients that predate newly generated models (dev hot-reload safety).
  return Boolean(client && 'employee' in client && client.employee);
}

const cached = globalForPrisma.prisma;
export const prisma = isClientCurrent(cached) ? cached : createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
