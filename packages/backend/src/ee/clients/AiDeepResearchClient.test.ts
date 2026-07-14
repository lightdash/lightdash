import type Anthropic from '@anthropic-ai/sdk';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import type { EnvironmentCreateParams } from '@anthropic-ai/sdk/resources/beta/environments';
import type { BetaManagedAgentsSessionEvent } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    AiDeepResearchClient,
    type AiDeepResearchSessionConfig,
} from './AiDeepResearchClient';

type SessionEventInput<T> = T extends BetaManagedAgentsSessionEvent
    ? Omit<T, 'id' | 'processed_at'>
    : never;

const event = (
    value: SessionEventInput<BetaManagedAgentsSessionEvent>,
): BetaManagedAgentsSessionEvent =>
    ({
        id: crypto.randomUUID(),
        processed_at: new Date().toISOString(),
        ...value,
    }) as BetaManagedAgentsSessionEvent;

const asyncIterable = <T>(items: T[]): AsyncIterable<T> => ({
    async *[Symbol.asyncIterator]() {
        yield* items;
    },
});

const stream = (events: BetaManagedAgentsSessionEvent[]) => ({
    controller: new AbortController(),
    async *[Symbol.asyncIterator]() {
        yield* events;
    },
});

const endTurn = event({
    type: 'session.status_idle',
    stop_reason: { type: 'end_turn' },
});

const createAnthropicMock = (
    streams: BetaManagedAgentsSessionEvent[][] = [[endTurn]],
) => {
    type AgentResource = {
        id: string;
        version: number;
        metadata?: Record<string, string>;
    };
    type EnvironmentResource = {
        id: string;
        metadata?: Record<string, string>;
    };
    type SendPayload = { events: Array<{ type: string }> };
    type RequestOptions = {
        signal: AbortSignal;
        timeout?: number;
        maxRetries?: number;
    };

    const agentsList = vi.fn(
        (_params?: unknown, _options?: unknown): AsyncIterable<AgentResource> =>
            asyncIterable([]),
    );
    const agentsCreate = vi.fn(
        async (
            _params: AgentCreateParams,
            _options?: unknown,
        ): Promise<AgentResource> => ({
            id: 'agent-1',
            version: 7,
            metadata: {},
        }),
    );
    const environmentsList = vi.fn(
        (
            _params?: unknown,
            _options?: unknown,
        ): AsyncIterable<EnvironmentResource> => asyncIterable([]),
    );
    const environmentsCreate = vi.fn(
        async (
            _params: EnvironmentCreateParams,
            _options?: unknown,
        ): Promise<EnvironmentResource> => ({
            id: 'environment-1',
            metadata: {},
        }),
    );
    const vaultsCreate = vi.fn().mockResolvedValue({ id: 'vault-1' });
    const vaultsDelete = vi.fn().mockResolvedValue({
        id: 'vault-1',
        type: 'vault_deleted',
    });
    const credentialsCreate = vi.fn().mockResolvedValue({ id: 'credential-1' });
    const sessionsCreate = vi.fn().mockResolvedValue({ id: 'session-1' });
    const eventsSend = vi.fn(
        async (
            _sessionId: string,
            _payload: SendPayload,
            _options?: RequestOptions,
        ) => ({ data: [] }),
    );
    const eventsStream = vi.fn(
        (_sessionId: string, _params: unknown, _options: RequestOptions) =>
            Promise.resolve(stream(streams.shift() ?? [])),
    );
    const eventsList = vi.fn(
        (
            _sessionId: string,
            _params: unknown,
            _options: RequestOptions,
        ): AsyncIterable<BetaManagedAgentsSessionEvent> => asyncIterable([]),
    );

    const client = {
        beta: {
            agents: { list: agentsList, create: agentsCreate },
            environments: {
                list: environmentsList,
                create: environmentsCreate,
            },
            vaults: {
                create: vaultsCreate,
                delete: vaultsDelete,
                credentials: { create: credentialsCreate },
            },
            sessions: {
                create: sessionsCreate,
                events: {
                    send: eventsSend,
                    stream: eventsStream,
                    list: eventsList,
                },
            },
        },
    } as unknown as Anthropic;

    return {
        client,
        agentsList,
        agentsCreate,
        environmentsList,
        environmentsCreate,
        vaultsCreate,
        vaultsDelete,
        credentialsCreate,
        sessionsCreate,
        eventsSend,
        eventsStream,
        eventsList,
    };
};

