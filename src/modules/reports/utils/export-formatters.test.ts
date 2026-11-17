import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { neutralizeFormula, toCsv, toXlsx } from './export-formatters.js';

describe('export formatters', () => {
  it('neutralizes formula-leading characters', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      assert.equal(neutralizeFormula(`${lead}SUM(A1)`), `'${lead}SUM(A1)`);
    }
    assert.equal(neutralizeFormula('Alice'), 'Alice');
    assert.equal(neutralizeFormula('a=b'), 'a=b');
    assert.equal(neutralizeFormula(''), '');
  });

  it('escapes CSV values and guards formulas but keeps numbers intact', () => {
    const csv = toCsv(
      ['Name', 'Note', 'Amount'],
      [
        ['=HYPERLINK("x")', 'say "hi", ok', -5],
        [null, undefined, 0],
      ],
    );
    const body = csv.replace(/^﻿/, '');
    const lines = body.split('\r\n');
    assert.equal(lines[0], 'Name,Note,Amount');
    assert.equal(lines[1], `"'=HYPERLINK(""x"")","say ""hi"", ok",-5`);
    assert.equal(lines[2], ',,0');
  });

  it('writes a real xlsx (zip) workbook', async () => {
    const buffer = await toXlsx('Report', ['A', 'B'], [['x', 1]]);
    assert.ok(buffer.length > 100);
    assert.equal(buffer[0], 0x50);
    assert.equal(buffer[1], 0x4b);
  });
});
