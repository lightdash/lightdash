import { ConflictError } from '@lightdash/common';
import { APICallError } from 'ai';
import { expect, it, vi } from 'vitest';
import {
    AiAgentV3RunPersistence,
    getAiRunErrorEnvelope,
} from './AiAgentV3RunPersistence';

const buildModel = () => {
    const parts: Array<{ uuid: string; payload: Record<string, unknown> }> = [];
    return {
        parts,
        appendParts: vi.fn(async ({ parts: writes }) =>
            writes.map((write: { payload: Record<string, unknown> }) => {
                const part = {
                    uuid: `part-${parts.length}`,
                    payload: write.payload,
                };
                parts.push(part);
                return part;
            }),
        ),
        updatePart: vi.fn(async ({ partUuid, payload }) => {
            const part = parts.find(({ uuid }) => uuid === partUuid)!;
            part.payload = payload;
            return { ...part, payloadVersion: 1 };
        }),
        finishAssistantMessage: vi.fn(async () => undefined),
        refreshAssistantMessageHeartbeat: vi.fn(async () => true),
        suspendAssistantMessage: vi.fn(async () => undefined),
    };
};

it('persists interleaved text, reasoning, and tool chunks in first-seen order', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    const firstChunkAck = persistence.waitForUiChunk({
        type: 'text-delta',
        id: 't1',
        delta: 'Hello ',
    });
    await persistence.onChunk({ type: 'text-delta', id: 't1', text: 'Hello ' });
    await expect(firstChunkAck).resolves.toBe(true);
    await persistence.onChunk({
        type: 'reasoning-delta',
        id: 'r1',
        text: 'think',
    });
    await persistence.onChunk({ type: 'text-delta', id: 't1', text: 'world' });
    await persistence.onChunk({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'findExplores',
        input: { query: 'orders' },
    });
    await persistence.onChunk({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'findExplores',
        output: ['orders'],
    });

    expect(model.parts.map(({ payload }) => payload)).toEqual([
        { text: 'Hello world' },
        { text: 'think' },
        {
            state: 'output-available',
            toolName: 'findExplores',
            input: { query: 'orders' },
            output: ['orders'],
        },
    ]);
});

it('does not copy durable approval metadata back into a tool part', async () => {
    const model = buildModel();
    const payload = {
        state: 'approval-responded',
        toolName: 'runSql',
        input: { sql: 'SELECT 1' },
        approval: {
            id: 'approval-1',
            signature: 'signature',
            approved: true,
            reason: 'Approved for this query',
            decidedByUserUuid: 'user-1',
            decidedAt: '2026-08-06T00:00:00.000Z',
        },
    };
    model.parts.push({ uuid: 'part-0', payload });
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
        undefined,
        undefined,
        [
            {
                uuid: 'part-0',
                type: 'tool',
                payloadVersion: 1,
                payload,
                toolCallId: 'call-1',
                artifactVersionUuid: null,
            },
        ],
    );

    await persistence.onChunk({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'runSql',
        output: [{ value: 1 }],
    });

    expect(model.parts[0]?.payload).toEqual({
        state: 'output-available',
        toolName: 'runSql',
        input: { sql: 'SELECT 1' },
        output: [{ value: 1 }],
        approval: {
            id: 'approval-1',
            signature: 'signature',
            approved: true,
        },
    });
});

it('freezes cancellation after queued partial content', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => true,
    );
    persistence.recordUsage({
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        reasoningTokens: 1,
        cachedInputTokens: 3,
        inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: 1,
        },
    });

    const partial = persistence.onChunk({
        type: 'text-delta',
        id: 't1',
        text: 'partial',
    });
    const canceled = persistence.cancel();
    await Promise.all([partial, canceled]);

    expect(model.parts).toHaveLength(1);
    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            status: 'canceled',
            error: null,
            tokenUsage: expect.objectContaining({ totalTokens: 14 }),
        }),
    );
});

it('keeps accumulated resume usage when finish usage is absent', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
        undefined,
        undefined,
        [],
        {
            version: 1,
            inputTokens: 10,
            outputTokens: 4,
            totalTokens: 14,
            reasoningTokens: 1,
            cachedInputTokens: 3,
        },
    );
    persistence.recordUsage({
        inputTokens: 2,
        outputTokens: 1,
        totalTokens: 3,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
        },
        outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: 0,
        },
    });
    await persistence.onChunk({ type: 'text-delta', id: 't1', text: 'done' });

    await persistence.complete();

    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            tokenUsage: expect.objectContaining({ totalTokens: 17 }),
        }),
    );
});

