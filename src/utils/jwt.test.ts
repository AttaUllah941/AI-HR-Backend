import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  signAccessToken,
  signMfaChallengeToken,
  verifyAccessToken,
  verifyMfaChallengeToken,
} from './jwt.js';

describe('jwt mfa challenge', () => {
  it('round-trips the challenge payload including remember', () => {
    const token = signMfaChallengeToken({ sub: 'u1', email: 'a@b.com', remember: true });
    const payload = verifyMfaChallengeToken(token);
    assert.equal(payload.sub, 'u1');
    assert.equal(payload.email, 'a@b.com');
    assert.equal(payload.remember, true);
    assert.equal(payload.type, 'mfa_challenge');
  });

  it('never validates a challenge token as an access token', () => {
    const token = signMfaChallengeToken({ sub: 'u1', email: 'a@b.com' });
    assert.throws(() => verifyAccessToken(token));
  });

  it('never validates an access token as a challenge token', () => {
    const access = signAccessToken({
      sub: 'u1',
      email: 'a@b.com',
      roles: [],
      permissions: [],
      sid: 's1',
    });
    assert.throws(() => verifyMfaChallengeToken(access));
    assert.equal(verifyAccessToken(access).sid, 's1');
  });
});
