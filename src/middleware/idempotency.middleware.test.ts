import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import {
  hashRequest,
  idempotent,
  stableStringify,
  type IdempotencyRecord,
  type IdempotencyStore,
} from './idempotency.middleware.js';

class MemoryStore implements IdempotencyStore {
  readonly rows = new Map<string, IdempotencyRecord>();
  private id = (u: string, s: string, k: string) => `${u}|${s}|${k}`;

  async begin(args: Parameters<IdempotencyStore['begin']>[0]) {
    const id = this.id(args.userId, args.scope, args.key);
    const existing = this.rows.get(id);
    if (existing) {
      return { created: false as const, existing };
    }
    this.rows.set(id, {
      requestHash: args.requestHash,
      status: 'IN_PROGRESS',
      responseStatus: null,
      responseBody: null,
      createdAt: new Date(),
      expiresAt: args.expiresAt,
    });
    return { created: true as const };
  }

  async complete(userId: string, scope: string, key: string, status: number, body: unknown) {
    const row = this.rows.get(this.id(userId, scope, key));
    if (row) {
      row.status = 'COMPLETED';
      row.responseStatus = status;
      row.responseBody = body;
    }
  }

  async release(userId: string, scope: string, key: string) {
    this.rows.delete(this.id(userId, scope, key));
  }
}

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  sent: unknown[];
  status(code: number): FakeResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): FakeResponse;
}

function fakeRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    sent: [],
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[name] = value;
    },
    json(body) {
      res.sent.push(body);
      return res;
    },
  };
  return res;
}

function fakeReq(options: { key?: string; body?: unknown; userId?: string | null } = {}): Request {
  const headers: Record<string, string> = {};
  if (options.key) headers['idempotency-key'] = options.key;
  return {
    method: 'POST',
    originalUrl: '/api/v1/payroll/runs',
    body: options.body ?? { year: 2026, month: 5 },
    user: options.userId === null ? undefined : { id: options.userId ?? 'u1' },
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

/** Runs the middleware; resolves with { nextArg, called } once it has either called next or answered. */
function run(mw: ReturnType<typeof idempotent>, req: Request, res: FakeResponse) {
  return new Promise<{ nextArg: unknown; called: boolean }>((resolve) => {
    let done = false;
    const finish = (nextArg: unknown, called: boolean) => {
      if (!done) {
        done = true;
        resolve({ nextArg, called });
      }
    };
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const out = originalJson(body);
      return out;
    };
    mw(req, res as unknown as Response, (arg?: unknown) => finish(arg, true));
    // Replay answers immediately without calling next.
    setTimeout(() => finish(undefined, false), 20);
  });
}

describe('stableStringify / hashRequest', () => {
  it('ignores key order and undefined values', () => {
    assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }], z: undefined }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('hashes equivalent bodies identically and different bodies differently', () => {
    const a = hashRequest({ method: 'POST', originalUrl: '/x?q=1', body: { a: 1, b: 2 } });
    const b = hashRequest({ method: 'POST', originalUrl: '/x?q=2', body: { b: 2, a: 1 } });
    const c = hashRequest({ method: 'POST', originalUrl: '/x', body: { a: 1, b: 3 } });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe('idempotent middleware', () => {
  it('does nothing without the header', async () => {
    const store = new MemoryStore();
    const { called, nextArg } = await run(idempotent('s', { store }), fakeReq(), fakeRes());
    assert.equal(called, true);
    assert.equal(nextArg, undefined);
    assert.equal(store.rows.size, 0);
  });

  it('rejects malformed keys with a 400', async () => {
    const { nextArg } = await run(idempotent('s', { store: new MemoryStore() }), fakeReq({ key: 'short' }), fakeRes());
    assert.equal((nextArg as { statusCode: number }).statusCode, 400);
  });

  it('stores a 2xx response and replays it for the same key and payload', async () => {
    const store = new MemoryStore();
    const mw = idempotent('payroll.run.create', { store });

    const firstRes = fakeRes();
    const first = await run(mw, fakeReq({ key: 'key-12345678' }), firstRes);
    assert.equal(first.called, true);
    firstRes.status(201).json({ success: true, data: { id: 'run1' } });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(firstRes.sent, [{ success: true, data: { id: 'run1' } }]);

    const replayRes = fakeRes();
    const replay = await run(mw, fakeReq({ key: 'key-12345678' }), replayRes);
    assert.equal(replay.called, false, 'handler must not run again');
    assert.equal(replayRes.statusCode, 201);
    assert.equal(replayRes.headers['Idempotency-Replayed'], 'true');
    assert.deepEqual(replayRes.sent, [{ success: true, data: { id: 'run1' } }]);
  });

  it('answers 422 when the key is reused with a different payload', async () => {
    const store = new MemoryStore();
    const mw = idempotent('s', { store });
    const res1 = fakeRes();
    await run(mw, fakeReq({ key: 'key-12345678', body: { month: 1 } }), res1);
    res1.status(201).json({ ok: true });
    await new Promise((r) => setTimeout(r, 10));

    const { nextArg } = await run(mw, fakeReq({ key: 'key-12345678', body: { month: 2 } }), fakeRes());
    assert.equal((nextArg as { statusCode: number }).statusCode, 422);
    assert.equal((nextArg as { code: string }).code, 'IDEMPOTENCY_KEY_REUSED');
  });

  it('answers 409 while the first request is still running', async () => {
    const store = new MemoryStore();
    const mw = idempotent('s', { store });
    await run(mw, fakeReq({ key: 'key-12345678' }), fakeRes()); // first request: never answered yet

    const { nextArg } = await run(mw, fakeReq({ key: 'key-12345678' }), fakeRes());
    assert.equal((nextArg as { statusCode: number }).statusCode, 409);
    assert.equal((nextArg as { code: string }).code, 'IDEMPOTENCY_IN_PROGRESS');
  });

  it('releases the key when the request fails so the client can retry', async () => {
    const store = new MemoryStore();
    const mw = idempotent('s', { store });
    const res1 = fakeRes();
    await run(mw, fakeReq({ key: 'key-12345678' }), res1);
    res1.status(400).json({ success: false });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(store.rows.size, 0);

    const retry = await run(mw, fakeReq({ key: 'key-12345678' }), fakeRes());
    assert.equal(retry.called, true, 'retry executes normally');
  });

  it('scopes keys per user', async () => {
    const store = new MemoryStore();
    const mw = idempotent('s', { store });
    await run(mw, fakeReq({ key: 'key-12345678', userId: 'u1' }), fakeRes());
    const other = await run(mw, fakeReq({ key: 'key-12345678', userId: 'u2' }), fakeRes());
    assert.equal(other.called, true);
    assert.equal(other.nextArg, undefined);
  });
});
