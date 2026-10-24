import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canSelfApprovePayrollRun } from './payroll.service.js';

describe('canSelfApprovePayrollRun', () => {
  it('allows anyone who did not process the run', () => {
    assert.equal(
      canSelfApprovePayrollRun({ processedByActor: false, actorIsSuperAdmin: false, otherApproverCount: 3 }),
      true,
    );
  });
  it('blocks processor when other approvers exist', () => {
    assert.equal(
      canSelfApprovePayrollRun({ processedByActor: true, actorIsSuperAdmin: false, otherApproverCount: 1 }),
      false,
    );
  });
  it('allows super admin or sole approver', () => {
    assert.equal(
      canSelfApprovePayrollRun({ processedByActor: true, actorIsSuperAdmin: true, otherApproverCount: 2 }),
      true,
    );
    assert.equal(
      canSelfApprovePayrollRun({ processedByActor: true, actorIsSuperAdmin: false, otherApproverCount: 0 }),
      true,
    );
  });
});
