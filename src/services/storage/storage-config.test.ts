import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { envSchema } from '../../config/env.js';

const REQUIRED_ENV = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('env: file storage and proxy settings', () => {
  it('defaults to local storage and one trusted proxy hop', () => {
    const env = envSchema.parse(REQUIRED_ENV);
    assert.equal(env.FILE_STORAGE_PROVIDER, 'local');
    assert.equal(env.TRUST_PROXY, 1);
    assert.equal(env.CLOUDINARY_FOLDER, 'zenith-hr');
  });

  it('parses TRUST_PROXY as a hop count or false', () => {
    assert.equal(envSchema.parse({ ...REQUIRED_ENV, TRUST_PROXY: '2' }).TRUST_PROXY, 2);
    assert.equal(envSchema.parse({ ...REQUIRED_ENV, TRUST_PROXY: 'false' }).TRUST_PROXY, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, TRUST_PROXY: 'true' }).success, false);
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, TRUST_PROXY: '-1' }).success, false);
  });

  it('only accepts known storage providers', () => {
    assert.equal(
      envSchema.parse({ ...REQUIRED_ENV, FILE_STORAGE_PROVIDER: 'cloudinary' }).FILE_STORAGE_PROVIDER,
      'cloudinary',
    );
    assert.equal(envSchema.safeParse({ ...REQUIRED_ENV, FILE_STORAGE_PROVIDER: 's3' }).success, false);
  });
});
