import Anthropic from '@anthropic-ai/sdk';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents';
import type { LightdashConfig } from '../../config/parseConfig';
import {
    ManagedAgentClient,
    type ManagedAgentRunConfig,
    type ManagedAgentSessionConfig,
} from './ManagedAgentClient';

vi.mock('../../tracing/tracing', () => ({
    traceSpan: vi.fn(
        async (
            _config: unknown,
            callback: (span: {
                setAttributes: ReturnType<typeof vi.fn>;
            }) => Promise<unknown> | unknown,
        ) => callback({ setAttributes: vi.fn() }),
    ),
}));

const agentConfig: AgentCreateParams = {
    name: 'Test agent',
    model: 'claude-sonnet-4-5',
    system: 'Test system prompt',
};

const lightdashConfig = {
    siteUrl: 'https://lightdash.example.com',
    managedAgent: {
        anthropicApiKey: 'anthropic-key',
        sessionTimeoutMs: 10_000,
    },
} as unknown as LightdashConfig;

const createStream = (events: unknown[]) => {
    const controller = new AbortController();
    vi.spyOn(controller, 'abort');
    const stream = {
        controller,
        async *[Symbol.asyncIterator]() {
            for (const event of events) {
                yield event;
            }
        },
    };

    return { controller, stream };
};

const createPendingStream = () => {
    const controller = new AbortController();
    vi.spyOn(controller, 'abort');
    const stream = {
        controller,
        async *[Symbol.asyncIterator]() {
            yield await new Promise<never>(() => {});
        },
    };

    return { controller, stream };
};

const createAnthropicClient = (stream: unknown) => {
    const mocks = {
        agentCreate: vi.fn().mockResolvedValue({
            id: 'agent-1',
            version: 1,
        }),
        environmentList: vi.fn().mockResolvedValue({ data: [] }),
        environmentCreate: vi.fn().mockResolvedValue({ id: 'environment-1' }),
        vaultCreate: vi.fn().mockResolvedValue({ id: 'vault-1' }),
        credentialCreate: vi.fn().mockResolvedValue({}),
        sessionCreate: vi.fn().mockResolvedValue({ id: 'session-1' }),
        eventStream: vi.fn().mockResolvedValue(stream),
        eventSend: vi.fn().mockResolvedValue({}),
    };
    const client = {
        beta: {
            agents: {
                create: mocks.agentCreate,
                retrieve: vi.fn(),
                update: vi.fn(),
            },
            environments: {
                list: mocks.environmentList,
                create: mocks.environmentCreate,
            },
            vaults: {
                create: mocks.vaultCreate,
                credentials: { create: mocks.credentialCreate },
            },
            sessions: {
                create: mocks.sessionCreate,
                events: {
                    stream: mocks.eventStream,
                    send: mocks.eventSend,
                },
            },
        },
    } as unknown as Anthropic;

    return { client, mocks };
};

