import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { AppError, ValidationError } from '../utils/app-error.js';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** A request that never finished (crash, client gone) stops blocking its key after this long. */
const IN_PROGRESS_TIMEOUT_MS = 2 * 60 * 1000;

export interface IdempotencyRecord {
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus: number | null;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyStore {
  /** Atomically claims the key. If it already exists, returns the existing record instead. */
  begin(args: {
    userId: string;
    scope: string;
    key: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<{ created: true } | { created: false; existing: IdempotencyRecord }>;
  complete(userId: string, scope: string, key: string, status: number, body: unknown): Promise<void>;
  /** Forget the key (the request failed), so the client can retry with it. */
  release(userId: string, scope: string, key: string): Promise<void>;
}

export class IdempotencyConflictError extends AppError {
  constructor(message: string, code: string, status = 409) {
    super(message, status, code);
    this.name = 'IdempotencyConflictError';
  }
}

/** PostgreSQL-backed store (table idempotency_keys). */
export const prismaIdempotencyStore: IdempotencyStore = {
  async begin({ userId, scope, key, requestHash, expiresAt }) {
    const where = { userId_scope_key: { userId, scope, key } };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await prisma.idempotencyKey.create({
          data: { userId, scope, key, requestHash, expiresAt },
        });
        return { created: true };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }
        const existing = await prisma.idempotencyKey.findUnique({ where });
        if (!existing) {
          continue; // deleted between the failed insert and the read: try again
        }
        const now = Date.now();
        const expired = existing.expiresAt.getTime() < now;
        const stale =
          existing.status === 'IN_PROGRESS' &&
          existing.createdAt.getTime() < now - IN_PROGRESS_TIMEOUT_MS;
        if ((expired || stale) && attempt === 0) {
          await prisma.idempotencyKey.deleteMany({ where: { id: existing.id } });
          continue;
        }
        return {
          created: false,
          existing: {
            requestHash: existing.requestHash,
            status: existing.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
            responseStatus: existing.responseStatus,
            responseBody: existing.responseBody,
            createdAt: existing.createdAt,
            expiresAt: existing.expiresAt,
          },
        };
      }
    }
    throw new IdempotencyConflictError('Could not claim the idempotency key', 'IDEMPOTENCY_IN_PROGRESS');
  },

  async complete(userId, scope, key, status, body) {
    await prisma.idempotencyKey.updateMany({
      where: { userId, scope, key },
      data: {
        status: 'COMPLETED',
        responseStatus: status,
        responseBody: body as Prisma.InputJsonValue,
      },
    });
  },

  async release(userId, scope, key) {
    await prisma.idempotencyKey.deleteMany({ where: { userId, scope, key } });
  },
};

/** JSON.stringify with sorted keys so equivalent payloads hash the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashRequest(req: Pick<Request, 'method' | 'originalUrl' | 'body'>): string {
  return createHash('sha256')
    .update(`${req.method} ${req.originalUrl.split('?')[0]}\n${stableStringify(req.body ?? {})}`)
    .digest('hex');
}

/**
 * Optional `Idempotency-Key` support for a POST route. Place it after authentication.
 *
 *   router.post('/runs', requirePermissions('payroll:create'), idempotent('payroll.run.create'), ...)
 *
 * - No header: the request runs normally.
 * - New key: runs; a 2xx response is stored, any other outcome releases the key for a retry.
 * - Same key + same payload: the stored response is replayed (`Idempotency-Replayed: true`).
 * - Same key + different payload: 422.  Same key while the first request is still running: 409.
 */
export function idempotent(
  scope: string,
  options: { store?: IdempotencyStore; ttlMs?: number } = {},
): RequestHandler {
  const store = options.store ?? prismaIdempotencyStore;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.header(IDEMPOTENCY_HEADER);
    if (!key) {
      next();
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      next(
        new ValidationError(
          `${IDEMPOTENCY_HEADER} must be 8-128 characters: letters, digits, "-", "_", ":" or "."`,
        ),
      );
      return;
    }

    const requestHash = hashRequest(req);

    store
      .begin({ userId, scope, key, requestHash, expiresAt: new Date(Date.now() + ttlMs) })
      .then((result) => {
        if (!result.created) {
          const { existing } = result;
          if (existing.requestHash !== requestHash) {
            throw new IdempotencyConflictError(
              `${IDEMPOTENCY_HEADER} was already used with a different request`,
              'IDEMPOTENCY_KEY_REUSED',
              422,
            );
          }
          if (existing.status !== 'COMPLETED' || existing.responseStatus === null) {
            throw new IdempotencyConflictError(
              'A request with this Idempotency-Key is still being processed',
              'IDEMPOTENCY_IN_PROGRESS',
              409,
            );
          }
          res.setHeader('Idempotency-Replayed', 'true');
          res.status(existing.responseStatus).json(existing.responseBody);
          return;
        }

        // First time we see this key: capture the outcome of the real handler.
        const originalJson = res.json.bind(res);
        let settled = false;
        res.json = ((body: unknown) => {
          if (settled) {
            return originalJson(body);
          }
          settled = true;
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          const persist = ok
            ? store.complete(userId, scope, key, res.statusCode, body)
            : store.release(userId, scope, key);
          // Persist before answering so an immediate retry can never miss the stored response.
          persist.catch(() => undefined).finally(() => originalJson(body));
          return res;
        }) as typeof res.json;
        next();
      })
      .catch(next);
  };
}
