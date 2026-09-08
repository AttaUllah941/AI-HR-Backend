import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, it } from 'node:test';
import { createApp } from './app.js';

function request(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      reject(new Error('Server has no port'));
      return;
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { Accept: 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('API smoke', () => {
  it('serves welcome, health, and unknown route responses', async () => {
    const app = createApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const welcome = await request(server, 'GET', '/');
      assert.equal(welcome.status, 200);
      assert.equal((welcome.body as { success: boolean }).success, true);

      const health = await request(server, 'GET', '/api/v1/health');
      assert.ok([200, 503].includes(health.status));
      assert.equal((health.body as { success: boolean }).success, true);
      assert.ok(['ok', 'degraded'].includes((health.body as { data: { status: string } }).data.status));

      const live = await request(server, 'GET', '/api/v1/health/live');
      assert.equal(live.status, 200);
      assert.equal((live.body as { data: { status: string } }).data.status, 'ok');

      const metrics = await request(server, 'GET', '/api/v1/health/metrics');
      assert.equal(metrics.status, 200);
      assert.ok((metrics.body as { data: { uptimeSeconds: number } }).data.uptimeSeconds >= 0);

      const missing = await request(server, 'GET', '/api/v1/this-route-does-not-exist');
      assert.equal(missing.status, 404);
      assert.equal((missing.body as { code?: string }).code, 'ROUTE_NOT_FOUND');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