const createSessionConfig = (
    overrides: Partial<ManagedAgentSessionConfig> = {},
): ManagedAgentSessionConfig => ({
    agentConfig,
    serviceAccountPat: 'service-account-pat',
    resourceName: 'org:project',
    persistedAgentId: null,
    persistedAgentConfigHash: null,
    persistedAgentVersion: null,
    persistedEnvironmentId: null,
    persistedVaultId: null,
    onAgentSynced: vi.fn().mockResolvedValue(undefined),
    onResourcesCreated: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

const createRunConfig = (
    overrides: Partial<ManagedAgentRunConfig> = {},
): ManagedAgentRunConfig => ({
    projectName: 'Analytics',
    sessionTitle: 'Investigate Analytics',
    initialPrompt: 'Inspect the project',
    onCustomToolUse: vi.fn().mockResolvedValue('{"ok":true}'),
    ...overrides,
});

describe('ManagedAgentClient', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('syncs the supplied agent definition with resource metadata', async () => {
        const { stream } = createStream([]);
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });
        const sessionConfig = createSessionConfig();

        await expect(managedAgentClient.syncAgent(sessionConfig)).resolves.toBe(
            'agent-1',
        );
        expect(mocks.agentCreate).toHaveBeenCalledWith({
            ...agentConfig,
            name: 'Test agent (org:project)',
            metadata: { lightdash_resource: 'org:project' },
        });
        expect(sessionConfig.onAgentSynced).toHaveBeenCalledWith(
            'agent-1',
            expect.any(String),
            1,
        );
    });

    it('runs a configured session and emits safe progress events', async () => {
        const events = [
            {
                type: 'agent.message',
                content: [{ type: 'text', text: 'Working' }],
            },
            { type: 'agent.tool_use', name: 'read' },
            { type: 'agent.mcp_tool_use', name: 'query' },
            {
                type: 'agent.custom_tool_use',
                id: 'tool-use-1',
                name: 'inspect',
                input: { target: 'chart' },
            },
            {
                type: 'session.status_idle',
                stop_reason: { type: 'end_turn' },
            },
        ];
        const { stream } = createStream(events);
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });
        const onProgress = vi.fn();
        const onCustomToolUse = vi.fn().mockResolvedValue('{"ok":true}');
        const onSessionCreated = vi.fn();

        await expect(
            managedAgentClient.runSession(
                createSessionConfig(),
                createRunConfig({
                    onProgress,
                    onCustomToolUse,
                    onSessionCreated,
                }),
            ),
        ).resolves.toEqual({
            status: 'completed',
            sessionId: 'session-1',
        });

        expect(mocks.sessionCreate).toHaveBeenCalledWith({
            agent: 'agent-1',
            environment_id: 'environment-1',
            vault_ids: ['vault-1'],
            title: 'Investigate Analytics',
        });
        expect(mocks.eventSend).toHaveBeenNthCalledWith(1, 'session-1', {
            events: [
                {
                    type: 'user.message',
                    content: [{ type: 'text', text: 'Inspect the project' }],
                },
            ],
        });
        expect(mocks.eventSend).toHaveBeenNthCalledWith(2, 'session-1', {
            events: [
                {
                    type: 'user.custom_tool_result',
                    custom_tool_use_id: 'tool-use-1',
                    content: [{ type: 'text', text: '{"ok":true}' }],
                },
            ],
        });
        expect(onCustomToolUse).toHaveBeenCalledWith('inspect', {
            target: 'chart',
        });
        expect(onSessionCreated).toHaveBeenCalledWith('session-1');
        expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
            { type: 'message' },
            { type: 'tool_use', source: 'builtin', toolName: 'read' },
            { type: 'tool_use', source: 'mcp', toolName: 'query' },
            { type: 'tool_use', source: 'custom', toolName: 'inspect' },
            { type: 'idle', stopReason: 'end_turn' },
        ]);
    });

    it('returns the session ID and aborts the stream on timeout', async () => {
        vi.useFakeTimers();
        const { controller, stream } = createPendingStream();
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });

        const result = managedAgentClient.runSession(
            createSessionConfig(),
            createRunConfig({ timeoutMs: 100 }),
        );
        await vi.advanceTimersByTimeAsync(100);

        await expect(result).resolves.toEqual({
            status: 'timed_out',
            sessionId: 'session-1',
            error: '[ManagedAgent] Session timed out after 100ms',
        });
        expect(controller.abort).toHaveBeenCalledOnce();
        expect(mocks.eventSend).toHaveBeenNthCalledWith(2, 'session-1', {
            events: [{ type: 'user.interrupt' }],
        });
    });

    it('does not create resources when the caller already cancelled', async () => {
        const { stream } = createStream([]);
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });
        const abortController = new AbortController();
        abortController.abort(new Error('Cancelled before start'));

        await expect(
            managedAgentClient.runSession(
                createSessionConfig(),
                createRunConfig({ abortSignal: abortController.signal }),
            ),
        ).rejects.toThrow('Cancelled before start');
        expect(mocks.agentCreate).not.toHaveBeenCalled();
        expect(mocks.sessionCreate).not.toHaveBeenCalled();
        expect(mocks.eventSend).not.toHaveBeenCalled();
    });

    it('waits for session persistence before starting the stream', async () => {
        const { stream } = createStream([]);
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });

        await expect(
            managedAgentClient.runSession(
                createSessionConfig(),
                createRunConfig({
                    onSessionCreated: vi
                        .fn()
                        .mockRejectedValue(new Error('Persistence failed')),
                }),
            ),
        ).rejects.toThrow('Persistence failed');
        expect(mocks.eventStream).not.toHaveBeenCalled();
        expect(mocks.eventSend).not.toHaveBeenCalled();
    });

    it('continues when progress persistence fails', async () => {
        const { stream } = createStream([
            { type: 'agent.tool_use', name: 'read' },
            {
                type: 'session.status_idle',
                stop_reason: { type: 'end_turn' },
            },
        ]);
        const { client } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });

        await expect(
            managedAgentClient.runSession(
                createSessionConfig(),
                createRunConfig({
                    onProgress: vi
                        .fn()
                        .mockRejectedValue(new Error('Progress failed')),
                }),
            ),
        ).resolves.toEqual({
            status: 'completed',
            sessionId: 'session-1',
        });
    });

    it('returns custom tool failures to the managed session', async () => {
        const { stream } = createStream([
            {
                type: 'agent.custom_tool_use',
                id: 'tool-use-1',
                name: 'inspect',
                input: {},
            },
            {
                type: 'session.status_idle',
                stop_reason: { type: 'end_turn' },
            },
        ]);
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });

        await expect(
            managedAgentClient.runSession(
                createSessionConfig(),
                createRunConfig({
                    onCustomToolUse: vi
                        .fn()
                        .mockRejectedValue(new Error('Tool failed')),
                }),
            ),
        ).resolves.toEqual({
            status: 'completed',
            sessionId: 'session-1',
        });

        expect(mocks.eventSend).toHaveBeenNthCalledWith(2, 'session-1', {
            events: [
                {
                    type: 'user.custom_tool_result',
                    custom_tool_use_id: 'tool-use-1',
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({ error: 'Tool failed' }),
                        },
                    ],
                    is_error: true,
                },
            ],
        });
    });

    it('interrupts the session when the caller cancels', async () => {
        const { controller: streamController, stream } = createPendingStream();
        const { client, mocks } = createAnthropicClient(stream);
        const managedAgentClient = new ManagedAgentClient({
            lightdashConfig,
            anthropicClient: client,
        });
        const abortController = new AbortController();
        const result = managedAgentClient.runSession(
            createSessionConfig(),
            createRunConfig({ abortSignal: abortController.signal }),
        );
        await vi.waitFor(() => expect(mocks.eventStream).toHaveBeenCalled());

        abortController.abort(new Error('Cancelled'));

        await expect(result).resolves.toEqual({
            status: 'cancelled',
            sessionId: 'session-1',
            error: 'Cancelled',
        });
        expect(streamController.abort).toHaveBeenCalledOnce();
        expect(mocks.eventSend).toHaveBeenNthCalledWith(2, 'session-1', {
            events: [{ type: 'user.interrupt' }],
        });
    });
});