it('refreshes heartbeats until the run freezes', async () => {
    vi.useFakeTimers();
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );
    persistence.startHeartbeat(1_000);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(model.refreshAssistantMessageHeartbeat).toHaveBeenCalledTimes(2);
    await persistence.cancel();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(model.refreshAssistantMessageHeartbeat).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
});

it('can persist a terminal error after a failed chunk write', async () => {
    const model = buildModel();
    model.appendParts.mockRejectedValueOnce(new Error('write failed'));
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    await expect(
        persistence.onChunk({
            type: 'text-delta',
            id: 't1',
            text: 'partial',
        }),
    ).rejects.toThrow('write failed');
    await persistence.fail(new Error('stream failed'), 'Stream failed');

    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
    );
});

it('classifies failure from abort state when it is enqueued', async () => {
    const model = buildModel();
    let canceled = false;
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => canceled,
    );

    const failed = persistence.fail(
        new Error('server restarting'),
        'Server restarting',
    );
    canceled = true;
    await failed;

    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
            status: 'error',
            error: expect.objectContaining({
                name: 'stream_error',
                message: 'Server restarting',
            }),
        }),
    );
});

it('classifies completion from abort state when it executes', async () => {
    const model = buildModel();
    let canceled = false;
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => canceled,
    );
    await persistence.onChunk({
        type: 'text-delta',
        id: 't1',
        text: 'complete',
    });

    const completed = persistence.complete();
    canceled = true;
    await completed;

    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'canceled', error: null }),
    );
});

it('stops cleanly when another server freezes the message', async () => {
    const model = buildModel();
    model.appendParts.mockRejectedValueOnce(
        new ConflictError('Assistant message is frozen'),
    );
    const onTerminal = vi.fn();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
        onTerminal,
    );

    const chunkAck = persistence.waitForUiChunk({
        type: 'text-delta',
        id: 't1',
        delta: 'late chunk',
    });
    await persistence.onChunk({
        type: 'text-delta',
        id: 't1',
        text: 'late chunk',
    });
    await expect(chunkAck).resolves.toBe(false);
    await persistence.fail(new Error('aborted'), 'Aborted');

    expect(onTerminal).toHaveBeenCalledOnce();
    expect(model.finishAssistantMessage).not.toHaveBeenCalled();
});

it('aborts local generation when another server freezes the message', async () => {
    const model = buildModel();
    model.appendParts.mockRejectedValueOnce(
        new ConflictError('Assistant message is frozen'),
    );
    const onFrozen = vi.fn();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
        undefined,
        onFrozen,
    );

    await persistence.onChunk({
        type: 'text-delta',
        id: 't1',
        text: 'late chunk',
    });

    expect(onFrozen).toHaveBeenCalledOnce();
});

it('drops unmatched UI chunks instead of hanging the stream', async () => {
    vi.useFakeTimers();
    const persistence = new AiAgentV3RunPersistence(
        buildModel() as never,
        'assistant',
        () => false,
    );

    const result = persistence.waitForUiChunk({
        type: 'text-delta',
        id: 't1',
        delta: 'unmatched',
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe(false);
    vi.useRealTimers();
});

it('uses stable error names', () => {
    expect(
        getAiRunErrorEnvelope(
            new APICallError({
                message: 'provider failed',
                url: 'https://example.com',
                requestBodyValues: {},
                statusCode: 500,
                responseHeaders: {},
                responseBody: 'failed',
                isRetryable: false,
            }),
            'Provider failed',
        ).name,
    ).toBe('provider_error');
    expect(
        getAiRunErrorEnvelope(
            new Error('maximum context window exceeded'),
            'Too long',
        ).name,
    ).toBe('context_overflow');
});

it('persists an approval request and suspends without freezing it', async () => {
    const model = buildModel();
    const onTerminal = vi.fn();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
        onTerminal,
    );

    await persistence.onChunk({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'runSql',
        input: { sql: 'SELECT 1' },
    });
    await persistence.onUiChunk({
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        signature: 'signed-request',
        toolCallId: 'call-1',
    });
    expect(persistence.hasPendingApproval()).toBe(true);
    await persistence.complete();

    expect(model.parts).toEqual([
        {
            uuid: 'part-0',
            payload: {
                state: 'approval-requested',
                toolName: 'runSql',
                input: { sql: 'SELECT 1' },
                approval: {
                    id: 'approval-1',
                    signature: 'signed-request',
                },
            },
        },
    ]);
    expect(model.finishAssistantMessage).not.toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(model.suspendAssistantMessage).toHaveBeenCalledWith(
        'assistant',
        null,
    );
});

it('cancels instead of suspending a pending approval after an interrupt', async () => {
    const model = buildModel();
    let canceled = false;
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => canceled,
    );

    await persistence.onChunk({
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        signature: null,
        toolCall: {
            toolCallId: 'call-1',
            toolName: 'runSql',
            input: { sql: 'SELECT 1' },
        },
    });
    const completed = persistence.complete();
    canceled = true;
    await completed;

    expect(model.suspendAssistantMessage).not.toHaveBeenCalled();
    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'canceled', error: null }),
    );
});

