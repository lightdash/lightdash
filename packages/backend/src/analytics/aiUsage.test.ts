import Logger from '../logging/logger';
import {
    AiUsageEvent,
    embeddingModelUsageToTokens,
    emitAiUsage,
    getAiUsageChannel,
    languageModelUsageToTokens,
    registerAiUsageLedger,
    registerAiUsageTracker,
} from './aiUsage';

vi.mock('../logging/logger', () => ({
    __esModule: true,
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('languageModelUsageToTokens', () => {
    it('maps AI SDK usage to token classes, keeping input inclusive of cache', () => {
        expect(
            languageModelUsageToTokens({
                inputTokens: 1000,
                inputTokenDetails: {
                    noCacheTokens: 150,
                    cacheReadTokens: 800,
                    cacheWriteTokens: 50,
                },
                outputTokens: 200,
                outputTokenDetails: {
                    textTokens: 170,
                    reasoningTokens: 30,
                },
                totalTokens: 1200,
            }),
        ).toEqual({
            // The value includes the cache tokens (150 uncached + 800 read +
            // 50 write). It is not the uncached part. The warehouse subtracts
            // the cache tokens.
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 800,
            cacheWriteTokens: 50,
            reasoningTokens: 30,
            totalTokens: 1200,
        });
    });

    it('passes the inclusive input through regardless of which cache classes are reported', () => {
        expect(
            languageModelUsageToTokens({
                inputTokens: 1_000,
                inputTokenDetails: {
                    noCacheTokens: undefined,
                    cacheReadTokens: 800,
                    cacheWriteTokens: 50,
                },
                outputTokens: 200,
                outputTokenDetails: {
                    textTokens: 170,
                    reasoningTokens: 30,
                },
                totalTokens: 1_200,
            }).inputTokens,
        ).toBe(1_000);

        expect(
            languageModelUsageToTokens({
                inputTokens: 1_000,
                inputTokenDetails: {
                    noCacheTokens: undefined,
                    cacheReadTokens: 800,
                    cacheWriteTokens: undefined,
                },
                outputTokens: 200,
                outputTokenDetails: {
                    textTokens: 170,
                    reasoningTokens: 30,
                },
                totalTokens: 1_200,
            }).inputTokens,
        ).toBe(1_000);
    });

    it('maps unreported token classes to null', () => {
        expect(
            languageModelUsageToTokens({
                inputTokens: undefined,
                inputTokenDetails: {
                    noCacheTokens: undefined,
                    cacheReadTokens: undefined,
                    cacheWriteTokens: undefined,
                },
                outputTokens: undefined,
                outputTokenDetails: {
                    textTokens: undefined,
                    reasoningTokens: undefined,
                },
                totalTokens: undefined,
            }),
        ).toEqual({
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            reasoningTokens: null,
            totalTokens: null,
        });
    });
});

describe('embeddingModelUsageToTokens', () => {
    it('maps embedding tokens to input and total', () => {
        expect(embeddingModelUsageToTokens({ tokens: 42 })).toEqual({
            inputTokens: 42,
            outputTokens: null,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            reasoningTokens: null,
            totalTokens: 42,
        });
    });
});

describe('emitAiUsage', () => {
    const tokens = {
        inputTokens: 1000,
        outputTokens: 200,
        cacheReadTokens: 800,
        cacheWriteTokens: 50,
        reasoningTokens: 30,
        totalTokens: 1200,
    };

    afterEach(() => {
        vi.clearAllMocks();
        registerAiUsageTracker(() => {});
        registerAiUsageLedger(async () => {});
    });

    const emitAgentCall = (outcome?: 'complete' | 'failed') =>
        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    userUuid: 'user-1',
                },
            },
            tokens,
            outcome === undefined ? undefined : { outcome },
        );

    it('stamps each call with one id that the ledger and the analytics event share', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        const ledger = vi.fn<(event: AiUsageEvent) => Promise<void>>(
            async () => {},
        );
        registerAiUsageTracker(track);
        registerAiUsageLedger(ledger);

        emitAgentCall();
        emitAgentCall();

        const ledgerIds = ledger.mock.calls.map(
            ([event]) => event.properties.eventId,
        );
        const trackedIds = track.mock.calls.map(
            ([event]) => event.properties.eventId,
        );
        expect(ledgerIds).toEqual(trackedIds);
        expect(new Set(ledgerIds).size).toBe(2);
    });

    it('records the outcome the caller reports, defaulting to complete', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAgentCall();
        emitAgentCall('failed');

        expect(track.mock.calls[0][0].properties.outcome).toBe('complete');
        expect(track.mock.calls[1][0].properties.outcome).toBe('failed');
    });

    it('keeps a failing ledger write out of the AI path', async () => {
        registerAiUsageLedger(async () => {
            throw new Error('connection reset');
        });

        expect(() => emitAgentCall()).not.toThrow();
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
        expect(Logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('connection reset'),
        );
    });

    it('emits a structured log line and a tracked event', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                    agentUuid: 'agent-1',
                    threadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                    userUuid: 'user-1',
                    model: 'claude-sonnet-5',
                    provider: 'anthropic',
                },
            },
            tokens,
        );

        const expectedProperties = {
            eventId: expect.any(String),
            outcome: 'complete',
            feature: 'agent',
            functionId: 'generateAgentResponse',
            organizationId: 'org-1',
            projectId: 'project-1',
            aiAgentId: 'agent-1',
            threadId: 'thread-1',
            promptId: 'prompt-1',
            dataAppId: null,
            model: 'claude-sonnet-5',
            provider: 'anthropic',
            keyManagement: null,
            channel: null,
            externalUserId: null,
            managedAgentRunId: null,
            deepResearchRunId: null,
            deepResearchPhase: null,
            ...tokens,
        };
        const { externalUserId, ...loggedProperties } = expectedProperties;

        expect(Logger.info).toHaveBeenCalledWith(
            expect.stringContaining('AI usage:'),
            {
                event: 'ai.usage',
                userId: 'user-1',
                ...loggedProperties,
            },
        );
        // Token data must be in the message string itself so the default
        // pretty/plain log formats (which drop metadata) still surface it.
        expect(Logger.info).toHaveBeenCalledWith(
            expect.stringContaining('totalTokens=1200'),
            expect.anything(),
        );
        expect(track).toHaveBeenCalledWith({
            event: 'ai.usage',
            userId: 'user-1',
            properties: expectedProperties,
        });
    });

    it('reads keyManagement from metadata and drops unknown values', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    keyManagement: 'self-managed',
                },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.keyManagement).toBe(
            'self-managed',
        );

        track.mockClear();
        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    keyManagement: 'bogus',
                },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.keyManagement).toBeNull();
    });

    it('gives the embedded viewer id to the usage sinks and keeps it out of the logs', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);
        vi.mocked(Logger.info).mockClear();

        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    channel: 'embed',
                    externalUserId: 'viewer@customer.example',
                },
            },
            tokens,
        );

        expect(track.mock.calls[0][0].properties.externalUserId).toBe(
            'viewer@customer.example',
        );
        expect(JSON.stringify(vi.mocked(Logger.info).mock.calls)).not.toContain(
            'viewer@customer.example',
        );
    });

    it('reports the channel of the call and drops unknown values', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    channel: 'slack',
                },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.channel).toBe('slack');

        track.mockClear();
        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    channel: 'carrier-pigeon',
                },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.channel).toBeNull();
    });

    it('does not misattribute another feature’s generic run UUID to Autopilot', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);
        emitAiUsage(
            {
                telemetry: { functionId: 'otherFeature' },
                runtimeContext: { feature: 'data-app', runUuid: 'other-run' },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.managedAgentRunId).toBeNull();
    });

    it('attributes Deep Research usage to its run and phase', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'agent',
                    deepResearchRunUuid: 'run-1',
                    deepResearchPhase: 'investigating',
                },
            },
            tokens,
        );

        expect(track.mock.calls[0][0].properties).toMatchObject({
            managedAgentRunId: null,
            deepResearchRunId: 'run-1',
            deepResearchPhase: 'investigating',
        });
    });

    it('falls back to an anonymous id when no user is attributed', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                telemetry: { functionId: 'routeProject' },
                runtimeContext: {
                    feature: 'project-router',
                    organizationUuid: 'org-1',
                },
            },
            tokens,
        );

        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({ anonymousId: 'anonymous' }),
        );
        expect(track.mock.calls[0][0].userId).toBeUndefined();
    });

    it('still logs when no tracker is registered', () => {
        emitAiUsage(
            {
                telemetry: { functionId: 'fn' },
                runtimeContext: { feature: 'llm-judge' },
            },
            tokens,
        );
        expect(Logger.info).toHaveBeenCalledTimes(1);
    });
});

describe('getAiUsageChannel', () => {
    it.each([
        ['web_app', null, 'web'],
        ['web_app', 'space-1', 'embed'],
        ['api', null, 'api'],
        ['slack', null, 'slack'],
        ['evals', null, 'evals'],
        ['scheduler', null, 'scheduler'],
        ['data_app', null, 'data_app'],
    ] as const)(
        'labels a %s thread (embed space %s) as %s',
        (createdFrom, embedSpaceUuid, channel) => {
            expect(getAiUsageChannel({ createdFrom, embedSpaceUuid })).toBe(
                channel,
            );
        },
    );
});
