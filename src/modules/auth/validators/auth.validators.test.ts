import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loginSchema, mfaVerifySchema, registerSchema } from './auth.validators.js';

describe('auth validators', () => {
  it('accepts valid register payloads', () => {
    const parsed = registerSchema.parse({
      email: 'admin@zenith.local',
      password: 'Password123!',
      firstName: 'Ada',
      lastName: 'Lovelace',
      companyName: 'Zenith',
    });
    assert.equal(parsed.email, 'admin@zenith.local');
  });

  it('rejects weak register passwords', () => {
    assert.throws(() =>
      registerSchema.parse({
        email: 'admin@zenith.local',
        password: 'password',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    );
  });

  it('requires email and password for login', () => {
    assert.throws(() => loginSchema.parse({ email: 'bad', password: 'x' }));
    const parsed = loginSchema.parse({
      email: 'admin@zenith.local',
      password: 'secret',
      remember: true,
    });
    assert.equal(parsed.remember, true);
  });

  it('requires a 6-digit MFA code', () => {
    assert.throws(() => mfaVerifySchema.parse({ mfaToken: 'tok', code: '12' }));
    const parsed = mfaVerifySchema.parse({ mfaToken: 'tok', code: '123456' });
    assert.equal(parsed.code, '123456');
  });
});
