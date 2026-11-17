import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesMagicBytes } from './local-file-storage.js';

const bytes = (...values: number[]) => Buffer.from(values);
const OLE2 = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

describe('matchesMagicBytes', () => {
  it('accepts valid signatures', () => {
    assert.equal(matchesMagicBytes('.pdf', Buffer.from('%PDF-1.7\n')), true);
    assert.equal(
      matchesMagicBytes('.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
      true,
    );
    assert.equal(matchesMagicBytes('.jpg', bytes(0xff, 0xd8, 0xff, 0xe0)), true);
    assert.equal(matchesMagicBytes('.jpeg', bytes(0xff, 0xd8, 0xff, 0xdb)), true);
    assert.equal(matchesMagicBytes('.jpeg', bytes(0xff, 0xd8, 0xff, 0xe1)), true);
    assert.equal(matchesMagicBytes('.gif', Buffer.from('GIF89a....')), true);
    assert.equal(matchesMagicBytes('.gif', Buffer.from('GIF87a....')), true);
    assert.equal(
      matchesMagicBytes(
        '.webp',
        Buffer.concat([Buffer.from('RIFF'), bytes(1, 2, 3, 4), Buffer.from('WEBP')]),
      ),
      true,
    );
    assert.equal(matchesMagicBytes('.docx', bytes(0x50, 0x4b, 0x03, 0x04, 0)), true);
    assert.equal(matchesMagicBytes('.xlsx', bytes(0x50, 0x4b, 0x03, 0x04, 0)), true);
    assert.equal(matchesMagicBytes('.doc', OLE2), true);
    assert.equal(matchesMagicBytes('.xls', OLE2), true);
    assert.equal(matchesMagicBytes('.txt', Buffer.from('plain text é ü')), true);
    assert.equal(matchesMagicBytes('.csv', Buffer.from('a,b\n1,2\n')), true);
    assert.equal(matchesMagicBytes('.txt', Buffer.alloc(0)), true);
  });

  it('rejects mismatched content', () => {
    assert.equal(matchesMagicBytes('.pdf', Buffer.from('<html>')), false);
    assert.equal(matchesMagicBytes('.png', bytes(0xff, 0xd8, 0xff)), false);
    assert.equal(
      matchesMagicBytes(
        '.webp',
        Buffer.concat([Buffer.from('RIFF'), bytes(1, 2, 3, 4), Buffer.from('WAVE')]),
      ),
      false,
    );
    assert.equal(matchesMagicBytes('.docx', Buffer.from('MZ')), false);
    assert.equal(matchesMagicBytes('.csv', bytes(0x61, 0x00, 0x62)), false);
    assert.equal(matchesMagicBytes('.exe', Buffer.from('MZ')), false);
    assert.equal(matchesMagicBytes('.pdf', Buffer.alloc(2)), false);
  });
});
