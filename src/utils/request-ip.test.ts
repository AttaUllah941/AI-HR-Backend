import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import { getRequestIp } from './request-ip.js';

function mockRequest(parts: Partial<Request>): Request {
  return parts as unknown as Request;
}

describe('request-ip', () => {
  it('reads the first forwarded IP when x-forwarded-for is set', () => {
    const req = mockRequest({
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
    });
    assert.equal(getRequestIp(req), '203.0.113.1');
  });

  it('falls back to req.ip', () => {
    const req = mockRequest({
      headers: {},
      ip: '::1',
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
    });
    assert.equal(getRequestIp(req), '::1');
  });
});
