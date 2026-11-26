import type { NextFunction, Request, Response } from 'express';
import { extractRolesAndPermissions } from '../modules/auth/dto/auth.dto.js';
import { AuthRepository } from '../modules/auth/repositories/auth.repository.js';
import { ForbiddenError, UnauthorizedError } from '../utils/app-error.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { asyncHandler } from './async-handler.js';
import { attachRouteMeta } from '../docs/route-meta.js';

const authRepo = new AuthRepository();

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  /** Tenant of the account (null for platform-level accounts). Always taken from the database. */
  companyId: string | null;
  companySlug: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function hydrateAuthUser(userId: string, sessionId?: string): Promise<AuthUser | null> {
  // Tokens without a session id cannot be revoked, so they are never accepted.
  if (!sessionId) return null;

  const user = await authRepo.findByIdWithActiveSession(userId, sessionId);
  if (
    !user ||
    user.sessions.length === 0 ||
    user.status === 'SUSPENDED' ||
    user.status === 'INACTIVE' ||
    user.status === 'DELETED' ||
    user.status === 'PENDING_VERIFICATION' ||
    (user.lockedUntil != null && user.lockedUntil > new Date())
  ) {
    return null;
  }

  // A deactivated or deleted company locks out every user of that tenant immediately.
  if (user.companyId != null && (!user.company || !user.company.isActive || user.company.deletedAt)) {
    return null;
  }

  const { roles, permissions } = extractRolesAndPermissions(user);
  return {
    id: user.id,
    email: user.email,
    roles,
    permissions,
    sessionId,
    companyId: user.companyId,
    companySlug: user.company?.slug ?? null,
  };
}

export const authMiddleware = attachRouteMeta(
  asyncHandler(async (req, res, next) => {
    await runAuthMiddleware(req, res, next);
  }),
  { auth: true },
);

async function runAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    const user = await hydrateAuthUser(payload.sub, payload.sid);
    if (!user) {
      next(new UnauthorizedError('Account is not allowed'));
      return;
    }
    req.user = user;

    // The SPA sends the slug from the URL it is showing. A mismatch means the user is trying to
    // view another tenant's area, so refuse it even though every query is scoped by companyId.
    const claimedSlug = req.headers['x-company-slug'];
    if (
      typeof claimedSlug === 'string' &&
      claimedSlug !== '' &&
      claimedSlug.toLowerCase() !== (user.companySlug ?? '')
    ) {
      next(new ForbiddenError('You do not have access to this company'));
      return;
    }
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}

/** Optional auth — attaches user when token present, otherwise continues. */
export const optionalAuthMiddleware = asyncHandler(async (req, res, next) => {
  await runOptionalAuthMiddleware(req, res, next);
});

async function runOptionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    const user = await hydrateAuthUser(payload.sub, payload.sid);
    if (user) {
      req.user = user;
    }
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
}
