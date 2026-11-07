import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { request, type Server } from 'node:http';
import { envSchema } from '../config/env.js';
import { isLookupRequest, lookupCache } from './lookup-cache.middleware.js';
import { isInternalAddress, metricsAccess } from './metrics.middleware.js';
import { requestTimeout, timeoutFor } from './request-timeout.middleware.js';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('env: pool, timeout and metrics settings', () => {
  it('provides validated defaults', () => {
    const env = envSchema.parse(REQUIRED_ENV);
    assert.equal(env.DB_POOL_MAX, 10);
    assert.equal(env.DB_POOL_IDLE_TIMEOUT_MS, 30_000);
    assert.equal(env.DB_POOL_CONNECTION_TIMEOUT_MS, 5_000);
    assert.equal(env.DB_SLOW_QUERY_MS, 200);
    assert.equal(env.REQUEST_TIMEOUT_MS, 30_000);
    assert.equal(env.COMPRESSION_ENABLED, true);
    assert.equal(env.METRICS_ENABLED, false);
  });

  it('reads overrides and coerces numbers/flags', () => {
    const env = envSchema.parse({
      ...REQUIRED_ENV,
      DB_POOL_MAX: '25',
      DB_POOL_IDLE_TIMEOUT_MS: '0',
      COMPRESSION_ENABLED: 'false',
      METRICS_ENABLED: 'true',
      METRICS_TOKEN: 'secret',
    });
    assert.equal(env.DB_POOL_MAX, 25);
    assert.equal(env.DB_POOL_IDLE_TIMEOUT_MS, 0);
    assert.equal(env.COMPRESSION_ENABLED, false);
    assert.equal(env.METRICS_ENABLED, true);
    assert.equal(env.METRICS_TOKEN, 'secret');
  });

  it('rejects out-of-range pool settings', () => {
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, DB_POOL_MAX: '0' }).success, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, DB_POOL_MAX: '500' }).success, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, DB_POOL_CONNECTION_TIMEOUT_MS: '5' }).success, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, REQUEST_TIMEOUT_MS: '10' }).success, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, METRICS_ENABLED: 'yes' }).success, false);
  });
});

describe('request timeout budgets', () => {
  it('uses the default except for known long-running routes', () => {
    assert.equal(timeoutFor('/api/v1/employees', 30_000), 30_000);
    assert.equal(timeoutFor('/api/v1/payroll/runs/abc/process', 30_000), 150_000);
    assert.equal(timeoutFor('/api/v1/reports/export', 30_000), 120_000);
    assert.equal(timeoutFor('/api/v1/ai/assistant/chat', 30_000), 90_000);
  });
});

describe('lookup caching headers', () => {
  it('flags only GETs of lookup lists', () => {
    assert.equal(isLookupRequest('GET', '/organization/departments'), true);
    assert.equal(isLookupRequest('GET', '/leave/types'), true);
    assert.equal(isLookupRequest('GET', '/attendance/shifts'), true);
    assert.equal(isLookupRequest('POST', '/organization/departments'), false);
    assert.equal(isLookupRequest('GET', '/employees'), false);
    assert.equal(isLookupRequest('GET', '/organization/departments/abc'), false);
  });
});

describe('metrics access', () => {
  it('recognises internal addresses', () => {
    for (const ip of ['127.0.0.1', '::1', '::ffff:10.1.2.3', '172.20.0.5', '192.168.1.9', 'fd00::1']) {
      assert.equal(isInternalAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '::ffff:93.184.216.34', undefined]) {
      assert.equal(isInternalAddress(ip), false, String(ip));
    }
  });
});

function conditionalGet(url: string, etag: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, { headers: { 'If-None-Match': etag } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('HTTP behaviour (real server)', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(requestTimeout(80));
    app.use('/api', lookupCache);
    app.get('/api/organization/departments', (_req, res) => {
      res.json({ success: true, data: { items: [{ id: 'd1', name: 'Engineering' }] } });
    });
    app.get('/api/employees', (_req, res) => {
      res.json({ success: true, data: { items: [] } });
    });
    app.get('/api/slow', (_req, res) => {
      setTimeout(() => {
        if (!res.headersSent) res.json({ late: true });
      }, 400);
    });
    app.get('/metrics-off', metricsAccess({ enabled: false, token: '' }), (_req, res) => res.send('ok'));
    app.get('/metrics-token', metricsAccess({ enabled: true, token: 'secret' }), (_req, res) => res.send('ok'));
    app.get('/metrics-internal', metricsAccess({ enabled: true, token: '' }), (_req, res) => res.send('ok'));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('lookup lists revalidate: private no-cache + ETag, and answer 304 when unchanged', async () => {
    const first = await fetch(`${base}/api/organization/departments`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'private, no-cache');
    assert.match(first.headers.get('vary') ?? '', /Authorization/i);
    const etag = first.headers.get('etag');
    assert.ok(etag, 'ETag present');
    await first.text();

    // fetch() adds `Cache-Control: no-cache` when If-None-Match is set, which disables revalidation,
    // so use a raw request like a browser's conditional GET.
    const second = await conditionalGet(`${base}/api/organization/departments`, etag);
    assert.equal(second.status, 304);
    assert.equal(second.body.length, 0, 'no body on 304');
  });

  it('does not add lookup cache headers to other endpoints', async () => {
    const res = await fetch(`${base}/api/employees`);
    assert.equal(res.headers.get('cache-control'), null);
  });

  it('answers 503 REQUEST_TIMEOUT for a handler that exceeds its budget', async () => {
    const res = await fetch(`${base}/api/slow`);
    assert.equal(res.status, 503);
    const body = (await res.json()) as { code: string; success: boolean };
    assert.equal(body.code, 'REQUEST_TIMEOUT');
    assert.equal(body.success, false);
  });

  it('metrics: 404 when disabled, 401 without the token, 200 with it, internal-only without a token', async () => {
    assert.equal((await fetch(`${base}/metrics-off`)).status, 404);
    assert.equal((await fetch(`${base}/metrics-token`)).status, 401);
    assert.equal(
      (await fetch(`${base}/metrics-token`, { headers: { Authorization: 'Bearer wrong' } })).status,
      401,
    );
    assert.equal(
      (await fetch(`${base}/metrics-token`, { headers: { Authorization: 'Bearer secret' } })).status,
      200,
    );
    // The test client connects from loopback, which counts as internal.
    assert.equal((await fetch(`${base}/metrics-internal`)).status, 200);
  });
});
