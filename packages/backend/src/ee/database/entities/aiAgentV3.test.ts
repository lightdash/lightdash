import { UnexpectedServerError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAiToolApprovalPayload } from './aiAgentV3';

describe('getAiToolApprovalPayload', () => {
    it('returns null when approval is absent', () => {
        expect(getAiToolApprovalPayload({})).toBeNull();
    });

    it('normalizes omitted optional approval fields', () => {
        expect(
            getAiToolApprovalPayload({ approval: { id: 'approval-1' } }),
        ).toEqual({
            id: 'approval-1',
            signature: null,
            approved: null,
            reason: null,
            decidedByUserUuid: null,
            decidedAt: null,
        });
    });

    it('rejects malformed persisted approval fields', () => {
        expect(() =>
            getAiToolApprovalPayload({
                approval: { id: 'approval-1', approved: 'true' },
            }),
        ).toThrow(UnexpectedServerError);
        expect(() =>
            getAiToolApprovalPayload({ approval: { id: 42 } }),
        ).toThrow(UnexpectedServerError);
    });
});
