import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    type AgentSuggestionModelChip,
    type AiAgent,
    type Explore,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { type SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { SuggestionGenerationError } from '../ai/agents/suggestionErrors';
import {
    generateAgentSuggestions,
    type SuggestionPromptContext,
} from '../ai/agents/suggestionGenerator';
import { AiAgentService } from './AiAgentService';

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
}));
vi.mock('../ai/agents/suggestionGenerator', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../ai/agents/suggestionGenerator')
    >()),
    generateAgentSuggestions: vi.fn(),
}));

const client = { client: 'ios', clientVersion: '1.0.1', clientBuild: '198' };
const input = { projectUuid: 'project-1', agentUuid: 'agent-1', client };
const generatedChip: AgentSuggestionModelChip = {
    kind: 'prompt',
    label: 'Find existing charts',
    tool: 'findContent',
    defaults: { explore: null, dimensions: [], metrics: [], timeframe: null },
};
const generated = {
    chips: [generatedChip],
    droppedChipCount: 0,
    droppedReasons: [],
};
const suggestionUser = {
    userUuid: 'user-1',
    organizationUuid: 'org-1',
    ability: new Ability([{ action: 'manage', subject: 'all' }]),
} as SessionUser;

type ContextLoaders = {
    fetchSuggestionsVerifiedContent: () => Promise<
        SuggestionPromptContext['verifiedContent']
    >;
    fetchSuggestionsRecentConversations: () => Promise<
        SuggestionPromptContext['recentUserConversations']
    >;
};

function buildService() {
    const track = vi.fn();
    const metrics = {
        incrementAiAgentSuggestions: vi.fn(),
        incrementAiAgentSuggestionChipsDropped: vi.fn(),
    };
    const getThread = vi.fn();
    const findThreadMessages = vi.fn().mockResolvedValue([]);
    const getVerifiedQuestions = vi.fn().mockResolvedValue([]);
    const getCopilotConfig = vi.fn().mockResolvedValue({});
    const featureFlagGet = vi.fn().mockResolvedValue({ enabled: false });
    const getSpaces = vi.fn().mockResolvedValue([]);
    const service = new AiAgentService({
        analytics: { track },
        prometheusMetrics: metrics,
        aiAgentModel: { getThread, findThreadMessages, getVerifiedQuestions },
        orgAiCopilotConfigResolver: {
            getCopilotConfig,
            resolveFastModel: vi
                .fn()
                .mockResolvedValue({ model: { modelId: 'test-model' } }),
        },
        featureFlagService: { get: featureFlagGet },
        projectService: { getSpaces },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(service, 'getAgent').mockResolvedValue({
        uuid: 'agent-1',
        projectUuid: 'project-1',
        organizationUuid: 'org-1',
        name: 'Agent',
        instruction: null,
        tags: [],
        providerCredentialUuid: null,
        enableContentTools: false,
        enableDataAccess: true,
    } as unknown as AiAgent);
    const getAvailableExplores = vi
        .spyOn(service, 'getAvailableExplores')
        .mockResolvedValue([]);
    vi.spyOn(
        service as unknown as ContextLoaders,
        'fetchSuggestionsVerifiedContent',
    ).mockResolvedValue([]);
    vi.spyOn(
        service as unknown as ContextLoaders,
        'fetchSuggestionsRecentConversations',
    ).mockResolvedValue([]);
    vi.mocked(generateAgentSuggestions).mockResolvedValue(
        structuredClone(generated),
    );
    return {
        service,
        track,
        metrics,
        getAvailableExplores,
        getThread,
        findThreadMessages,
        getVerifiedQuestions,
        getSpaces,
        getCopilotConfig,
    };
}

describe('AiAgentService getAgentSuggestions', () => {
    beforeEach(() => vi.clearAllMocks());
    it('applies prompt-context chart access checks before loading suggestion metadata', async () => {
        const hasAccess = vi.fn<SavedChartService['hasAccess']>(async () => {
            throw new ForbiddenError('Chart is not visible');
        });
        const get = vi.fn<SavedChartService['get']>();
        const track = vi.fn();
        const service = new AiAgentService({
            analytics: { track },
            savedChartService: { hasAccess, get },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        vi.spyOn(service, 'getAgent').mockResolvedValue({
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
        } as unknown as AiAgent);
        const user = {
            userUuid: 'user-1',
            organizationUuid: 'org-1',
        } as SessionUser;

        await expect(
            service.getAgentSuggestions(user, {
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                client,
                context: { type: 'chart', chartUuid: 'chart-1' },
            }),
        ).rejects.toThrow('Chart is not visible');

        expect(hasAccess).toHaveBeenCalledWith(
            'view',
            { user, projectUuid: 'project-1' },
            { savedChartUuid: 'chart-1' },
        );
        expect(get).not.toHaveBeenCalled();
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'error',
                    source: null,
                    fallbackReason: null,
                    chipCount: 0,
                    usingFallback: true,
                    ...client,
                }),
            }),
        );
    });
});

