import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isIpAllowed, isValidIpOrCidr, normalizeCidr, normalizeIp } from './ip-matcher.js';

describe('ip-matcher', () => {
  it('normalizes IPv4-mapped IPv6 addresses', () => {
    assert.equal(normalizeIp('::ffff:192.168.1.10'), '192.168.1.10');
  });

  it('validates individual IPs and CIDR ranges', () => {
    assert.equal(isValidIpOrCidr('192.168.1.1'), true);
    assert.equal(isValidIpOrCidr('192.168.1.0/24'), true);
    assert.equal(isValidIpOrCidr('::1'), true);
    assert.equal(isValidIpOrCidr('invalid'), false);
    assert.equal(isValidIpOrCidr('999.1.1.1'), false);
    assert.equal(isValidIpOrCidr('192.168.1.0/33'), false);
  });

  it('normalizes CIDR values for storage', () => {
    assert.equal(normalizeCidr(' 192.168.0.0/16 '), '192.168.0.0/16');
    assert.equal(normalizeCidr('::ffff:127.0.0.1'), '127.0.0.1');
  });

  it('matches exact IP addresses', () => {
    assert.equal(isIpAllowed('127.0.0.1', ['127.0.0.1', '10.0.0.1']), true);
    assert.equal(isIpAllowed('::1', ['::1']), true);
    assert.equal(isIpAllowed('203.0.113.5', ['127.0.0.1']), false);
  });

  it('matches IPv4 CIDR ranges', () => {
    assert.equal(isIpAllowed('192.168.10.25', ['192.168.0.0/16']), true);
    assert.equal(isIpAllowed('10.0.0.50', ['192.168.0.0/16']), false);
    assert.equal(isIpAllowed('192.168.255.1', ['192.168.0.0/16']), true);
  });

  it('returns false when no rules are configured', () => {
    assert.equal(isIpAllowed('127.0.0.1', []), false);
  });
});
