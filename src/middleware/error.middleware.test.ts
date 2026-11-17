import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../utils/app-error.js';
import { errorHandler, notFoundHandler } from './error.middleware.js';

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

describe('error middleware', () => {
  it('maps AppError subclasses', () => {
    const { res, state } = mockRes();
    errorHandler(new ValidationError('Bad input'), {} as Request, res, (() => undefined) as NextFunction);
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { success: boolean }).success, false);
    assert.equal((state.body as { code?: string }).code, 'VALIDATION_ERROR');

    const notFound = mockRes();
    errorHandler(new NotFoundError('Missing'), {} as Request, notFound.res, (() => undefined) as NextFunction);
    assert.equal(notFound.state.statusCode, 404);

    const conflict = mockRes();
    errorHandler(new ConflictError('Taken'), {} as Request, conflict.res, (() => undefined) as NextFunction);
    assert.equal(conflict.state.statusCode, 409);
  });

  it('maps ZodError to validation failure', () => {
    const { res, state } = mockRes();
    let zodErr: ZodError;
    try {
      z.object({ email: z.string().email() }).parse({ email: 'nope' });
      assert.fail('expected zod error');
    } catch (err) {
      zodErr = err as ZodError;
    }
    errorHandler(zodErr!, {} as Request, res, (() => undefined) as NextFunction);
    assert.equal(state.statusCode, 400);
    assert.equal((state.body as { code?: string }).code, 'VALIDATION_ERROR');
  });

  it('maps Prisma unique constraint errors', () => {
    const { res, state } = mockRes();
    const err = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    errorHandler(err, {} as Request, res, (() => undefined) as NextFunction);
    assert.equal(state.statusCode, 409);
    assert.equal((state.body as { code?: string }).code, 'UNIQUE_CONSTRAINT');
  });

  it('forwards not-found handler via AppError', () => {
    let captured: unknown;
    notFoundHandler({} as Request, {} as Response, ((err) => {
      captured = err;
    }) as NextFunction);
    assert.ok(captured instanceof Error);
    assert.equal((captured as { code?: string }).code, 'ROUTE_NOT_FOUND');
  });
});
