import { ForbiddenError } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { AsyncQueryService } from './AsyncQueryService';

const binding = {
    agentUuid: 'agent-uuid',
    promptUuid: 'message-uuid',
    nodeId: 'net',
};

const readResults = (recordedBinding: typeof binding | undefined) => {
    const service = {
        queryHistoryModel: {
            get: vi.fn().mockResolvedValue({
                requestParameters: { resultMessageQuery: recordedBinding },
            }),
        },
        getAsyncQueryResults: vi.fn().mockResolvedValue('rows'),
    };
    return AsyncQueryService.prototype.getMessageQueryBoundQueryResults.call(
        service as never,
        { queryUuid: 'run', projectUuid: 'project', account: {} } as never,
        binding,
    );
};

describe('getMessageQueryBoundQueryResults', () => {
    it('reads results bound to the same message and cited node', async () => {
        await expect(readResults(binding)).resolves.toBe('rows');
    });

    it.each([
        ['another cited node', { ...binding, nodeId: 'other' }],
        ['another message', { ...binding, promptUuid: 'other' }],
        ['another agent', { ...binding, agentUuid: 'other' }],
        ['no binding', undefined],
    ])('refuses results bound to %s', async (_name, recordedBinding) => {
        await expect(readResults(recordedBinding)).rejects.toThrow(
            ForbiddenError,
        );
    });
});