it('cancels when interrupted while the pending approval is suspending', async () => {
    const model = buildModel();
    let canceled = false;
    model.suspendAssistantMessage.mockImplementationOnce(async () => {
        canceled = true;
    });
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => canceled,
    );

    await persistence.onChunk({
        type: 'tool-approval-request',
        approvalId: 'approval-1',
        signature: null,
        toolCall: {
            toolCallId: 'call-1',
            toolName: 'runSql',
            input: { sql: 'SELECT 1' },
        },
    });
    await persistence.complete();

    expect(model.suspendAssistantMessage).toHaveBeenCalledOnce();
    expect(model.finishAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'canceled', error: null }),
    );
});

it('ignores malformed UI persistence chunks', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    await persistence.onUiChunk({
        type: 'tool-approval-request',
        approvalId: 42,
        toolCallId: 'call-1',
    });

    expect(model.appendParts).not.toHaveBeenCalled();
    expect(model.updatePart).not.toHaveBeenCalled();
});

it('persists tool execution errors as structured model-visible output', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    await persistence.onChunk({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'findExplores',
        input: { query: 'orders' },
    });
    await persistence.onUiChunk({
        type: 'tool-output-error',
        toolCallId: 'call-1',
        errorText: 'Warehouse unavailable',
        providerMetadata: {
            anthropic: { opaque: { nested: ['value'] } },
        },
    });

    expect(model.parts[0]?.payload).toEqual({
        state: 'output-error',
        toolName: 'findExplores',
        input: { query: 'orders' },
        error: {
            name: 'tool_error',
            message: 'Warehouse unavailable',
            data: null,
        },
        resultProviderMetadata: {
            anthropic: { opaque: { nested: ['value'] } },
        },
    });
});

it('persists error-status tool results as model-visible errors', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    await persistence.onChunk({
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'runSql',
        output: {
            result: 'relation "missing" does not exist',
            metadata: { status: 'error' },
        },
    });

    expect(model.parts[0]?.payload).toEqual({
        state: 'output-error',
        toolName: 'runSql',
        output: {
            result: 'relation "missing" does not exist',
            metadata: { status: 'error' },
        },
        error: {
            name: 'tool_error',
            message: 'relation "missing" does not exist',
            data: null,
        },
    });
});

it('preserves reasoning provider metadata losslessly across deltas', async () => {
    const model = buildModel();
    const persistence = new AiAgentV3RunPersistence(
        model as never,
        'assistant',
        () => false,
    );

    await persistence.onUiChunk({
        type: 'reasoning-start',
        id: 'reasoning-1',
        providerMetadata: {
            anthropic: {
                signature: 'signature',
                encryptedContent: { bytes: [0, 255], empty: null },
            },
        },
    });
    await persistence.onChunk({
        type: 'reasoning-delta',
        id: 'reasoning-1',
        text: 'visible',
    });
    await persistence.onUiChunk({
        type: 'reasoning-end',
        id: 'reasoning-1',
        providerMetadata: {
            openai: { itemId: 'reasoning-item' },
        },
    });

    expect(model.parts[0]?.payload).toEqual({
        text: 'visible',
        providerMetadata: {
            openai: { itemId: 'reasoning-item' },
        },
    });
});
