import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
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

describe('jwt algorithm pinning', () => {
  const claims = { sub: 'u1', email: 'a@b.com', roles: [], permissions: [], sid: 's1', type: 'access' };

  it('signs access tokens with HS256', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com', roles: [], permissions: [], sid: 's1' });
    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
    assert.equal(header.alg, 'HS256');
  });

  it('rejects a token signed with a different algorithm, even with the right secret', () => {
    const token = jwt.sign(claims, env.JWT_ACCESS_SECRET, { algorithm: 'HS512', expiresIn: '5m' });
    assert.throws(() => verifyAccessToken(token));
  });

  it('rejects an unsigned token', () => {
    const token = jwt.sign(claims, '', { algorithm: 'none', expiresIn: '5m' });
    assert.throws(() => verifyAccessToken(token));
  });
});
