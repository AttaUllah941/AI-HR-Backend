import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBranchSchema,
  createDepartmentSchema,
  createDesignationSchema,
  createTeamSchema,
} from './organization.validators.js';

describe('organization codes', () => {
  it('rejects a code that is only spaces', () => {
    assert.equal(createBranchSchema.safeParse({ name: 'HQ', code: '   ' }).success, false);
    assert.equal(createDepartmentSchema.safeParse({ name: 'Eng', code: '  ' }).success, false);
    assert.equal(createDesignationSchema.safeParse({ name: 'Lead', code: ' ', level: 1 }).success, false);
    assert.equal(
      createTeamSchema.safeParse({ name: 'Core', code: '	', departmentId: 'x' }).success,
      false,
    );
  });

  it('trims the code it accepts', () => {
    const parsed = createBranchSchema.safeParse({ name: 'HQ', code: '  hq1  ' });
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.code, 'hq1');
  });
});
