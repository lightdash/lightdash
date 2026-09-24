import { sqlApprovalId } from './sqlApprovalSuspend';

describe('SQL approval (native needsApproval)', () => {
    it('derives a deterministic approvalId from the toolCallId', () => {
        expect(sqlApprovalId('tc1')).toBe('sql-approval:tc1');
    });
});
