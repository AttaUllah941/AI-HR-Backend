import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SLUG_PATTERN, slugify } from './slug.js';

describe('slugify', () => {
  it('builds a clean slug', () => {
    assert.equal(slugify('Quantum Tech Solutions'), 'quantum-tech-solutions');
    assert.equal(slugify('  ABC  Technologies!! '), 'abc-technologies');
    assert.equal(slugify('Café & Co.'), 'cafe-co');
  });
  it('falls back for empty input and matches the slug pattern', () => {
    assert.equal(slugify('###'), 'company');
    assert.ok(SLUG_PATTERN.test(slugify('Acme Corporation')));
    assert.ok(!SLUG_PATTERN.test('Bad Slug'));
  });
});
