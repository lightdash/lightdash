import {
    compileGenerativeUiSpec,
    type GenerativeUiCompiledSpec,
    type GenerativeUiSpec,
} from '@lightdash/common';
import {
    deleteWithConfirmSpecMock,
    forEachChainSpecMock,
    GENERATIVE_UI_PROJECT_UUID_MOCK,
    generativeUiOperationsByIdMock,
} from '@lightdash/common/src/ee/AiAgent/generativeUi/generativeUiSpec.mock';
import { describe, expect, it, vi } from 'vitest';
import { type GenerativeUiRequest } from './requests';
import { runGenerativeUiAction } from './runGenerativeUiAction';

const PROJECT = GENERATIVE_UI_PROJECT_UUID_MOCK;

const compile = (spec: GenerativeUiSpec): GenerativeUiCompiledSpec => {
    const result = compileGenerativeUiSpec(spec, {
        operations: generativeUiOperationsByIdMock,
        projectUuid: PROJECT,
    });
    if (!result.ok) throw new Error(result.problems.join('\n'));
    return result.compiled;
};

const moveBody = (chartUuid: string) =>
    JSON.stringify({
        action: { type: 'move', targetSpaceUuid: 'space-new' },
        item: { contentType: 'chart', source: 'dbt_explore', uuid: chartUuid },
    });

const forbidden = {
    status: 'error',
    error: {
        name: 'ForbiddenError',
        statusCode: 403,
        message: "You don't have access to this chart",
        data: {},
    },
};

describe('runGenerativeUiAction', () => {
    it('runs steps in order, feeding $result into later steps and $item into each forEach request', async () => {
        const fetcher = vi.fn(async (request: GenerativeUiRequest) =>
            request.url.endsWith('/spaces') ? { uuid: 'space-new' } : null,
        );
        const onProgress = vi.fn();
        const state = { spaceName: 'Finance', chartUuids: ['c-1', 'c-2'] };

        const submission = await runGenerativeUiAction({
            compiled: compile(forEachChainSpecMock),
            state,
            queries: new Map(),
            fetcher,
            onProgress,
        });

        expect(fetcher.mock.calls.map(([request]) => request)).toEqual([
            {
                method: 'POST',
                version: 'v1',
                url: `/projects/${PROJECT}/spaces`,
                body: JSON.stringify({ name: 'Finance' }),
            },
            {
                method: 'POST',
                version: 'v2',
                url: `/content/${PROJECT}/move`,
                body: moveBody('c-1'),
            },
            {
                method: 'POST',
                version: 'v2',
                url: `/content/${PROJECT}/move`,
                body: moveBody('c-2'),
            },
        ]);
        expect(submission).toEqual({
            status: 'success',
            state,
            responses: {
                createSpace: [{ uuid: 'space-new' }],
                move: [null, null],
            },
        });
        expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
            { stepIndex: 0, stepCount: 2, itemIndex: null, itemCount: null },
            { stepIndex: 1, stepCount: 2, itemIndex: 0, itemCount: 2 },
            { stepIndex: 1, stepCount: 2, itemIndex: 1, itemCount: 2 },
        ]);
    });

    it('stops at the first failure and keeps what already ran', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce({ uuid: 'space-new' })
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(forbidden);
        const state = {
            spaceName: 'Finance',
            chartUuids: ['c-1', 'c-2', 'c-3'],
        };

        const submission = await runGenerativeUiAction({
            compiled: compile(forEachChainSpecMock),
            state,
            queries: new Map(),
            fetcher,
            onProgress: vi.fn(),
        });

        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(submission).toEqual({
            status: 'failed',
            state,
            responses: { createSpace: [{ uuid: 'space-new' }], move: [null] },
            failure: {
                stepId: 'move',
                itemIndex: 1,
                error: {
                    statusCode: 403,
                    name: 'ForbiddenError',
                    message: "You don't have access to this chart",
                },
            },
        });
    });

    it('fails a step without sending it when a binding has no value', async () => {
        const fetcher = vi.fn();

        const submission = await runGenerativeUiAction({
            compiled: compile(deleteWithConfirmSpecMock),
            state: { spaceUuid: null },
            queries: new Map(),
            fetcher,
            onProgress: vi.fn(),
        });

        expect(fetcher).not.toHaveBeenCalled();
        expect(submission).toEqual({
            status: 'failed',
            state: { spaceUuid: null },
            responses: { deleteSpace: [] },
            failure: {
                stepId: 'deleteSpace',
                itemIndex: null,
                error: {
                    statusCode: 0,
                    name: 'BindingError',
                    message: 'Path parameter "spaceUuid" has no value',
                },
            },
        });
    });

    it('fails a forEach step whose source is not an array', async () => {
        const submission = await runGenerativeUiAction({
            compiled: compile(forEachChainSpecMock),
            state: { spaceName: 'Finance', chartUuids: 'c-1' },
            queries: new Map(),
            fetcher: vi.fn().mockResolvedValue({ uuid: 'space-new' }),
            onProgress: vi.fn(),
        });

        expect(submission.status === 'failed' && submission.failure).toEqual({
            stepId: 'move',
            itemIndex: null,
            error: {
                statusCode: 0,
                name: 'BindingError',
                message: 'forEach did not resolve to an array',
            },
        });
    });

    it('reports errors that are not API errors', async () => {
        const submission = await runGenerativeUiAction({
            compiled: compile(deleteWithConfirmSpecMock),
            state: { spaceUuid: 'space-1' },
            queries: new Map(),
            fetcher: vi.fn().mockRejectedValue(new Error('Network down')),
            onProgress: vi.fn(),
        });

        expect(submission.status === 'failed' && submission.failure).toEqual({
            stepId: 'deleteSpace',
            itemIndex: null,
            error: { statusCode: 0, name: 'Error', message: 'Network down' },
        });
    });
});