describe('AiAgentService suggestion fallback and telemetry', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns generated chips and records client details once', async () => {
        const { service, track, metrics } = buildService();
        expect(
            await service.getAgentSuggestions(suggestionUser, input),
        ).toEqual({
            chips: generated.chips,
            source: 'generated',
        });
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'generated',
                    source: 'generated',
                    usingFallback: false,
                    fallbackReason: null,
                    droppedChipCount: 0,
                    modelId: 'test-model',
                    ...client,
                }),
            }),
        );
        expect(
            metrics.incrementAiAgentSuggestions,
        ).toHaveBeenCalledExactlyOnceWith('generated', null);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('counts model and server drops and records a breadcrumb', async () => {
        const { service, track, metrics } = buildService();
        vi.mocked(generateAgentSuggestions).mockResolvedValueOnce({
            chips: [generatedChip, { ...generatedChip, tool: 'runSql' }],
            droppedChipCount: 1,
            droppedReasons: ['invalid chip'],
        });
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('generated');
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    droppedChipCount: 2,
                    outcome: 'generated',
                    source: 'generated',
                    usingFallback: false,
                }),
            }),
        );
        expect(
            metrics.incrementAiAgentSuggestionChipsDropped,
        ).toHaveBeenCalledWith(2);
        expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'ai_agent.suggestions',
                level: 'warning',
                data: expect.objectContaining({
                    droppedChipCount: 2,
                    'suggestions.reason': 'schema',
                }),
            }),
        );
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('uses cached chips when schema validation fails after a successful call', async () => {
        const { service, track } = buildService();
        await service.getAgentSuggestions(suggestionUser, input);
        track.mockClear();
        vi.mocked(generateAgentSuggestions).mockRejectedValueOnce(
            new SuggestionGenerationError('schema', null),
        );
        expect(
            await service.getAgentSuggestions(suggestionUser, input),
        ).toEqual({
            chips: generated.chips,
            source: 'cached',
        });
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'cached',
                    source: 'cached',
                    fallbackReason: 'schema',
                    usingFallback: true,
                    ...client,
                }),
            }),
        );
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it.each(['schema', 'parse'] as const)(
        'uses defaults for %s failures without a cache',
        async (reason) => {
            const { service, track } = buildService();
            vi.mocked(generateAgentSuggestions).mockRejectedValueOnce(
                new SuggestionGenerationError(reason, null),
            );
            const result = await service.getAgentSuggestions(
                suggestionUser,
                input,
            );
            expect(result.source).toBe('default');
            expect(result.chips.length).toBeGreaterThan(0);
            expect(track).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        outcome: 'default',
                        source: 'default',
                        fallbackReason: reason,
                        usingFallback: true,
                    }),
                }),
            );
            expect(Sentry.captureException).not.toHaveBeenCalled();
            expect(Sentry.addBreadcrumb).toHaveBeenCalled();
        },
    );

    it('captures provider failures with reason and client tags', async () => {
        const { service, track } = buildService();
        const error = new Error('invalid credentials');
        vi.mocked(generateAgentSuggestions).mockRejectedValueOnce(error);
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('default');
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'default',
                    source: 'default',
                    fallbackReason: 'provider',
                    ...client,
                }),
            }),
        );
        expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
            tags: {
                errorType: 'AiAgentSuggestionsGenerationFailed',
                'suggestions.reason': 'provider',
                client: 'ios',
                projectUuid: 'project-1',
            },
        });
    });

    it('classifies timeouts', async () => {
        const { service, track } = buildService();
        vi.mocked(generateAgentSuggestions).mockRejectedValueOnce(
            Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        );
        await service.getAgentSuggestions(suggestionUser, input);
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'default',
                    source: 'default',
                    fallbackReason: 'timeout',
                }),
            }),
        );
    });

    it('uses defaults for context-load failures', async () => {
        const { service, getAvailableExplores, track } = buildService();
        const error = new Error('catalog unavailable');
        getAvailableExplores.mockRejectedValueOnce(error);
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('default');
        expect(generateAgentSuggestions).not.toHaveBeenCalled();
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'default',
                    source: 'default',
                    fallbackReason: 'context_load',
                    documentChipShown: false,
                }),
            }),
        );
        expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, {
            tags: {
                errorType: 'AiAgentSuggestionsGenerationFailed',
                'suggestions.reason': 'context_load',
                client: 'ios',
                projectUuid: 'project-1',
            },
        });
    });

    it('uses cached chips during a context-load failure', async () => {
        const { service, getAvailableExplores, track } = buildService();
        await service.getAgentSuggestions(suggestionUser, input);
        track.mockClear();
        getAvailableExplores.mockRejectedValueOnce(new Error('unavailable'));
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('cached');
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'cached',
                    source: 'cached',
                    fallbackReason: 'context_load',
                }),
            }),
        );
    });

    it('drops cached chips that refer to explores no longer available', async () => {
        const { service, getAvailableExplores } = buildService();
        getAvailableExplores.mockResolvedValueOnce([
            {
                name: 'orders',
                label: 'Orders',
                baseTable: 'orders',
                tables: { orders: { dimensions: {}, metrics: {} } },
            },
        ] as unknown as Explore[]);
        vi.mocked(generateAgentSuggestions).mockResolvedValueOnce({
            ...generated,
            chips: [
                {
                    ...generatedChip,
                    defaults: { ...generatedChip.defaults, explore: 'orders' },
                },
            ],
        });
        await service.getAgentSuggestions(suggestionUser, input);
        vi.mocked(generateAgentSuggestions).mockRejectedValueOnce(
            new SuggestionGenerationError('schema', null),
        );
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('default');
    });

    it('uses schema fallback when every generated chip fails server validation', async () => {
        const { service, track } = buildService();
        vi.mocked(generateAgentSuggestions).mockResolvedValueOnce({
            ...generated,
            chips: [{ ...generatedChip, tool: 'runSql' }],
        });
        expect(
            (await service.getAgentSuggestions(suggestionUser, input)).source,
        ).toBe('default');
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'default',
                    source: 'default',
                    fallbackReason: 'schema',
                    droppedChipCount: 1,
                }),
            }),
        );
    });

    it('does not emit for ineligible threads', async () => {
        const { service, getThread, track, metrics } = buildService();
        getThread.mockResolvedValueOnce({
            createdFrom: 'slack',
            user: { uuid: 'other-user' },
        });
        expect(
            await service.getAgentSuggestions(suggestionUser, {
                ...input,
                threadUuid: 'thread',
            }),
        ).toEqual({ chips: [], source: 'default' });
        expect(track).not.toHaveBeenCalled();
        expect(metrics.incrementAiAgentSuggestions).not.toHaveBeenCalled();
        expect(generateAgentSuggestions).not.toHaveBeenCalled();
    });

    it('still rejects missing threads and emits one error event', async () => {
        const { service, track } = buildService();
        await expect(
            service.getAgentSuggestions(suggestionUser, {
                ...input,
                threadUuid: 'missing',
            }),
        ).rejects.toThrow('Thread not found');
        expect(track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'error',
                    source: null,
                    fallbackReason: null,
                }),
            }),
        );
    });
});
