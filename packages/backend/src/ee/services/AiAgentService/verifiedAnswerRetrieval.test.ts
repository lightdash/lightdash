import { type SessionUser } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { generateEmbedding } from '../ai/agents/embeddingGenerator';
import { AiDecisionClient } from '../ai/decisions/AiDecisionClient';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/agents/embeddingGenerator', () => ({
    generateEmbedding: vi.fn(),
}));

const candidate = (artifactVersionUuid: string, similarity: number) => ({
    artifactVersionUuid,
    similarity,
    chartConfig: {
        queryConfig: {
            metrics: ['orders_count'],
            dimensions: ['orders_status'],
        },
    },
    artifactType: 'chart' as const,
    verifiedQuestion: 'Count orders by status',
    title: 'Orders',
    description: null,
});
const baseline = candidate('baseline', 0.99);
const expanded = candidate('expanded', 0.1);
const user = { userUuid: 'user', organizationUuid: 'org' } as SessionUser;

const setup = () => {
    vi.mocked(generateEmbedding).mockResolvedValue({
        embedding: [1, 0],
        provider: 'provider',
        modelName: 'embedding-model',
    });
    const aiAgentModel = {
        getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
        getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
        searchArtifactsBySimilarity: vi
            .fn()
            .mockResolvedValue([baseline, expanded]),
        findArtifactReferencesByPromptUuid: vi.fn().mockResolvedValue([]),
        recordArtifactReferences: vi.fn().mockResolvedValue(undefined),
        getArtifactVersionsByUuids: vi.fn().mockResolvedValue([baseline]),
    };
    const request = vi.fn<typeof fetch>().mockImplementation(async () =>
        Response.json({
            model: 'test',
            answers: {
                relevant_0: { type: 'noul', noul: 0.01 },
                same_0: { type: 'noul', noul: 0.01 },
                relevant_1: { type: 'noul', noul: 0.99 },
                same_1: { type: 'noul', noul: 0.99 },
            },
        }),
    );
    const service = new AiAgentService({
        lightdashConfig: lightdashConfigMock,
        aiAgentModel,
        analytics: { track: vi.fn() },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const authorize = vi
        .spyOn(service, 'getAgent')
        .mockResolvedValue({} as never);
    const getDecisions = vi
        .spyOn(service, 'getDecisionClient')
        .mockResolvedValue(
            new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 900 },
                request,
            ),
        );
    const args = {
        projectUuid: 'project',
        agentUuid: 'agent',
        searchQuery: 'Count orders by status',
    };
    return { service, aiAgentModel, request, authorize, getDecisions, args };
};