const createConfig = (
    overrides: Partial<AiDeepResearchSessionConfig> = {},
): AiDeepResearchSessionConfig => ({
    agent: {
        name: 'Deep Research',
        model: 'claude-opus-4-6',
        system: 'Investigate the question.',
    },
    environment: {
        name: 'Deep Research',
        config: {
            type: 'cloud',
            networking: { type: 'limited', allow_mcp_servers: true },
        },
    },
    vault: { display_name: 'Deep Research run' },
    credentials: [
        {
            display_name: 'Lightdash PAT',
            auth: {
                type: 'static_bearer',
                mcp_server_url: 'https://lightdash.example/api/v1/mcp',
                token: 'secret-token',
            },
        },
    ],
    sessionTitle: 'Investigate revenue changes',
    prompt: 'Why did revenue change?',
    timeoutMs: 60_000,
    interruptTimeoutMs: 1_000,
    signal: new AbortController().signal,
    onSessionCreated: vi.fn().mockResolvedValue(undefined),
    onCustomToolUse: vi.fn().mockResolvedValue('tool result'),
    ...overrides,
});

const createClient = (anthropicClient: Anthropic) =>
    new AiDeepResearchClient({
        lightdashConfig: lightdashConfigMock,
        anthropicClient,
    });

describe('AiDeepResearchClient', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('persists the session ID before sending the prompt and only completes on end_turn', async () => {
        const anthropic = createAnthropicMock();
        const order: string[] = [];
        const config = createConfig({
            onSessionCreated: vi.fn(async () => {
                order.push('persisted');
            }),
        });
        anthropic.eventsSend.mockImplementation(async (_id, payload) => {
            const sentEvent = payload.events[0];
            if (sentEvent.type === 'user.message') {
                order.push('prompted');
            }
            return { data: [] };
        });
        anthropic.eventsStream.mockImplementation(async () => {
            order.push('streamed');
            return stream([endTurn]);
        });

        const result = await createClient(anthropic.client).runSession(config);

        expect(result).toEqual({
            status: 'completed',
            sessionId: 'session-1',
        });
        expect(order).toEqual(['persisted', 'streamed', 'prompted']);
        expect(anthropic.vaultsDelete).toHaveBeenCalledWith(
            'vault-1',
            {},
            expect.objectContaining({ maxRetries: 2 }),
        );
        expect(anthropic.sessionsCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                agent: { type: 'agent', id: 'agent-1', version: 7 },
                environment_id: 'environment-1',
                vault_ids: ['vault-1'],
                title: config.sessionTitle,
            }),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('reuses exact agent and environment configs but creates a fresh credential vault per run', async () => {
        const first = createAnthropicMock();
        const client = createClient(first.client);
        const firstConfig = createConfig();

        await client.runSession(firstConfig);
        const createdAgent = first.agentsCreate.mock.calls[0][0];
        const createdEnvironment = first.environmentsCreate.mock.calls[0][0];
        first.agentsList.mockImplementation(() =>
            asyncIterable([
                { id: 'agent-1', version: 7, metadata: createdAgent.metadata },
            ]),
        );
        first.environmentsList.mockImplementation(() =>
            asyncIterable([
                { id: 'environment-1', metadata: createdEnvironment.metadata },
            ]),
        );
        first.vaultsCreate
            .mockResolvedValueOnce({ id: 'vault-2' })
            .mockResolvedValueOnce({ id: 'vault-3' });
        first.eventsStream.mockImplementation(() =>
            Promise.resolve(stream([endTurn])),
        );

        await client.runSession(
            createConfig({
                credentials: [
                    {
                        display_name: 'Lightdash PAT',
                        auth: {
                            type: 'static_bearer',
                            mcp_server_url:
                                'https://lightdash.example/api/v1/mcp',
                            token: 'rotated-secret-token',
                        },
                    },
                ],
            }),
        );

        expect(first.agentsCreate).toHaveBeenCalledTimes(1);
        expect(first.environmentsCreate).toHaveBeenCalledTimes(1);
        expect(first.vaultsCreate).toHaveBeenCalledTimes(2);
        expect(first.credentialsCreate).toHaveBeenLastCalledWith(
            'vault-2',
            expect.objectContaining({
                auth: expect.objectContaining({
                    token: 'rotated-secret-token',
                }),
            }),
            expect.anything(),
        );
    });

    it('does not send a prompt when persisting the session ID fails', async () => {
        const anthropic = createAnthropicMock();
        const result = await createClient(anthropic.client).runSession(
            createConfig({
                onSessionCreated: vi
                    .fn()
                    .mockRejectedValue(new Error('database unavailable')),
            }),
        );

        expect(result).toMatchObject({
            status: 'failed',
            sessionId: 'session-1',
            reason: 'session_id_persistence_failed',
        });
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.anything(),
        );
        expect(anthropic.eventsSend).not.toHaveBeenCalledWith(
            'session-1',
            expect.objectContaining({
                events: [expect.objectContaining({ type: 'user.message' })],
            }),
            expect.anything(),
        );
    });

    it.each([
        {
            name: 'retry exhaustion on an idle event',
            terminalEvent: event({
                type: 'session.status_idle',
                stop_reason: { type: 'retries_exhausted' },
            }),
            reason: 'retries_exhausted',
        },
        {
            name: 'retry exhaustion on an error event',
            terminalEvent: event({
                type: 'session.error',
                error: {
                    type: 'model_overloaded_error',
                    message: 'overloaded',
                    retry_status: { type: 'exhausted' },
                },
            }),
            reason: 'retries_exhausted',
        },
        {
            name: 'a terminal Claude error',
            terminalEvent: event({
                type: 'session.error',
                error: {
                    type: 'model_request_failed_error',
                    message: 'model failed',
                    retry_status: { type: 'terminal' },
                },
            }),
            reason: 'claude_error',
        },
        {
            name: 'session termination',
            terminalEvent: event({ type: 'session.status_terminated' }),
            reason: 'terminated',
        },
    ])('fails deliberately for $name', async ({ terminalEvent, reason }) => {
        const anthropic = createAnthropicMock([[terminalEvent]]);

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result).toMatchObject({ status: 'failed', reason });
    });

    it('reports structural progress without exposing model or tool content', async () => {
        const progress = vi.fn().mockResolvedValue(undefined);
        const anthropic = createAnthropicMock([
            [
                event({
                    type: 'session.error',
                    error: {
                        type: 'model_overloaded_error',
                        message: 'sensitive provider details',
                        retry_status: { type: 'retrying' },
                    },
                }),
                event({ type: 'agent.thinking' }),
                event({
                    type: 'agent.tool_use',
                    name: 'web_search',
                    input: { query: 'sensitive query' },
                }),
                event({
                    type: 'span.model_request_end',
                    is_error: false,
                    model_request_start_id: 'request-1',
                    model_usage: {
                        input_tokens: 100,
                        output_tokens: 20,
                        cache_creation_input_tokens: 10,
                        cache_read_input_tokens: 30,
                    },
                }),
                endTurn,
            ],
        ]);

        await createClient(anthropic.client).runSession(
            createConfig({ onProgress: progress }),
        );

        expect(progress.mock.calls).toEqual([
            [{ type: 'retrying' }],
            [{ type: 'thinking' }],
            [{ type: 'tool_use', source: 'built_in', name: 'web_search' }],
            [
                {
                    type: 'model_usage',
                    inputTokens: 100,
                    outputTokens: 20,
                    cacheCreationInputTokens: 10,
                    cacheReadInputTokens: 30,
                },
            ],
        ]);
        expect(JSON.stringify(progress.mock.calls)).not.toContain('sensitive');
    });

    it('does not double-count progress recovered from persisted history', async () => {
        const progress = vi.fn().mockResolvedValue(undefined);
        const usage = event({
            type: 'span.model_request_end',
            is_error: false,
            model_request_start_id: 'request-1',
            model_usage: {
                input_tokens: 100,
                output_tokens: 20,
                cache_creation_input_tokens: 10,
                cache_read_input_tokens: 30,
            },
        });
        const anthropic = createAnthropicMock([[usage], [endTurn]]);
        anthropic.eventsList.mockImplementation(() => asyncIterable([usage]));

        await createClient(anthropic.client).runSession(
            createConfig({ onProgress: progress }),
        );

        expect(progress).toHaveBeenCalledOnce();
        expect(progress).toHaveBeenCalledWith({
            type: 'model_usage',
            inputTokens: 100,
            outputTokens: 20,
            cacheCreationInputTokens: 10,
            cacheReadInputTokens: 30,
        });
    });

    it('recovers a terminal event from persisted history after stream EOF', async () => {
        const anthropic = createAnthropicMock([[]]);
        anthropic.eventsList.mockImplementation(() => asyncIterable([endTurn]));

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result.status).toBe('completed');
        expect(anthropic.eventsList).toHaveBeenCalledOnce();
    });

    it('handles an unresolved persisted custom tool call after stream EOF', async () => {
        const persistedToolUse = event({
            type: 'agent.custom_tool_use',
            name: 'query_lightdash',
            input: { query: 'select 1' },
        });
        const anthropic = createAnthropicMock([[], [endTurn]]);
        anthropic.eventsList
            .mockImplementationOnce(() => asyncIterable([persistedToolUse]))
            .mockImplementationOnce(() => asyncIterable([]));
        const onCustomToolUse = vi.fn().mockResolvedValue('result');

        const result = await createClient(anthropic.client).runSession(
            createConfig({ onCustomToolUse }),
        );

        expect(result.status).toBe('completed');
        expect(onCustomToolUse).toHaveBeenCalledOnce();
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            expect.objectContaining({
                events: [
                    expect.objectContaining({
                        type: 'user.custom_tool_result',
                        custom_tool_use_id: persistedToolUse.id,
                    }),
                ],
            }),
            expect.anything(),
        );
    });

    it('fails after bounded reconnects when EOF has no terminal event', async () => {
        const anthropic = createAnthropicMock([[], [], [], []]);

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'unexpected_eof',
        });
        expect(anthropic.eventsStream).toHaveBeenCalledTimes(4);
        expect(anthropic.eventsList).toHaveBeenCalledTimes(4);
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.anything(),
        );
    });

    it('maps stream transport errors without reporting completion', async () => {
        const anthropic = createAnthropicMock();
        anthropic.eventsStream.mockRejectedValue(new Error('socket failed'));

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'transport_error',
        });
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.anything(),
        );
    });

    it('aborts the initial stream when sending the prompt fails', async () => {
        const anthropic = createAnthropicMock();
        const initialStream = stream([]);
        anthropic.eventsStream.mockResolvedValue(initialStream);
        anthropic.eventsSend.mockImplementation(async (_id, payload) => {
            if (payload.events[0].type === 'user.message') {
                throw new Error('prompt send failed');
            }
            return { data: [] };
        });

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'transport_error',
        });
        expect(initialStream.controller.signal.aborted).toBe(true);
    });

    it('reconciles history and reconnects after a transient stream failure', async () => {
        const anthropic = createAnthropicMock();
        anthropic.eventsStream
            .mockImplementationOnce(async () => ({
                controller: new AbortController(),
                async *[Symbol.asyncIterator]() {
                    throw new Error('stream disconnected');
                    yield endTurn;
                },
            }))
            .mockImplementationOnce(async () => stream([endTurn]));

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result.status).toBe('completed');
        expect(anthropic.eventsList).toHaveBeenCalledOnce();
        expect(anthropic.eventsStream).toHaveBeenCalledTimes(2);
    });

    it('bounds a stalled session ID persistence callback with the run timeout', async () => {
        vi.useFakeTimers();
        const anthropic = createAnthropicMock();
        const resultPromise = createClient(anthropic.client).runSession(
            createConfig({
                timeoutMs: 100,
                onSessionCreated: vi.fn(
                    async (_sessionId, signal): Promise<void> =>
                        new Promise<void>((_resolve, reject) => {
                            signal.addEventListener('abort', () =>
                                reject(signal.reason),
                            );
                        }),
                ),
            }),
        );

        await vi.advanceTimersByTimeAsync(100);
        const result = await resultPromise;

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'timed_out',
        });
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.anything(),
        );
    });

    it('surfaces credential vault cleanup failures', async () => {
        const anthropic = createAnthropicMock();
        anthropic.vaultsDelete.mockRejectedValue(new Error('delete failed'));

        const result = await createClient(anthropic.client).runSession(
            createConfig(),
        );

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'vault_cleanup_failed',
        });
    });

    it('cancels locally before any remote resources exist', async () => {
        const anthropic = createAnthropicMock();
        const controller = new AbortController();
        controller.abort();

        const result = await createClient(anthropic.client).runSession(
            createConfig({ signal: controller.signal }),
        );

        expect(result).toEqual({ status: 'cancelled', sessionId: null });
        expect(anthropic.agentsList).not.toHaveBeenCalled();
    });

    it('interrupts Claude before reporting an in-flight cancellation', async () => {
        const anthropic = createAnthropicMock([[]]);
        const controller = new AbortController();
        const config = createConfig({
            signal: controller.signal,
            onSessionCreated: vi.fn(async () => {
                controller.abort(new Error('cancel requested'));
            }),
        });

        const result = await createClient(anthropic.client).runSession(config);

        expect(result).toEqual({
            status: 'cancelled',
            sessionId: 'session-1',
        });
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.objectContaining({ maxRetries: 0, timeout: 1_000 }),
        );
    });

    it('fails cancellation when the remote interrupt is rejected', async () => {
        const anthropic = createAnthropicMock([[]]);
        const controller = new AbortController();
        anthropic.eventsSend.mockImplementation(async (_id, payload) => {
            if (payload.events[0].type === 'user.interrupt') {
                throw new Error('interrupt rejected');
            }
            return { data: [] };
        });
        const config = createConfig({
            signal: controller.signal,
            onSessionCreated: vi.fn(async () => {
                controller.abort();
            }),
        });

        const result = await createClient(anthropic.client).runSession(config);

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'interrupt_failed',
        });
    });

    it('fails cancellation when the bounded interrupt times out', async () => {
        vi.useFakeTimers();
        const anthropic = createAnthropicMock([[]]);
        const controller = new AbortController();
        anthropic.eventsSend.mockImplementation(
            async (_id, payload, options) => {
                if (payload.events[0].type === 'user.interrupt') {
                    return new Promise((_resolve, reject) => {
                        options?.signal.addEventListener('abort', () =>
                            reject(options.signal.reason),
                        );
                    });
                }
                return { data: [] };
            },
        );
        const resultPromise = createClient(anthropic.client).runSession(
            createConfig({
                signal: controller.signal,
                interruptTimeoutMs: 50,
                onSessionCreated: vi.fn(async () => {
                    controller.abort();
                }),
            }),
        );

        await vi.advanceTimersByTimeAsync(50);
        const result = await resultPromise;

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'interrupt_failed',
        });
    });

    it('interrupts Claude and reports a timeout as failure', async () => {
        vi.useFakeTimers();
        const anthropic = createAnthropicMock();
        anthropic.eventsStream.mockImplementation(
            async (_id, _params, options) => ({
                controller: new AbortController(),
                async *[Symbol.asyncIterator]() {
                    yield await new Promise<BetaManagedAgentsSessionEvent>(
                        (_resolve, reject) => {
                            options.signal.addEventListener('abort', () =>
                                reject(options.signal.reason),
                            );
                        },
                    );
                },
            }),
        );
        const resultPromise = createClient(anthropic.client).runSession(
            createConfig({ timeoutMs: 100 }),
        );

        await vi.advanceTimersByTimeAsync(100);
        const result = await resultPromise;

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'timed_out',
        });
        expect(anthropic.eventsSend).toHaveBeenCalledWith(
            'session-1',
            { events: [{ type: 'user.interrupt' }] },
            expect.anything(),
        );
    });

    it('passes cancellation into custom tools and suppresses their result', async () => {
        const toolUse = event({
            type: 'agent.custom_tool_use',
            name: 'query_lightdash',
            input: { query: 'select secret' },
        });
        const anthropic = createAnthropicMock([[toolUse]]);
        const controller = new AbortController();
        const onCustomToolUse = vi.fn(
            async ({ signal }: { signal: AbortSignal }) => {
                controller.abort();
                expect(signal.aborted).toBe(true);
                return 'must not be sent';
            },
        );

        const result = await createClient(anthropic.client).runSession(
            createConfig({ signal: controller.signal, onCustomToolUse }),
        );

        expect(result.status).toBe('cancelled');
        expect(onCustomToolUse).toHaveBeenCalledOnce();
        expect(anthropic.eventsSend).not.toHaveBeenCalledWith(
            'session-1',
            expect.objectContaining({
                events: [
                    expect.objectContaining({
                        type: 'user.custom_tool_result',
                    }),
                ],
            }),
            expect.anything(),
        );
    });

    it('does not send a conflicting second result when tool result delivery fails', async () => {
        const toolUse = event({
            type: 'agent.custom_tool_use',
            name: 'query_lightdash',
            input: { query: 'select 1' },
        });
        const anthropic = createAnthropicMock([[toolUse]]);
        anthropic.eventsList.mockImplementation(() => asyncIterable([toolUse]));
        const onCustomToolUse = vi.fn().mockResolvedValue('result');
        anthropic.eventsSend.mockImplementation(async (_id, payload) => {
            if (payload.events[0].type === 'user.custom_tool_result') {
                throw new Error('ambiguous transport failure');
            }
            return { data: [] };
        });

        const result = await createClient(anthropic.client).runSession(
            createConfig({ onCustomToolUse }),
        );

        expect(result).toMatchObject({
            status: 'failed',
            reason: 'transport_error',
        });
        const resultSends = anthropic.eventsSend.mock.calls.filter(
            ([, payload]) =>
                payload.events[0].type === 'user.custom_tool_result',
        );
        expect(resultSends.length).toBeGreaterThan(1);
        expect(
            new Set(resultSends.map(([, payload]) => JSON.stringify(payload)))
                .size,
        ).toBe(1);
        expect(onCustomToolUse).toHaveBeenCalledOnce();
    });
});
