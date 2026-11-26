import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { updateProfileSchema } from './profile.validators.js';

const parse = (avatarUrl: unknown) => updateProfileSchema.safeParse({ avatarUrl });

describe('profile avatar address', () => {
  it('accepts an https address and a path on this site', () => {
    assert.equal(parse('https://cdn.example.com/me.png').success, true);
    assert.equal(parse('/api/v1/files/abc123/preview').success, true);
  });

  it('accepts clearing the picture', () => {
    assert.equal(updateProfileSchema.safeParse({ avatarUrl: null, firstName: 'Ada' }).success, true);
  });

  it('rejects schemes that are not https', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com/a.png', 'http://example.com/a.png']) {
      assert.equal(parse(bad).success, false, bad);
    }
  });

  it('rejects a protocol-relative address that would load from another host', () => {
    assert.equal(parse('//evil.example/a.png').success, false);
  });
});
