import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { exportReportSchema, reportQuerySchema } from './reports.validators.js';

describe('report date-range validation', () => {
  it('accepts valid and empty ranges', () => {
    assert.equal(reportQuerySchema.safeParse({}).success, true);
    assert.equal(reportQuerySchema.safeParse({ dateFrom: '', dateTo: '' }).success, true);
    assert.equal(
      reportQuerySchema.safeParse({ dateFrom: '2024-01-01', dateTo: '2024-01-01' }).success,
      true,
    );
    assert.equal(
      reportQuerySchema.safeParse({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }).success,
      true,
    );
    assert.equal(reportQuerySchema.safeParse({ dateFrom: '2024-02-29' }).success, true);
  });

  it('rejects impossible dates, inverted and oversized ranges', () => {
    assert.equal(reportQuerySchema.safeParse({ dateFrom: '2023-02-29' }).success, false);
    assert.equal(reportQuerySchema.safeParse({ dateFrom: '2024-13-01' }).success, false);
    assert.equal(reportQuerySchema.safeParse({ dateFrom: '24-01-01' }).success, false);
    assert.equal(
      reportQuerySchema.safeParse({ dateFrom: '2024-02-01', dateTo: '2024-01-01' }).success,
      false,
    );
    assert.equal(
      reportQuerySchema.safeParse({ dateFrom: '2020-01-01', dateTo: '2024-01-01' }).success,
      false,
    );
  });

  it('applies the same rules to exports and defaults the format', () => {
    const ok = exportReportSchema.parse({ reportType: 'LEAVE' });
    assert.equal(ok.format, 'CSV');
    assert.equal(
      exportReportSchema.safeParse({
        reportType: 'LEAVE',
        dateFrom: '2024-02-01',
        dateTo: '2024-01-01',
      }).success,
      false,
    );
    assert.equal(exportReportSchema.safeParse({ reportType: 'NOPE' }).success, false);
  });
});
