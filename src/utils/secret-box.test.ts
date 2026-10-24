import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptSecret,
  deriveKeyFromSecret,
  encryptSecret,
  isEncryptedSecret,
  parseEncryptionKey,
} from './secret-box.js';

const key = deriveKeyFromSecret('a'.repeat(40));

describe('secret-box', () => {
  it('roundtrips and prefixes', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP', key);
    assert.ok(isEncryptedSecret(enc));
    assert.notEqual(enc, encryptSecret('JBSWY3DPEHPK3PXP', key));
    assert.equal(decryptSecret(enc, key), 'JBSWY3DPEHPK3PXP');
  });

  it('detects tampering and wrong key', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const parts = enc.split(':');
    const ct = Buffer.from(parts[4]!, 'base64url');
    ct[0] = ct[0]! ^ 1;
    parts[4] = ct.toString('base64url');
    assert.throws(() => decryptSecret(parts.join(':'), key));
    assert.throws(() => decryptSecret(enc, deriveKeyFromSecret('b'.repeat(40))));
  });

  it('passes legacy plaintext through', () => {
    assert.equal(decryptSecret('JBSWY3DPEHPK3PXP', key), 'JBSWY3DPEHPK3PXP');
  });

  it('parses hex and base64 keys', () => {
    assert.equal(parseEncryptionKey('ab'.repeat(32))?.length, 32);
    assert.equal(parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'))?.length, 32);
    assert.equal(parseEncryptionKey('short'), null);
  });
});
