import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, spendPasswordCheckTime, verifyPassword } from './password.js';

describe('password helpers', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Correct-horse-1');
    assert.equal(await verifyPassword('Correct-horse-1', hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);
  });

  it('spends a real bcrypt check on a throwaway hash without throwing', async () => {
    const started = Date.now();
    await spendPasswordCheckTime('anything');
    // A 12-round bcrypt compare is never instantaneous; this guards against the helper becoming a no-op.
    assert.ok(Date.now() - started >= 20, 'expected the check to take measurable time');
  });
});
