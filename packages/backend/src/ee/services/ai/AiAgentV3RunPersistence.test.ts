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

it('classifies completion from abort state when it is enqueued', async () => {
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
        expect.objectContaining({ status: 'completed', error: null }),
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
