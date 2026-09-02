import type { NextFunction, Request, Response } from 'express';
import { extractRolesAndPermissions } from '../modules/auth/dto/auth.dto.js';
import { AuthRepository } from '../modules/auth/repositories/auth.repository.js';
import { UnauthorizedError } from '../utils/app-error.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { asyncHandler } from './async-handler.js';

const authRepo = new AuthRepository();

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

async function hydrateAuthUser(userId: string): Promise<AuthUser | null> {
  const user = await authRepo.findById(userId);
  if (
    !user ||
    user.status === 'SUSPENDED' ||
    user.status === 'DELETED' ||
    user.status === 'PENDING_VERIFICATION'
  ) {
    return null;
  }

  const { roles, permissions } = extractRolesAndPermissions(user);
  return {
    id: user.id,
    email: user.email,
    roles,
    permissions,
  };
}

export const authMiddleware = asyncHandler(async (req, res, next) => {
  await runAuthMiddleware(req, res, next);
});

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
    const user = await hydrateAuthUser(payload.sub);
    if (!user) {
      next(new UnauthorizedError('Account is not allowed'));
      return;
    }
    req.user = user;
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
    const user = await hydrateAuthUser(payload.sub);
    if (user) {
      req.user = user;
    }
  } catch {
    // Ignore invalid token for optional auth
  }

  next();
}
