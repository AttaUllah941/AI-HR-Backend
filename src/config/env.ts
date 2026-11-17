import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { parseEncryptionKey } from '../utils/secret-box.js';

loadEnv();

/** Optional "true"/"false" flag with a default. */
const boolFlag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true'));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().min(1),
  // PostgreSQL pool. Total connections = API instances x DB_POOL_MAX, so keep it below the
  // server's max_connections (default 100) divided by the number of instances.
  DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
  // Queries slower than this are logged as warnings (and counted in /metrics).
  DB_SLOW_QUERY_MS: z.coerce.number().int().min(1).default(200),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // 32-byte key (64 hex chars or base64) for MFA secrets at rest. Required in production.
  MFA_ENCRYPTION_KEY: z
    .string()
    .optional()
    .default('')
    .refine((v) => v === '' || parseEncryptionKey(v) !== null, {
      message: 'MFA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex chars or base64',
    }),
  // Set to false for single-tenant deployments: /auth/register then refuses to create new tenants.
  ALLOW_SELF_REGISTRATION: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  // Staging-only override that allows EMAIL_PROVIDER=console in production
  ALLOW_CONSOLE_EMAIL: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  APP_URL: z.string().default('http://localhost:4200'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  // Requests slower than this get a 503 (long-running routes have their own limits).
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  // Set to false when a reverse proxy (nginx) already compresses API responses.
  COMPRESSION_ENABLED: boolFlag(true),
  // Prometheus endpoint at GET /metrics. Off by default; when on, it needs METRICS_TOKEN
  // (Authorization: Bearer ...) or must be called from a loopback/private address.
  METRICS_ENABLED: boolFlag(false),
  METRICS_TOKEN: z.string().optional().default(''),
  // AI — keys stay server-side only; mock works without a key
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  AI_API_KEY: z.string().optional().default(''),
  AI_BASE_URL: z.string().optional().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().optional().default('gpt-4o-mini'),
  // Email — console sink by default; smtp posts to EMAIL_SMTP_URL relay
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().optional().default('noreply@zenith.local'),
  EMAIL_SMTP_URL: z.string().optional().default(''),
  EMAIL_API_KEY: z.string().optional().default(''),
  // Files — local disk by default; company settings may note cloud providers
  FILE_STORAGE_ROOT: z.string().optional().default('uploads'),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
