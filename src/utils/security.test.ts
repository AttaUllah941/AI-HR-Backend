import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SECURITY_POLICY,
  isClientIpAllowed,
  isWeakSecret,
  normalizeIpAllowlist,
  validatePasswordAgainstPolicy,
} from './security.js';

describe('security utils', () => {
  it('detects weak secrets', () => {
    assert.equal(isWeakSecret('change-me-access-secret-min-32-chars!!'), true);
    assert.equal(isWeakSecret('short'), true);
    assert.equal(isWeakSecret('a'.repeat(40)), false);
  });

  it('validates passwords against policy', () => {
    const policy = DEFAULT_SECURITY_POLICY;
    assert.match(validatePasswordAgainstPolicy('short', policy) ?? '', /at least/);
    assert.match(validatePasswordAgainstPolicy('password', policy) ?? '', /number/);
    assert.match(validatePasswordAgainstPolicy('12345678', policy) ?? '', /letter/);
    assert.equal(validatePasswordAgainstPolicy('Password1', policy), null);
    assert.match(
      validatePasswordAgainstPolicy('Password1', { ...policy, passwordRequireSpecial: true }) ?? '',
      /special/,
    );
  });

  it('normalizes IP allowlists and rejects invalid entries', () => {
    assert.deepEqual(normalizeIpAllowlist([' 127.0.0.1 ', '10.0.0.0/8']), [
      '127.0.0.1',
      '10.0.0.0/8',
    ]);
    assert.throws(() => normalizeIpAllowlist(['not-an-ip']), /Invalid IP/);
  });

  it('treats empty allowlist as allow-all', () => {
    assert.equal(isClientIpAllowed('203.0.113.1', []), true);
    assert.equal(isClientIpAllowed('203.0.113.1', ['127.0.0.1']), false);
    assert.equal(isClientIpAllowed(undefined, ['127.0.0.1']), false);
    assert.equal(isClientIpAllowed('127.0.0.1', ['127.0.0.1']), true);
  });
});
