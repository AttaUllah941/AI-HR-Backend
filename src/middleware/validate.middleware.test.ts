import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import { z } from 'zod';
import { validateQuery } from './validate.middleware.js';

describe('validateQuery (Express 5 getter-only req.query)', () => {
  it('replaces req.query with the parsed value instead of throwing', async () => {
    const app = express();
    app.get('/', validateQuery(z.object({ n: z.coerce.number().default(1) })), (req, res) => {
      res.json(req.query);
    });
    const server = app.listen(0);
    try {
      const { port } = server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/?n=5`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { n: 5 });
      const defaulted = await fetch(`http://127.0.0.1:${port}/`);
      assert.deepEqual(await defaulted.json(), { n: 1 });
    } finally {
      server.close();
    }
  });
});
