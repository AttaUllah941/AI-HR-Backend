import type { NextFunction, Request, Response } from 'express';

/**
 * Rarely-changing, tenant-scoped lookup lists (departments, leave types, shifts, roles...).
 * Express already adds a weak ETag to JSON responses; this adds the Cache-Control that lets
 * browsers revalidate with `If-None-Match` and get an empty 304 instead of the full list.
 *
 * `no-cache` (not max-age) on purpose: the client must revalidate every time, so a list is never
 * served stale after someone creates, edits or deletes an item. `private` keeps proxies from
 * sharing one tenant's list with another.
 */
export const LOOKUP_PATHS = [
  /\/organization\/(branches|departments|teams|designations)\/?$/,
  /\/leave\/types\/?$/,
  /\/attendance\/(shifts|holidays)\/?$/,
  /\/settings\/(roles|permissions)\/?$/,
];

export function isLookupRequest(method: string, path: string): boolean {
  return method === 'GET' && LOOKUP_PATHS.some((pattern) => pattern.test(path));
}

export function lookupCache(req: Request, res: Response, next: NextFunction): void {
  if (isLookupRequest(req.method, req.path)) {
    res.setHeader('Cache-Control', 'private, no-cache');
    res.vary('Authorization');
  }
  next();
}
