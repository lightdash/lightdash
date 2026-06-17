import {
    extractPendingSqlApprovals,
    sqlApprovalId,
} from './sqlApprovalSuspend';

const approvalRequest = (toolCallId: string, sql: string) => ({
    type: 'tool-approval-request' as const,
    approvalId: sqlApprovalId(toolCallId),
    toolCall: { toolCallId, toolName: 'runSql', input: { sql } },
});

describe('SQL approval (native needsApproval)', () => {
    it('derives a deterministic approvalId from the toolCallId', () => {
        expect(sqlApprovalId('tc1')).toBe('sql-approval:tc1');
        expect(sqlApprovalId('tc1')).toBe(sqlApprovalId('tc1'));
    });

    it('extracts pending approvals from step content', () => {
        const steps = [
            { content: [{ type: 'text' }] },
            { content: [approvalRequest('tc1', 'SELECT 1')] },
        ];
        expect(extractPendingSqlApprovals(steps)).toEqual([
            {
                approvalId: 'sql-approval:tc1',
                toolCallId: 'tc1',
                toolName: 'runSql',
                input: { sql: 'SELECT 1' },
            },
        ]);
    });

    it('returns empty when no approval request is present', () => {
        expect(
            extractPendingSqlApprovals([{ content: [{ type: 'tool-call' }] }]),
        ).toEqual([]);
        expect(extractPendingSqlApprovals([{ content: null }])).toEqual([]);
        expect(extractPendingSqlApprovals([])).toEqual([]);
    });
});