describe('verified answer retrieval', () => {
    afterEach(() => vi.restoreAllMocks());

    it('authorizes agent access before ranking a larger scoped candidate pool', async () => {
        const { service, aiAgentModel, args, getDecisions, authorize } =
            setup();
        expect(
            await service.getRelevantVerifiedAnswerContextForAgent(user, args),
        ).toEqual({ relevantVerifiedAnswers: [expanded] });
        expect(authorize).toHaveBeenCalledWith(user, 'agent', 'project');
        expect(getDecisions).toHaveBeenCalledWith({
            userUuid: 'user',
            organizationUuid: 'org',
        });
        expect(aiAgentModel.searchArtifactsBySimilarity).toHaveBeenCalledWith({
            organizationUuid: 'org',
            projectUuid: 'project',
            agentUuid: 'agent',
            queryEmbedding: [1, 0],
            embeddingModelProvider: 'provider',
            embeddingModel: 'embedding-model',
            limit: 30,
            semanticCandidates: true,
        });
    });

    it('does not retrieve or classify when agent access fails', async () => {
        const { service, aiAgentModel, args, authorize, request } = setup();
        authorize.mockRejectedValue(new Error('denied'));
        await expect(
            service.getRelevantVerifiedAnswerContextForAgent(user, args),
        ).rejects.toThrow('denied');
        expect(aiAgentModel.searchArtifactsBySimilarity).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it('uses the existing shortlist when the flag is off', async () => {
        const { service, aiAgentModel, args, getDecisions, request } = setup();
        getDecisions.mockResolvedValue(undefined);
        aiAgentModel.searchArtifactsBySimilarity.mockResolvedValue([baseline]);
        expect(
            await service.getRelevantVerifiedAnswerContextForAgent(user, args),
        ).toEqual({ relevantVerifiedAnswers: [baseline] });
        expect(aiAgentModel.searchArtifactsBySimilarity).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 3 }),
        );
        expect(
            aiAgentModel.searchArtifactsBySimilarity.mock.calls[0][0],
        ).not.toHaveProperty('semanticCandidates');
        expect(request).not.toHaveBeenCalled();
    });

    it('restores the baseline after decision provider failure', async () => {
        const { service, args, request } = setup();
        request.mockRejectedValue(new Error('offline'));
        expect(
            await service.getRelevantVerifiedAnswerContextForAgent(user, args),
        ).toEqual({ relevantVerifiedAnswers: [baseline] });
    });

    it('records only selected references and reuses persisted references without another decision', async () => {
        const { service, aiAgentModel, args, request } = setup();
        const retrieval = {
            ...args,
            organizationUuid: 'org',
            userUuid: 'user',
            promptUuid: 'prompt',
        };
        expect(await service.retrieveRelevantArtifacts(retrieval)).toEqual([
            expanded,
        ]);
        expect(aiAgentModel.recordArtifactReferences).toHaveBeenCalledWith({
            promptUuid: 'prompt',
            projectUuid: 'project',
            artifactReferences: [
                { artifactVersionUuid: 'expanded', similarityScore: 0.1 },
            ],
        });
        aiAgentModel.findArtifactReferencesByPromptUuid.mockResolvedValue([
            'baseline',
        ]);
        expect(await service.retrieveRelevantArtifacts(retrieval)).toEqual([
            baseline,
        ]);
        expect(request).toHaveBeenCalledOnce();
    });

    it('does not search without an embedding', async () => {
        const { service, aiAgentModel, args, request } = setup();
        vi.mocked(generateEmbedding).mockResolvedValue(null);
        expect(
            await service.getRelevantVerifiedAnswerContextForAgent(user, args),
        ).toEqual({ relevantVerifiedAnswers: [] });
        expect(aiAgentModel.searchArtifactsBySimilarity).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });
});

