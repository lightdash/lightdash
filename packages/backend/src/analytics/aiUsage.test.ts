import Logger from '../logging/logger';
import {
    AiUsageEvent,
    embeddingModelUsageToTokens,
    emitAiUsage,
    languageModelUsageToTokens,
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
    it('maps AI SDK usage to token classes', () => {
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
            inputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 800,
            cacheWriteTokens: 50,
            reasoningTokens: 30,
            totalTokens: 1200,
        });
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
    });

    it('emits a structured log line and a tracked event', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                functionId: 'generateAgentResponse',
                metadata: {
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
            feature: 'agent',
            functionId: 'generateAgentResponse',
            organizationId: 'org-1',
            projectId: 'project-1',
            aiAgentId: 'agent-1',
            threadId: 'thread-1',
            promptId: 'prompt-1',
            model: 'claude-sonnet-5',
            provider: 'anthropic',
            keyManagement: null,
            ...tokens,
        };

        expect(Logger.info).toHaveBeenCalledWith(
            expect.stringContaining('AI usage:'),
            {
                event: 'ai.usage',
                userId: 'user-1',
                ...expectedProperties,
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
                functionId: 'generateAgentResponse',
                metadata: {
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
                functionId: 'generateAgentResponse',
                metadata: {
                    feature: 'agent',
                    organizationUuid: 'org-1',
                    keyManagement: 'bogus',
                },
            },
            tokens,
        );
        expect(track.mock.calls[0][0].properties.keyManagement).toBeNull();
    });

    it('falls back to an anonymous id when no user is attributed', () => {
        const track = vi.fn<(event: AiUsageEvent) => void>();
        registerAiUsageTracker(track);

        emitAiUsage(
            {
                functionId: 'routeProject',
                metadata: {
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
            { functionId: 'fn', metadata: { feature: 'llm-judge' } },
            tokens,
        );
        expect(Logger.info).toHaveBeenCalledTimes(1);
    });
});
