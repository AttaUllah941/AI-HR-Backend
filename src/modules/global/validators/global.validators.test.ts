import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBookmarkSchema, isSafeInternalRoute } from './global.validators.js';

describe('bookmark route validation', () => {
  it('accepts internal paths', () => {
    for (const route of ['/', '/employees/abc', '/search?q=a%20b', '/a/b?x=1&y=2#frag']) {
      assert.equal(isSafeInternalRoute(route), true, route);
    }
  });

  it('rejects open-redirect and scheme tricks', () => {
    for (const route of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/%2F%2Fevil.com',
      '/%5Cevil.com',
      '/a//b',
      '/x?next=http://evil.com',
      'employees',
      '/bad path',
      '/%E0%A4%A',
    ]) {
      assert.equal(isSafeInternalRoute(route), false, route);
    }
  });

  it('is enforced by the create schema', () => {
    assert.equal(createBookmarkSchema.safeParse({ title: 't', route: '/ok' }).success, true);
    assert.equal(
      createBookmarkSchema.safeParse({ title: 't', route: '//evil.com' }).success,
      false,
    );
  });
});