describe('verified examples in conversation history', () => {
    afterEach(() => vi.restoreAllMocks());
    const history = [
        {
            ai_prompt_uuid: 'first',
            prompt: 'Count orders',
            response: 'Previous answer',
        },
        {
            ai_prompt_uuid: 'current',
            prompt: 'Now show customer retention',
            response: null,
        },
    ] as Parameters<AiAgentService['getChatHistoryFromThreadMessages']>[0];
    const options = {
        organizationUuid: 'org',
        projectUuid: 'project',
        agentUuid: 'agent',
        currentPromptUuid: 'current',
        userUuid: 'user',
        retrieveRelevantArtifacts: true,
    };

    it.each([false, true])(
        'selects examples for the appropriate question (fast=%s)',
        async (fastDecisionsEnabled) => {
            const { service } = setup();
            const retrieve = vi
                .spyOn(service, 'retrieveRelevantArtifacts')
                .mockResolvedValue([baseline]);
            const result = await service.getChatHistoryFromThreadMessages(
                history,
                { ...options, fastDecisionsEnabled },
            );
            expect(retrieve).toHaveBeenCalledExactlyOnceWith({
                organizationUuid: 'org',
                projectUuid: 'project',
                agentUuid: 'agent',
                userUuid: 'user',
                promptUuid: fastDecisionsEnabled ? 'current' : 'first',
                searchQuery: fastDecisionsEnabled
                    ? 'Now show customer retention'
                    : 'Count orders',
            });
            expect(result).toContainEqual({
                role: 'assistant',
                content: 'Previous answer',
            });
            expect(
                result.filter(
                    (message) =>
                        typeof message.content === 'string' &&
                        message.content.includes(
                            'Here are some relevant queries',
                        ),
                ),
            ).toHaveLength(1);
            const userIndex = result.findIndex(
                (message) =>
                    message.content ===
                    (fastDecisionsEnabled
                        ? 'Now show customer retention'
                        : 'Count orders'),
            );
            expect(result[userIndex + 1].content).toContain(
                'Here are some relevant queries',
            );
        },
    );
    it('honors disabled retrieval even when fast decisions are enabled', async () => {
        const { service } = setup();
        const retrieve = vi.spyOn(service, 'retrieveRelevantArtifacts');
        const result = await service.getChatHistoryFromThreadMessages(history, {
            ...options,
            fastDecisionsEnabled: true,
            retrieveRelevantArtifacts: false,
        });
        expect(retrieve).not.toHaveBeenCalled();
        expect(result).toEqual([
            { role: 'user', content: 'Count orders' },
            { role: 'assistant', content: 'Previous answer' },
            { role: 'user', content: 'Now show customer retention' },
        ]);
    });

    it('omits deferred examples for the current prompt', async () => {
        const { service } = setup();
        const retrieve = vi.spyOn(service, 'retrieveRelevantArtifacts');
        const result = await service.getChatHistoryFromThreadMessages(history, {
            ...options,
            fastDecisionsEnabled: true,
            currentPromptExamples: { type: 'omit' },
        });
        expect(retrieve).not.toHaveBeenCalled();
        expect(result).toEqual([
            { role: 'user', content: 'Count orders' },
            { role: 'assistant', content: 'Previous answer' },
            { role: 'user', content: 'Now show customer retention' },
        ]);
    });

    it('places provided examples after the current prompt without another lookup', async () => {
        const { service } = setup();
        const retrieve = vi.spyOn(service, 'retrieveRelevantArtifacts');
        const examples = {
            role: 'user' as const,
            content:
                'Here are some relevant queries from previous conversations:',
        };
        const result = await service.getChatHistoryFromThreadMessages(history, {
            ...options,
            fastDecisionsEnabled: true,
            currentPromptExamples: { type: 'provided', message: examples },
        });
        expect(retrieve).not.toHaveBeenCalled();
        expect(result).toEqual([
            { role: 'user', content: 'Count orders' },
            { role: 'assistant', content: 'Previous answer' },
            { role: 'user', content: 'Now show customer retention' },
            examples,
        ]);
    });

    it.each(
        [false, true].flatMap((fastDecisionsEnabled) =>
            [undefined, 'previous-query'].map((queryUuid) => ({
                fastDecisionsEnabled,
                queryUuid,
            })),
        ),
    )(
        'preserves prior query inputs and successful result references: $queryUuid, enabled: $fastDecisionsEnabled',
        async ({ queryUuid, fastDecisionsEnabled }) => {
            const { service, aiAgentModel } = setup();
            const input = {
                queryConfig: {
                    exploreName: 'orders',
                    filters: { status: 'completed' },
                    parameters: { region: 'EU' },
                },
            };
            aiAgentModel.getToolCallsAndResultsForPrompt.mockImplementation(
                async (uuid) =>
                    uuid === 'first'
                        ? [
                              {
                                  toolCall: {
                                      toolCallId: 'query',
                                      toolName: 'runQuery',
                                      toolArgs: input,
                                  },
                                  toolResult: {
                                      toolCallId: 'query',
                                      toolName: 'runQuery',
                                      result: 'count: 42',
                                      metadata: {
                                          status: 'success',
                                          ...(queryUuid ? { queryUuid } : {}),
                                      },
                                  },
                              },
                          ]
                        : [],
            );
            vi.spyOn(service, 'retrieveRelevantArtifacts').mockResolvedValue(
                [],
            );
            const result = await service.getChatHistoryFromThreadMessages(
                history,
                {
                    ...options,
                    fastDecisionsEnabled,
                },
            );
            expect(result).toContainEqual({
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'query',
                        toolName: 'runQuery',
                        input,
                    },
                ],
            });
            expect(result).toContainEqual({
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'query',
                        toolName: 'runQuery',
                        output: {
                            type: 'json',
                            value: fastDecisionsEnabled
                                ? {
                                      result: 'count: 42',
                                      status: 'success',
                                      ...(queryUuid ? { queryUuid } : {}),
                                  }
                                : 'count: 42',
                        },
                    },
                ],
            });
        },
    );

    it('compacts representation without discarding any query semantics', () => {
        const example = {
            ...baseline,
            chartConfig: {
                ...baseline.chartConfig,
                queryConfig: {
                    ...baseline.chartConfig.queryConfig,
                    parameters: { region: 'EU' },
                    timezone: 'Europe/London',
                    filters: {
                        dimensions: {
                            and: [
                                {
                                    target: { fieldId: 'orders_status' },
                                    operator: 'equals',
                                    values: ['completed'],
                                },
                            ],
                        },
                    },
                    tableCalculations: [
                        {
                            name: 'share',
                            sql: 'orders_count / SUM(orders_count) OVER ()',
                        },
                    ],
                },
            },
        };
        const legacy = AiAgentService.createRelevantArtifactsMessage([example]);
        const compact = AiAgentService.createRelevantArtifactsMessage(
            [example],
            true,
        );
        const json = (content: unknown) =>
            JSON.parse(String(content).split('```json\n')[1].split('```')[0]);
        expect(json(legacy.content)).toEqual(example.chartConfig);
        expect(json(compact.content)).toEqual({
            verifiedQuestion: example.verifiedQuestion,
            query: example.chartConfig,
        });
        expect(String(compact.content).length).toBeLessThan(
            String(legacy.content).length,
        );
        expect(
            AiAgentService.createRelevantArtifactsMessage([example], false),
        ).toEqual(legacy);
    });
});

