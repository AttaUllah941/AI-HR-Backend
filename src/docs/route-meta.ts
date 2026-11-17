import type { ZodType } from 'zod';

/**
 * Metadata attached to middleware functions so the OpenAPI generator can describe routes by
 * walking the real Express routers (no hand-maintained route list to drift out of date).
 */
export interface RouteMeta {
  /** Validation middleware: which part of the request the schema validates. */
  schema?: { kind: 'body' | 'query'; zod: ZodType };
  /** requirePermissions(...): all of these are required. */
  permissions?: string[];
  /** authMiddleware: everything after it needs a valid bearer token. */
  auth?: boolean;
}

const registry = new WeakMap<object, RouteMeta>();

export function attachRouteMeta<T extends object>(handler: T, meta: RouteMeta): T {
  registry.set(handler, { ...(registry.get(handler) ?? {}), ...meta });
  return handler;
}

export function getRouteMeta(handler: unknown): RouteMeta | undefined {
  return typeof handler === 'function' ? registry.get(handler) : undefined;
}
