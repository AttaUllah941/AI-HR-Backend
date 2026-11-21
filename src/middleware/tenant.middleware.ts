import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/app-error.js';

/**
 * For routes mounted under /companies/:companyId. The path is never trusted: it must match the
 * tenant stored on the authenticated user (id or slug), otherwise the request is refused.
 */
export function requireSameCompanyParam(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    next(new UnauthorizedError());
    return;
  }

  const requested = String(req.params.companyId ?? '').toLowerCase();
  const own = [user.companyId, user.companySlug]
    .filter((v): v is string => typeof v === 'string' && v !== '')
    .map((v) => v.toLowerCase());

  if (own.length === 0 || !own.includes(requested)) {
    next(new ForbiddenError('You do not have access to this company'));
    return;
  }
  next();
}