describe('battle profile response preparation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([
        ['fast', true, true],
        ['fast', false, false],
        ['baseline', true, false],
        ['baseline', false, false],
    ] as const)(
        'gates the %s thread profile on the fast-decisions master flag (flag on: %s)',
        async (
            battleProfile,
            masterFlagEnabled,
            expectedFastDecisionsEnabled,
        ) => {
            const aiAgentModel = {
                getThread: vi.fn().mockResolvedValue({
                    agentUuid: 'agent',
                    user: { uuid: 'user' },
                }),
                getAgent: vi.fn().mockResolvedValue({
                    uuid: 'agent',
                    projectUuid: 'project',
                }),
                getThreadMessages: vi
                    .fn()
                    .mockResolvedValue([{ ai_prompt_uuid: 'prompt' }]),
                findWebAppPrompt: vi.fn().mockResolvedValue({
                    promptUuid: 'prompt',
                    threadUuid: 'thread',
                    organizationUuid: 'org',
                    projectUuid: 'project',
                    battleProfile,
                }),
            };
            const service = new AiAgentService({
                lightdashConfig: lightdashConfigMock,
                aiAgentModel,
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            vi.spyOn(
                service as unknown as {
                    checkAgentThreadAccess: () => Promise<boolean>;
                },
                'checkAgentThreadAccess',
            ).mockResolvedValue(true);
            vi.spyOn(
                service as unknown as {
                    maybeCompactThreadBeforeResponse: () => Promise<null>;
                },
                'maybeCompactThreadBeforeResponse',
            ).mockResolvedValue(null);
            vi.spyOn(service, 'getDecisionClient').mockResolvedValue(
                masterFlagEnabled ? ({} as AiDecisionClient) : undefined,
            );
            const getHistory = vi
                .spyOn(service, 'getChatHistoryFromThreadMessages')
                .mockResolvedValue([]);

            await (
                service as unknown as {
                    prepareAgentThreadResponse: (
                        requestUser: SessionUser,
                        args: {
                            agentUuid: string;
                            threadUuid: string;
                            promptUuid: string;
                        },
                    ) => Promise<unknown>;
                }
            ).prepareAgentThreadResponse(user, {
                agentUuid: 'agent',
                threadUuid: 'thread',
                promptUuid: 'prompt',
            });

            expect(getHistory).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    fastDecisionsEnabled: expectedFastDecisionsEnabled,
                }),
            );
        },
    );
});
