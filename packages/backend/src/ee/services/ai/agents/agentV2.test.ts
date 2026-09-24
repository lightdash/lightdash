import { type AnyType } from '@lightdash/common';
import {
    APICallError,
    asSchema,
    generateText,
    streamText,
    type ModelMessage,
    type ToolSet,
} from 'ai';
import {
    registerAiUsageTracker,
    type AiUsageEvent,
} from '../../../../analytics/aiUsage';
import { validExplore } from '../../../../services/ProjectService/ProjectService.mock';
import { MCP_UNTRUSTED_OUTPUT_NOTICE } from '../AiAgentMcpRuntimeClient';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { getLoadAgentTools } from '../tools/loadAgentTools';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiDeepResearchExecutionRole,
} from '../types/aiAgent';
import { AgentContext } from '../utils/AgentContext';
import {
    AiAgentEmptyResponseError,
    AiAgentStepCapReachedError,
    EMPTY_RESPONSE_MESSAGE,
    PROVIDER_BILLING_MESSAGE,
    STEP_CAP_REACHED_MESSAGE,
} from '../utils/errorMessages';
import { getStaticToolDescription } from '../utils/toolDescription';
import {
    buildAgentMessages,
    buildDeepResearchExecutionContextSnapshot,
    buildForcedFirstStep,
    buildPrepareStep,
    generateAgentResponse,
    getAgentMessages,
    getAgentTools,
    getCandidateSearchTerms,
    getChartExportFastResponse,
    getChartFollowupFastResponse,
    getDataAnswerFastResponse,
    getDataAppBuildFastResponse,
    getDeepResearchBudgetInstruction,
    getFastDataAnswerPreparedContext,
    getPromptMcpServers,
    getRecentQueryFieldIds,
    getStepBudgetOverride,
    normalizeToolOutput,
    recordAgentStepUsage,
    scopeAgentConversation,
    storeInvalidAgentToolCall,
    streamAgentResponse,
    withEarlyToolProgress,
    type AgentMcpToolSetup,
} from './agentV2';
import { createIntentToolGate } from './referenceToolGating';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
    streamText: vi.fn(),
}));

const buildAgentDependencies = (updatePrompt: ReturnType<typeof vi.fn>) =>
    new Proxy(
        {
            listExplores: vi.fn().mockResolvedValue([]),
            getVerifiedFieldUsage: vi.fn().mockResolvedValue(new Map()),
            getProjectParameterDefinitions: vi.fn().mockResolvedValue({}),
            listCustomChartTypes: vi
                .fn()
                .mockResolvedValue({ types: [], totalCount: 0 }),
            updatePrompt,
            perf: new Proxy({}, { get: () => vi.fn() }),
        },
        {
            get: (target, property: string) =>
                target[property as keyof typeof target] ?? vi.fn(),
        },
    ) as unknown as AiAgentDependencies;

const buildAgentArgs = (
    execution: Record<string, unknown> = { mode: 'standard', maxSteps: 10 },
) =>
    ({
        agentSettings: {
            uuid: 'agent-1',
            name: 'Test agent',
            projectUuid: 'project-1',
        },
        aiAgentMemoryEnabled: false,
        availableSkills: [],
        callOptions: {},
        canManageAgent: false,
        canRunSql: true,
        compactionSummary: null,
        debugLoggingEnabled: false,
        deepResearchRuns: [],
        enableAiWriteback: false,
        enableCodingAgent: false,
        enableContentTools: false,
        enableDataAccess: false,
        enableDataAnswerFastResponse: false,
        enableEditProjectContext: false,
        enablePreviewDeploySetup: false,
        enableRepoDiscovery: false,
        execution,
        forceToolHints: false,
        getDashboardChartsPageSize: 10,
        keyManagement: 'self-managed',
        knowledgeDocuments: [],
        mcpServers: [],
        messageHistory: [{ role: 'user', content: 'Question' }],
        model: {},
        organizationId: 'organization-1',
        projectContext: [],
        projectContextEnabled: false,
        promptUuid: 'prompt-1',
        providerOptions: {},
        repoFsRoot: null,
        repoFsSupportsCodeSearch: false,
        requestingUser: null,
        runSqlMaxLimit: 5000,
        siteUrl: 'http://localhost',
        telemetryEnabled: false,
        threadUuid: 'thread-1',
        toolDescriptionMaxChars: 1000,
        toolHints: [],
        userId: 'user-1',
        writebackAttribution: null,
    }) as unknown as AiAgentArgs;

const mcpToolSetup = () => ({
    tools: {},
    mcpToolNameToServerUuid: {},
    unavailableMcpServers: [],
    closeMcpClients: vi.fn().mockResolvedValue(undefined),
});

describe('flags-off agent turns', () => {
    it.each(['generate', 'stream'] as const)(
        'preserves the legacy %s model, context and tool path',
        async (mode) => {
            const args = buildAgentArgs();
            args.enableDataAccess = true;
            args.projectContextEnabled = true;
            args.projectContext = [
                {
                    id: 'revenue',
                    kind: 'definition',
                    terms: ['revenue'],
                    objects: [],
                    content: 'Revenue excludes refunds.',
                },
            ];
            const evaluate = vi.spyOn(AiDecisionClient.prototype, 'evaluate');
            const dependencies = buildAgentDependencies(
                vi.fn().mockResolvedValue(undefined),
            );
            Object.assign(dependencies, {
                consumePromptSteers: async () => [],
            });
            let options: AnyType;
            try {
                if (mode === 'generate') {
                    vi.mocked(generateText).mockImplementationOnce((async (
                        captured: AnyType,
                    ) => {
                        options = captured;
                        return {
                            text: 'Answer',
                            steps: [{ usage: { totalTokens: 1 } }],
                            usage: { totalTokens: 1 },
                            finishReason: 'stop',
                        };
                    }) as AnyType);
                    await generateAgentResponse({
                        args,
                        dependencies,
                        mcpToolSetup: mcpToolSetup(),
                    });
                } else {
                    vi.mocked(streamText).mockImplementationOnce(((
                        captured: AnyType,
                    ) => {
                        options = captured;
                        return {};
                    }) as AnyType);
                    await streamAgentResponse({
                        args,
                        dependencies,
                        mcpToolSetup: mcpToolSetup(),
                    });
                    expect(Array.isArray(options.experimental_transform)).toBe(
                        false,
                    );
                }
                expect(options.model).toBe(args.model);
                expect(options.experimental_repairToolCall).toBeUndefined();
                expect(options.tools).toHaveProperty('generateVisualization');
                expect(options.tools).toHaveProperty('loadProjectContext');
                for (const tool of [
                    'runQuery',
                    'exportChartAsCode',
                    'loadAgentTools',
                ])
                    expect(options.tools).not.toHaveProperty(tool);
                expect(JSON.stringify(options.messages)).toContain(
                    'Call the `loadProjectContext` tool BEFORE grepFields',
                );
                expect(
                    options.tools.generateVisualization.description,
                ).not.toContain('server selects a validated default');
                const firstStep = await options.prepareStep({
                    stepNumber: 0,
                    messages: options.messages,
                });
                expect(firstStep?.toolChoice).toBeUndefined();
                if (mode === 'generate') {
                    expect(firstStep?.model.modelId).toBe(args.model.modelId);
                    expect(firstStep?.model.provider).toBe(args.model.provider);
                } else {
                    expect(firstStep?.model).toBeUndefined();
                }
                expect(firstStep?.activeTools).toBeUndefined();
                expect(evaluate).not.toHaveBeenCalled();
            } finally {
                evaluate.mockRestore();
            }
        },
    );
});

describe('MCP context preparation at the agent boundary', () => {
    it.each(['generate', 'stream'] as const)(
        'delivers project definitions in the first %s request without requiring a lookup',
        async (mode) => {
            const args = buildAgentArgs();
            args.projectContextEnabled = true;
            args.projectContext = [
                {
                    id: 'revenue',
                    kind: 'definition',
                    terms: ['revenue'],
                    objects: [],
                    content: 'Revenue excludes refunds.',
                },
            ];
            const request = vi.fn<typeof fetch>().mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        context_0: { type: 'noul', noul: 0.99 },
                        turnIntent: {
                            type: 'choice',
                            choice: 'reference_answer',
                            confidence: 0.99,
                            probabilities: { reference_answer: 1 },
                        },
                    },
                }),
            );
            args.decisions = new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                request,
            );
            const dependencies = buildAgentDependencies(
                vi.fn().mockResolvedValue(undefined),
            );
            const getProjectContextDocument = vi.fn();
            const getAiAgentMemoryContextEntries = vi.fn();
            Object.assign(dependencies, {
                consumePromptSteers: async () => [],
                updateProgress: vi.fn().mockResolvedValue(undefined),
                getProjectContextDocument,
                getAiAgentMemoryContextEntries,
            });
            let options: AnyType;
            if (mode === 'generate') {
                vi.mocked(generateText).mockImplementationOnce((async (
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {
                        text: 'Answer',
                        steps: [{ usage: { totalTokens: 1 } }],
                        usage: { totalTokens: 1 },
                        finishReason: 'stop',
                    };
                }) as AnyType);
                await generateAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: mcpToolSetup(),
                });
            } else {
                vi.mocked(streamText).mockImplementationOnce(((
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {};
                }) as AnyType);
                await streamAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: mcpToolSetup(),
                });
            }
            const messages = JSON.stringify(options.messages);
            expect(messages).toContain('Revenue excludes refunds.');
            expect(messages).toContain('partial selection');
            expect(messages).not.toContain(
                'Call the `loadProjectContext` tool BEFORE',
            );
            expect(options.tools).toHaveProperty('loadProjectContext');
            expect(options.experimental_repairToolCall).toEqual(
                expect.any(Function),
            );
            expect(getProjectContextDocument).not.toHaveBeenCalled();
            expect(getAiAgentMemoryContextEntries).not.toHaveBeenCalled();
            expect(request).toHaveBeenCalledTimes(1);
            const firstStep = await options.prepareStep({
                stepNumber: 0,
                messages: options.messages,
            });
            expect(firstStep.activeTools).toContain('loadProjectContext');
            expect(firstStep.activeTools).toContain('loadAgentTools');
            expect(firstStep.activeTools).not.toContain(
                'generateVisualization',
            );
            await options.tools.loadAgentTools.execute(
                {},
                { toolCallId: 'load', messages: options.messages },
            );
            const nextStep = await options.prepareStep({
                stepNumber: 1,
                messages: options.messages,
            });
            expect(nextStep.activeTools).toBeUndefined();
        },
    );

    it.each(['generate', 'stream'] as const)(
        'activates a selected tool in the first %s step without executing it',
        async (mode) => {
            const args = buildAgentArgs();
            const request = vi.fn<typeof fetch>().mockResolvedValue(
                Response.json({
                    model: 'test',
                    answers: {
                        mcpTool: {
                            type: 'choice',
                            choice: 'tool_0',
                            confidence: 0.99,
                            probabilities: { tool_0: 1 },
                        },
                        turnIntent: {
                            type: 'choice',
                            choice: 'other',
                            confidence: 0.99,
                            probabilities: { other: 1 },
                        },
                    },
                }),
            );
            args.decisions = new AiDecisionClient(
                { apiKey: 'test', model: 'test', timeoutMs: 100 },
                request,
            );
            const dependencies = buildAgentDependencies(
                vi.fn().mockResolvedValue(undefined),
            );
            Object.assign(dependencies, {
                consumePromptSteers: async () => [],
            });
            const execute = vi.fn();
            const setup = {
                ...mcpToolSetup(),
                tools: {
                    mcp_issues_search: {
                        description: 'Search issues',
                        execute,
                    },
                } as unknown as ToolSet,
            };
            let options: AnyType;
            if (mode === 'generate') {
                vi.mocked(generateText).mockImplementationOnce((async (
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {
                        text: 'Answer',
                        steps: [{ usage: { totalTokens: 1 } }],
                        usage: { totalTokens: 1 },
                        finishReason: 'stop',
                    };
                }) as AnyType);
                await generateAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: setup,
                });
            } else {
                vi.mocked(streamText).mockImplementationOnce(((
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {};
                }) as AnyType);
                await streamAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: setup,
                });
            }
            const step = await options.prepareStep({
                stepNumber: 0,
                messages: options.messages,
            });
            expect(step.activeTools).toContain('mcp_issues_search');
            expect(JSON.stringify(options.messages)).toContain(
                'MCP tool definition already loaded: mcp_issues_search',
            );
            expect(execute).not.toHaveBeenCalled();
            expect(request).toHaveBeenCalledTimes(1);
        },
    );
});

describe('generateAgentResponse error persistence', () => {
    it('persists provider billing guidance for a self-managed key', async () => {
        const updatePrompt = vi.fn().mockResolvedValue(undefined);
        const dependencies = buildAgentDependencies(updatePrompt);
        const args = buildAgentArgs();
        const providerError = new APICallError({
            message: 'Provider request failed',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 400,
            data: {
                type: 'error',
                error: {
                    type: 'billing_error',
                    message: 'Provider request failed',
                },
            },
        });
        vi.mocked(generateText).mockRejectedValueOnce(providerError);

        await expect(
            generateAgentResponse({
                args,
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).rejects.toBe(providerError);
        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage: PROVIDER_BILLING_MESSAGE,
        });
    });
});

describe('unknown error copy at the agent boundary', () => {
    const setup = () => {
        const request = vi.fn<typeof fetch>().mockImplementation(async () =>
            Response.json({
                model: 'test',
                answers: {
                    category: {
                        type: 'choice',
                        choice: 'permissions',
                        confidence: 0.99,
                        probabilities: { permissions: 1 },
                    },
                },
            }),
        );
        const args = buildAgentArgs();
        args.decisions = new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            request,
        );
        const updatePrompt = vi.fn().mockResolvedValue(undefined);
        return {
            args,
            request,
            updatePrompt,
            dependencies: buildAgentDependencies(updatePrompt),
        };
    };

    it.each(['generate', 'stream'] as const)(
        'persists classified copy when %s fails before responding',
        async (mode) => {
            const { args, request, updatePrompt, dependencies } = setup();
            const error = new Error(
                'The configured role cannot access this resource',
            );
            if (mode === 'generate')
                vi.mocked(generateText).mockRejectedValueOnce(error);
            else
                vi.mocked(streamText).mockImplementationOnce(() => {
                    throw error;
                });
            const run =
                mode === 'generate'
                    ? generateAgentResponse
                    : streamAgentResponse;
            await expect(
                run({
                    args: args as AnyType,
                    dependencies,
                    mcpToolSetup: mcpToolSetup(),
                }),
            ).rejects.toBe(error);
            expect(updatePrompt).toHaveBeenCalledWith({
                promptUuid: 'prompt-1',
                errorMessage: expect.stringContaining('Check your permissions'),
            });
            expect(request).toHaveBeenCalledTimes(2);
        },
    );

    it('shares classification across repeated streaming error callbacks', async () => {
        const { args, request, updatePrompt, dependencies } = setup();
        let options: AnyType;
        vi.mocked(streamText).mockImplementationOnce(((input: AnyType) => {
            options = input;
            return {} as AnyType;
        }) as AnyType);
        await streamAgentResponse({
            args: args as AnyType,
            dependencies,
            mcpToolSetup: mcpToolSetup(),
        });
        const error = new Error(
            'The configured role cannot access this resource',
        );
        await Promise.all([
            options.onError({ error }),
            options.onError({ error }),
        ]);
        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage: expect.stringContaining('Check your permissions'),
        });
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('retains the existing final error when the classifier is unavailable', async () => {
        const { args, request, updatePrompt, dependencies } = setup();
        request.mockRejectedValue(new Error('offline'));
        const error = new Error('Unfamiliar failure');
        vi.mocked(generateText).mockRejectedValueOnce(error);
        await expect(
            generateAgentResponse({
                args,
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).rejects.toBe(error);
        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage:
                'Something went wrong while generating the response. Please try again.',
        });
    });
});

describe('empty finishes and interrupts', () => {
    const emptyGenerateResult = {
        text: '',
        steps: [{ usage: { totalTokens: 10 } }],
        usage: { totalTokens: 10 },
        finishReason: 'tool-calls',
    };

    const buildInterruptibleDependencies = (interrupted: boolean) => {
        const updatePrompt = vi.fn().mockResolvedValue(undefined);
        const dependencies = buildAgentDependencies(updatePrompt);
        const isPromptInterrupted = vi.fn().mockResolvedValue(interrupted);
        Object.assign(dependencies, { isPromptInterrupted });
        return { updatePrompt, dependencies };
    };

    it('generate: persists an empty response instead of an error when the prompt was interrupted', async () => {
        const { updatePrompt, dependencies } =
            buildInterruptibleDependencies(true);
        vi.mocked(generateText).mockResolvedValueOnce(
            emptyGenerateResult as AnyType,
        );

        await expect(
            generateAgentResponse({
                args: buildAgentArgs(),
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).resolves.toBe('');

        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({ promptUuid: 'prompt-1', response: '' }),
        );
        expect(updatePrompt).not.toHaveBeenCalledWith(
            expect.objectContaining({ errorMessage: expect.any(String) }),
        );
    });

    it('generate: still persists the empty-response error when not interrupted', async () => {
        const { updatePrompt, dependencies } =
            buildInterruptibleDependencies(false);
        vi.mocked(generateText).mockResolvedValueOnce(
            emptyGenerateResult as AnyType,
        );

        await expect(
            generateAgentResponse({
                args: buildAgentArgs(),
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).rejects.toBeInstanceOf(AiAgentEmptyResponseError);

        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage: EMPTY_RESPONSE_MESSAGE,
        });
    });

    const runStreamOnFinish = async (
        interrupted: boolean,
        execution?: Record<string, unknown>,
    ) => {
        const { updatePrompt, dependencies } =
            buildInterruptibleDependencies(interrupted);
        let capturedOptions: AnyType;
        vi.mocked(streamText).mockImplementationOnce(((options: AnyType) => {
            capturedOptions = options;
            return {} as AnyType;
        }) as AnyType);

        await streamAgentResponse({
            args: buildAgentArgs(execution) as AnyType,
            dependencies,
            mcpToolSetup: mcpToolSetup(),
        });
        expect(capturedOptions.experimental_repairToolCall).toBeUndefined();
        // AI SDK 7: `usage` aggregates every step; the final step keeps its own usage.
        await capturedOptions.onFinish({
            usage: { totalTokens: 100 },
            totalUsage: { totalTokens: 100 },
            steps: [{ text: '', usage: { totalTokens: 10 } }],
            finalStep: { reasoning: [] },
            finishReason: 'tool-calls',
        });
        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                tokenUsage: { totalTokens: 100, finalStepTotalTokens: 10 },
            }),
        );
        return updatePrompt;
    };

    it('stream: persists an empty response instead of an error when the prompt was interrupted', async () => {
        const updatePrompt = await runStreamOnFinish(true);

        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({ promptUuid: 'prompt-1', response: '' }),
        );
        expect(updatePrompt).not.toHaveBeenCalledWith(
            expect.objectContaining({ errorMessage: expect.any(String) }),
        );
    });

    it('stream: still persists the empty-response error when not interrupted', async () => {
        const updatePrompt = await runStreamOnFinish(false);

        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                promptUuid: 'prompt-1',
                errorMessage: EMPTY_RESPONSE_MESSAGE,
            }),
        );
    });

    it('generate: still throws the step-cap error at the cap when not interrupted', async () => {
        const { updatePrompt, dependencies } =
            buildInterruptibleDependencies(false);
        vi.mocked(generateText).mockResolvedValueOnce(
            emptyGenerateResult as AnyType,
        );

        await expect(
            generateAgentResponse({
                args: buildAgentArgs({ mode: 'standard', maxSteps: 1 }),
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).rejects.toBeInstanceOf(AiAgentStepCapReachedError);

        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage: STEP_CAP_REACHED_MESSAGE,
        });
    });

    it('generate: an interrupt at the step cap still persists an empty response', async () => {
        const { updatePrompt, dependencies } =
            buildInterruptibleDependencies(true);
        vi.mocked(generateText).mockResolvedValueOnce(
            emptyGenerateResult as AnyType,
        );

        await expect(
            generateAgentResponse({
                args: buildAgentArgs({ mode: 'standard', maxSteps: 1 }),
                dependencies,
                mcpToolSetup: mcpToolSetup(),
            }),
        ).resolves.toBe('');

        expect(updatePrompt).not.toHaveBeenCalledWith(
            expect.objectContaining({ errorMessage: expect.any(String) }),
        );
    });

    it('stream: still persists the step-cap error at the cap when not interrupted', async () => {
        const updatePrompt = await runStreamOnFinish(false, {
            mode: 'standard',
            maxSteps: 1,
        });

        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                promptUuid: 'prompt-1',
                errorMessage: STEP_CAP_REACHED_MESSAGE,
            }),
        );
    });

    it('stream: an interrupt at the step cap still persists an empty response', async () => {
        const updatePrompt = await runStreamOnFinish(true, {
            mode: 'standard',
            maxSteps: 1,
        });

        expect(updatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({ promptUuid: 'prompt-1', response: '' }),
        );
        expect(updatePrompt).not.toHaveBeenCalledWith(
            expect.objectContaining({ errorMessage: expect.any(String) }),
        );
    });
});

describe('generateAgentResponse token usage persistence', () => {
    const runWithSteps = async (
        execution: Record<string, unknown>,
        stepTotals: number[],
    ) => {
        const updatePrompt = vi.fn().mockResolvedValue(undefined);
        vi.mocked(generateText).mockImplementationOnce((async (
            options: AnyType,
        ) => {
            await stepTotals.reduce(
                (chain, totalTokens) =>
                    chain.then(() =>
                        options.onStepFinish({
                            usage: { totalTokens },
                            toolCalls: [],
                            toolResults: [],
                            text: '',
                        }),
                    ),
                Promise.resolve(),
            );
            return {
                text: 'Answer',
                steps: stepTotals.map((totalTokens) => ({
                    usage: { totalTokens },
                })),
                // AI SDK 7: `usage` aggregates every step.
                usage: {
                    totalTokens: stepTotals.reduce(
                        (total, value) => total + value,
                        0,
                    ),
                },
                totalUsage: {
                    totalTokens: stepTotals.reduce(
                        (total, value) => total + value,
                        0,
                    ),
                },
                finishReason: 'stop',
            };
        }) as AnyType);

        await generateAgentResponse({
            args: buildAgentArgs(execution),
            dependencies: buildAgentDependencies(updatePrompt),
            mcpToolSetup: mcpToolSetup(),
        });

        return updatePrompt;
    };

    it('persists the cumulative total and the final step separately for deep research', async () => {
        const updatePrompt = await runWithSteps(
            {
                mode: 'deep_research',
                maxSteps: 10,
                initialTokenUsage: 400000,
                runUuid: 'run-1',
                phase: 'investigate',
                parentToolCallId: null,
                budget: {
                    maxSteps: 10,
                    maxToolCalls: 20,
                    maxWarehouseQueries: 5,
                    maxTokens: 1000000,
                    deadlineMs: 60000,
                    maxResultRows: 500,
                },
            },
            [12000, 18000, 25000],
        );

        expect(updatePrompt).toHaveBeenLastCalledWith({
            promptUuid: 'prompt-1',
            tokenUsage: {
                totalTokens: 455000,
                finalStepTotalTokens: 25000,
            },
        });
    });

    it('persists cumulative spend and final-step occupancy separately for standard mode', async () => {
        const updatePrompt = await runWithSteps(
            { mode: 'standard', maxSteps: 10 },
            [12000, 31000],
        );

        expect(updatePrompt).toHaveBeenLastCalledWith({
            promptUuid: 'prompt-1',
            response: 'Answer',
            tokenUsage: {
                totalTokens: 43000,
                finalStepTotalTokens: 31000,
            },
            responseTiming: {
                startedAt: expect.any(String),
                firstTokenAt: null,
                finishedAt: expect.any(String),
                stages: expect.objectContaining({
                    preparationMs: expect.any(Number),
                    providerMs: expect.anything(),
                    queryMs: expect.any(Number),
                    apiMs: expect.any(Number),
                    renderMs: expect.any(Number),
                    queryCacheHits: expect.any(Number),
                    queryReuseHits: expect.any(Number),
                }),
            },
        });
    });
});

describe('recordAgentStepUsage', () => {
    const usage = {
        inputTokens: 16,
        outputTokens: 7,
        totalTokens: 23,
        inputTokenDetails: {
            noCacheTokens: 10,
            cacheReadTokens: 4,
            cacheWriteTokens: 2,
        },
        outputTokenDetails: {
            reasoningTokens: 3,
        },
    } as never;

    afterEach(() => {
        registerAiUsageTracker(() => undefined);
    });

    it('emits one attributed event for every standard agent step', async () => {
        const events: AiUsageEvent[] = [];
        registerAiUsageTracker((event) => events.push(event));
        const telemetry = {
            telemetry: { functionId: 'generateAgentResponse' },
            runtimeContext: {
                feature: 'agent',
                organizationUuid: 'organization-1',
                projectUuid: 'project-1',
            },
        } as never;

        await recordAgentStepUsage({
            usage,
            telemetry,
            execution: { mode: 'standard', maxSteps: 10 },
        });
        await recordAgentStepUsage({
            usage,
            telemetry,
            execution: { mode: 'standard', maxSteps: 10 },
        });

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            event: 'ai.usage',
            properties: {
                feature: 'agent',
                // The total includes the cache tokens: 10 uncached + 4 read + 2 write.
                inputTokens: 16,
                outputTokens: 7,
                cacheReadTokens: 4,
                cacheWriteTokens: 2,
                reasoningTokens: 3,
                totalTokens: 23,
                deepResearchRunId: null,
                deepResearchPhase: null,
            },
        });
    });

    it('attributes Deep Research steps and awaits normalized usage persistence', async () => {
        const events: AiUsageEvent[] = [];
        const onStepUsage = vi.fn().mockResolvedValue(undefined);
        registerAiUsageTracker((event) => events.push(event));

        await recordAgentStepUsage({
            usage,
            telemetry: {
                telemetry: { functionId: 'generateAgentResponse' },
                runtimeContext: {
                    feature: 'deep-research',
                    deepResearchRunUuid: 'run-1',
                    deepResearchPhase: 'investigating',
                },
            } as never,
            execution: {
                mode: 'deep_research',
                runUuid: 'run-1',
                phase: 'investigating',
                maxSteps: 10,
                budget: {
                    maxTokens: 1_000,
                    maxToolCalls: 10,
                    maxWarehouseQueries: 5,
                    maxResultRows: 500,
                    maxSteps: 16,
                    deadlineMs: 600_000,
                },
                canUseRawSql: true,
                initialTokenUsage: 0,
                onStepUsage,
                research: {
                    role: 'coordinator',
                    runTask: vi.fn(),
                },
            },
        });

        expect(events).toHaveLength(1);
        expect(events[0]?.properties).toMatchObject({
            feature: 'deep-research',
            deepResearchRunId: 'run-1',
            deepResearchPhase: 'investigating',
        });
        expect(onStepUsage).toHaveBeenCalledWith({
            runUuid: 'run-1',
            phase: 'investigating',
            tokens: {
                // The total includes the cache tokens: 10 uncached + 4 read + 2 write.
                inputTokens: 16,
                outputTokens: 7,
                cacheReadTokens: 4,
                cacheWriteTokens: 2,
                reasoningTokens: 3,
                totalTokens: 23,
            },
        });
    });
});

describe('storeInvalidAgentToolCall', () => {
    it('waits for Deep Research error persistence before finishing the step', async () => {
        let resolveStore: () => void = () => undefined;
        const storeToolCallError = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveStore = resolve;
                }),
        );
        let finished = false;

        const persistence = storeInvalidAgentToolCall({
            storeToolCallError,
            promptUuid: 'prompt-1',
            toolCall: {
                toolCallId: 'invalid-call-1',
                toolName: 'searchContent',
                input: '{not-json',
                error: new Error('invalid arguments'),
            },
            executionMode: 'deep_research',
        }).then(() => {
            finished = true;
        });

        await Promise.resolve();
        expect(finished).toBe(false);
        expect(storeToolCallError).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            toolCallId: 'invalid-call-1',
            toolName: 'searchContent',
            errorMessage: 'invalid arguments',
            rawArgs: '{not-json',
        });

        resolveStore();
        await persistence;
        expect(finished).toBe(true);
    });
});

describe('getDeepResearchBudgetInstruction', () => {
    it('advertises only enforceable Deep Research limits', () => {
        const instruction = getDeepResearchBudgetInstruction({
            maxTokens: 10_000,
            maxToolCalls: 20,
            maxWarehouseQueries: 10,
            maxResultRows: 1_000,
            maxSteps: 16,
            deadlineMs: 600_000,
        });

        expect(instruction).toContain('20 tool calls');
        expect(instruction).toContain('10 warehouse queries');
        expect(instruction).toContain('1000 rows per query result');
        expect(instruction).toContain('10000 total model tokens');
    });
});

describe('buildForcedFirstStep', () => {
    it('forces the hinted report tool on only the opening step', () => {
        const prepareStep = buildForcedFirstStep(
            {
                forceToolHints: true,
                toolHints: ['submitResearchReport'],
            } as AiAgentArgs,
            {
                submitResearchReport: {} as never,
            },
        );

        expect(prepareStep?.({ stepNumber: 0 })).toEqual({
            toolChoice: {
                type: 'tool',
                toolName: 'submitResearchReport',
            },
        });
        expect(prepareStep?.({ stepNumber: 1 })).toEqual({});
    });
});

describe('getStepBudgetOverride', () => {
    it('steers standard agents through the final five steps', () => {
        const execution = { mode: 'standard', maxSteps: 10 } as const;

        expect(getStepBudgetOverride(execution, 4)).toBeUndefined();
        expect(getStepBudgetOverride(execution, 5)).toMatchObject({
            message: expect.stringContaining('finish with the best answer'),
        });
        expect(getStepBudgetOverride(execution, 8)).not.toHaveProperty(
            'activeTools',
        );
    });

    it('reserves the final standard-agent step for a response', () => {
        expect(
            getStepBudgetOverride({ mode: 'standard', maxSteps: 10 }, 9),
        ).toEqual({
            message: expect.stringContaining('Respond to the user now'),
            activeTools: [],
            toolChoice: 'none',
        });
    });

    it('steers every step when the standard-agent budget is five', () => {
        expect(
            getStepBudgetOverride({ mode: 'standard', maxSteps: 5 }, 0),
        ).toMatchObject({
            message: expect.stringContaining('finish with the best answer'),
        });
        expect(
            getStepBudgetOverride({ mode: 'standard', maxSteps: 5 }, 4),
        ).toMatchObject({
            activeTools: [],
            toolChoice: 'none',
        });
    });

    it('does not alter deep-research steps', () => {
        expect(
            getStepBudgetOverride(
                {
                    mode: 'deep_research',
                    runUuid: 'run-1',
                    phase: 'investigating',
                    maxSteps: 10,
                    budget: {
                        maxTokens: 10_000,
                        maxToolCalls: 20,
                        maxWarehouseQueries: 10,
                        maxResultRows: 1_000,
                        maxSteps: 16,
                        deadlineMs: 600_000,
                    },
                    canUseRawSql: true,
                    initialTokenUsage: 0,
                    research: {
                        role: 'coordinator',
                        runTask: vi.fn(),
                    },
                },
                9,
            ),
        ).toBeUndefined();
    });

    it('reserves a worker final step for findings submission', () => {
        const execution = {
            mode: 'deep_research',
            runUuid: 'run-1',
            phase: 'investigating',
            maxSteps: 5,
            budget: {
                maxTokens: 10_000,
                maxToolCalls: 20,
                maxWarehouseQueries: 10,
                maxResultRows: 1_000,
                maxSteps: 5,
                deadlineMs: 600_000,
            },
            canUseRawSql: true,
            initialTokenUsage: 0,
            research: {
                role: 'worker',
                task: { id: 'task-1', question: 'Why?', focus: 'Orders' },
                onFindings: vi.fn(),
            },
        } as const;

        expect(getStepBudgetOverride(execution, 3)).toBeUndefined();
        expect(getStepBudgetOverride(execution, 4)).toEqual({
            message: expect.stringContaining('Submit the best findings packet'),
            activeTools: ['submitWorkerFindings'],
            toolChoice: {
                type: 'tool',
                toolName: 'submitWorkerFindings',
            },
        });
    });
});

describe('buildPrepareStep worker isolation', () => {
    it('allows discovery before a classified data answer without downgrading the model', async () => {
        const fastModel = {} as AiAgentArgs['model'];
        const args = buildAgentArgs();
        args.toolCallModel = {
            model: fastModel,
            providerOptions: { openai: {} },
            keyManagement: 'self-managed',
        };
        const tools = {
            loadAgentTools: getLoadAgentTools(),
            runQuery: {} as never,
            grepFields: {} as never,
        };
        const gate = createIntentToolGate(tools, 'data_answer');
        const prepareStep = buildPrepareStep({
            args,
            dependencies: {
                ...buildAgentDependencies(vi.fn()),
                consumePromptSteers: vi.fn().mockResolvedValue([]),
            },
            tools: gate.tools,
            mcpToolNames: [],
            intentToolGate: gate,
            logger: vi.fn(),
            invalidToolCallIds: new Set(),
        });

        const first = await prepareStep({ stepNumber: 0, messages: [] });
        expect(first).toMatchObject({
            activeTools: expect.arrayContaining(['runQuery', 'grepFields']),
        });
        expect(first).not.toHaveProperty('toolChoice');
        expect(first).not.toHaveProperty('model');
        await expect(
            prepareStep({ stepNumber: 1, messages: [] }),
        ).resolves.toMatchObject({
            activeTools: expect.arrayContaining(['runQuery', 'grepFields']),
        });
    });

    it.each(['success', 'error', 'pending', null])(
        'only shortcuts a chart after a successful query: %s',
        async (status) => {
            const fastModel = {} as AiAgentArgs['model'];
            const args = buildAgentArgs();
            args.decisions = new AiDecisionClient({
                apiKey: null,
                model: 'test',
                timeoutMs: 100,
            });
            args.messageHistory = [
                { role: 'user', content: 'How many orders?' },
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'query-1',
                            toolName: 'runQuery',
                            input: {
                                queryConfig: { metrics: ['orders_count'] },
                            },
                        },
                    ],
                },
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'query-1',
                            toolName: 'runQuery',
                            output: {
                                type: 'json',
                                value: { status, result: 'query result' },
                            },
                        },
                    ],
                },
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'catalog',
                            toolName: 'getMetadata',
                            output: {
                                type: 'json',
                                value: {
                                    status: 'success',
                                    result: 'Large catalog payload',
                                },
                            },
                        },
                    ],
                },
                { role: 'assistant', content: 'Previous answer' },
                { role: 'user', content: 'As a line chart' },
            ];
            args.toolCallModel = {
                model: fastModel,
                providerOptions: { anthropic: {} },
                keyManagement: 'self-managed',
            };
            const tools = {
                loadAgentTools: getLoadAgentTools(),
                generateVisualization: {} as never,
                grepFields: {} as never,
            };
            const gate = createIntentToolGate(tools, 'chart_from_previous');
            const agentContext = new AgentContext([]);
            agentContext.previousQueryUuid = 'previous';
            const consumePromptSteers = vi.fn().mockResolvedValue([]);
            const prepareStep = buildPrepareStep({
                agentContext,
                args,
                dependencies: {
                    ...buildAgentDependencies(vi.fn()),
                    consumePromptSteers,
                },
                tools: gate.tools,
                mcpToolNames: [],
                intentToolGate: gate,
                logger: vi.fn(),
                invalidToolCallIds: new Set(),
            });

            const first = await prepareStep({
                stepNumber: 0,
                messages: args.messageHistory,
            });
            if (status !== 'success') {
                expect(first).not.toHaveProperty('toolChoice');
                expect(first).not.toHaveProperty('model');
                return;
            }
            expect(
                JSON.stringify(
                    'messages' in first ? first.messages : args.messageHistory,
                ),
            ).not.toContain('Large catalog payload');
            expect(JSON.stringify(args.messageHistory)).toContain(
                'Large catalog payload',
            );
            const next = await prepareStep({
                stepNumber: 1,
                messages: args.messageHistory,
            });
            expect(
                JSON.stringify(
                    'messages' in next ? next.messages : args.messageHistory,
                ),
            ).toContain('Large catalog payload');
            expect(agentContext.previousQueryUuid).toBeUndefined();
            consumePromptSteers.mockResolvedValue([
                { message: 'Actually explain the metric definition' },
            ]);
            const steered = await prepareStep({
                stepNumber: 0,
                messages: args.messageHistory,
            });
            expect(steered).not.toHaveProperty('toolChoice');
            expect(steered).not.toHaveProperty('model');
            expect(JSON.stringify(steered)).toContain('Large catalog payload');
            expect(first).toMatchObject({
                activeTools: ['generateVisualization'],
                toolChoice: { type: 'tool', toolName: 'generateVisualization' },
                model: fastModel,
                providerOptions: { anthropic: {} },
            });
        },
    );

    it('forces the validated chart exporter only on the first export step', async () => {
        const tools = {
            loadAgentTools: getLoadAgentTools(),
            exportChartAsCode: {} as never,
            findContent: {} as never,
        };
        const gate = createIntentToolGate(tools, 'chart_export');
        const prepareStep = buildPrepareStep({
            args: buildAgentArgs(),
            dependencies: {
                ...buildAgentDependencies(vi.fn()),
                consumePromptSteers: vi.fn().mockResolvedValue([]),
            },
            tools: gate.tools,
            mcpToolNames: [],
            intentToolGate: gate,
            logger: vi.fn(),
            invalidToolCallIds: new Set(),
        });

        await expect(
            prepareStep({ stepNumber: 0, messages: [] }),
        ).resolves.toMatchObject({
            activeTools: ['exportChartAsCode'],
            toolChoice: { type: 'tool', toolName: 'exportChartAsCode' },
        });
        await expect(
            prepareStep({ stepNumber: 1, messages: [] }),
        ).resolves.toMatchObject({
            activeTools: ['loadAgentTools', 'exportChartAsCode'],
        });
    });

    it.each([
        ['data_app_create', 'generateDataApp'],
        ['data_app_iterate', 'iterateDataApp'],
    ] as const)(
        'allows discovery before %s starts through %s',
        async (intent, toolName) => {
            const fastModel = {} as AiAgentArgs['model'];
            const args = buildAgentArgs();
            args.userQuestion = 'Build an app using our dark brand theme';
            args.toolCallModel = {
                model: fastModel,
                providerOptions: { openai: {} },
                keyManagement: 'self-managed',
            };
            const tools = {
                loadAgentTools: getLoadAgentTools(),
                generateDataApp: {} as never,
                iterateDataApp: {} as never,
                findContent: {} as never,
                listDataAppThemes: {} as never,
            };
            const gate = createIntentToolGate(tools, intent);
            const prepareStep = buildPrepareStep({
                args,
                dependencies: {
                    ...buildAgentDependencies(vi.fn()),
                    consumePromptSteers: vi.fn().mockResolvedValue([]),
                },
                tools: gate.tools,
                mcpToolNames: [],
                intentToolGate: gate,
                logger: vi.fn(),
                invalidToolCallIds: new Set(),
            });

            const step = await prepareStep({ stepNumber: 0, messages: [] });
            expect(step).toMatchObject({
                activeTools: expect.arrayContaining([
                    toolName,
                    'listDataAppThemes',
                    'findContent',
                    'loadAgentTools',
                ]),
            });
            expect(step).not.toHaveProperty('toolChoice');
            expect(step).not.toHaveProperty('model');
        },
    );

    it('restores reference tools on new user guidance while preserving MCP lazy loading', async () => {
        const tools = {
            loadAgentTools: getLoadAgentTools(),
            getKnowledgeDocumentContent: {} as never,
            generateVisualization: {} as never,
            mcp_external: {} as never,
        };
        const gate = createIntentToolGate(tools, 'reference_answer');
        const consumePromptSteers = vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ message: 'Now run the query.' }]);
        const prepareStep = buildPrepareStep({
            args: buildAgentArgs(),
            dependencies: {
                ...buildAgentDependencies(vi.fn()),
                consumePromptSteers,
            },
            tools: gate.tools,
            mcpToolNames: ['mcp_external'],
            intentToolGate: gate,
            logger: vi.fn(),
            invalidToolCallIds: new Set(),
        });
        const first = await prepareStep({ stepNumber: 0, messages: [] });
        expect(first).toMatchObject({
            activeTools: expect.not.arrayContaining(['generateVisualization']),
        });
        const next = await prepareStep({ stepNumber: 1, messages: [] });
        expect(next).toMatchObject({
            activeTools: expect.arrayContaining(['generateVisualization']),
        });
        expect(next).toMatchObject({
            activeTools: expect.not.arrayContaining(['mcp_external']),
        });
        expect(JSON.stringify(next)).toContain('Now run the query.');
    });

    it.each([0, 1])(
        'keeps a preloaded MCP tool selectable on step %i',
        async (stepNumber) => {
            const tools = {
                loadAgentTools: getLoadAgentTools(),
                runQuery: {} as never,
                grepFields: {} as never,
                mcp_external: {} as never,
            };
            const gate = createIntentToolGate(tools, 'data_answer');
            const prepareStep = buildPrepareStep({
                args: buildAgentArgs(),
                dependencies: {
                    ...buildAgentDependencies(vi.fn()),
                    consumePromptSteers: vi.fn().mockResolvedValue([]),
                },
                tools: gate.tools,
                mcpToolNames: ['mcp_external'],
                preloadedMcpToolNames: ['mcp_external'],
                intentToolGate: gate,
                logger: vi.fn(),
                invalidToolCallIds: new Set(),
            });

            const step = await prepareStep({ stepNumber, messages: [] });
            expect(step).toMatchObject({
                activeTools: expect.arrayContaining([
                    'runQuery',
                    'mcp_external',
                ]),
            });
            expect(step).not.toHaveProperty('toolChoice');
            expect(step).not.toHaveProperty('model');
        },
    );

    it('does not consume or inject prompt-wide steers for a worker', async () => {
        const args = buildAgentArgs({
            mode: 'deep_research',
            runUuid: 'run-1',
            phase: 'investigating',
            maxSteps: 5,
            budget: {
                maxTokens: 10_000,
                maxToolCalls: 20,
                maxWarehouseQueries: 10,
                maxResultRows: 1_000,
                maxSteps: 5,
                deadlineMs: 600_000,
            },
            canUseRawSql: true,
            initialTokenUsage: 0,
            research: {
                role: 'worker',
                task: { id: 'task-1', question: 'Why?', focus: 'Orders' },
                onFindings: vi.fn(),
            },
        });
        const consumePromptSteers = vi
            .fn()
            .mockResolvedValue([{ message: 'Coordinator-only guidance' }]);
        const prepareStep = buildPrepareStep({
            args,
            dependencies: {
                ...buildAgentDependencies(vi.fn()),
                consumePromptSteers,
            },
            tools: { submitWorkerFindings: {} as never },
            mcpToolNames: [],
            logger: vi.fn(),
            invalidToolCallIds: new Set(),
        });

        const result = await prepareStep({ stepNumber: 4, messages: [] });

        expect(consumePromptSteers).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain(
            'Coordinator-only guidance',
        );
        expect(result).toMatchObject({
            activeTools: ['submitWorkerFindings'],
            toolChoice: {
                type: 'tool',
                toolName: 'submitWorkerFindings',
            },
        });
    });
});

describe('buildDeepResearchExecutionContextSnapshot', () => {
    it('captures the effective runtime without secret-bearing fields', () => {
        const snapshot = buildDeepResearchExecutionContextSnapshot(
            {
                agentSettings: {
                    uuid: 'agent-1',
                    name: 'Research agent',
                    version: 4,
                    updatedAt: new Date('2026-07-24T09:00:00.000Z'),
                    instruction:
                        'Use https://secret.example/token-sensitive-path',
                    tags: ['analytics'],
                    spaceAccess: ['space-1'],
                    enableDataAccess: true,
                    enableSelfImprovement: false,
                    enableContentTools: true,
                    enableUserContext: false,
                },
                model: {
                    provider: 'anthropic',
                    modelId: 'claude-sonnet',
                },
                modelReasoningEnabled: true,
                keyManagement: 'self-managed',
                mcpServers: [
                    {
                        uuid: 'mcp-1',
                        name: 'GitHub',
                        url: 'https://secret.example/mcp',
                        resolvedCredential: {
                            type: 'bearer',
                            token: 'never-store-this',
                        },
                    },
                ],
                knowledgeDocuments: [
                    {
                        uuid: 'document-1',
                        name: 'Definitions',
                        updatedAt: new Date('2026-07-24T08:00:00.000Z'),
                        alwaysIncludeInContext: true,
                        content: 'never store document contents',
                    },
                ],
                projectContextEnabled: true,
                enableAiWriteback: false,
                enableCodingAgent: false,
                enablePreviewDeploySetup: false,
                enableRepoDiscovery: true,
                execution: {
                    mode: 'deep_research',
                    canUseRawSql: true,
                },
                repoFsRoot: 'dbt',
                repoFsSupportsCodeSearch: true,
                availableSkills: [{ name: 'modeling' }],
                canManageAgent: false,
                canRunSql: true,
                enableDataAccess: true,
                enableContentTools: true,
                autoApproveSql: true,
            } as unknown as AiAgentArgs,
            {
                generateVisualization: {} as never,
                mcp_github__search_issues: {} as never,
            },
            {
                tools: {
                    mcp_github__search_issues: {} as never,
                },
                mcpToolNameToServerUuid: {
                    mcp_github__search_issues: 'mcp-1',
                },
                unavailableMcpServers: [],
                closeMcpClients: () => Promise.resolve(),
            },
        );

        expect(snapshot).toMatchObject({
            schemaVersion: 1,
            resolutionStage: 'execution',
            model: {
                provider: 'anthropic',
                modelName: 'claude-sonnet',
                reasoningEnabled: true,
                keyManagement: 'self-managed',
            },
            tools: {
                availableToolNames: [
                    'generateVisualization',
                    'mcp_github__search_issues',
                ],
                attachedMcpServers: [
                    {
                        uuid: 'mcp-1',
                        name: 'GitHub',
                        enabledToolNames: ['mcp_github__search_issues'],
                    },
                ],
            },
            knowledgeDocuments: [
                {
                    uuid: 'document-1',
                    name: 'Definitions',
                    alwaysIncludeInContext: true,
                },
            ],
        });
        expect(JSON.stringify(snapshot)).not.toContain('never-store-this');
        expect(JSON.stringify(snapshot)).not.toContain('secret.example');
        expect(JSON.stringify(snapshot)).not.toContain(
            'never store document contents',
        );
    });
});

describe('normalizeToolOutput', () => {
    it('preserves built-in tool output result and metadata', () => {
        expect(
            normalizeToolOutput({
                result: 'ok',
                metadata: { status: 'success' },
            }),
        ).toEqual({
            result: 'ok',
            metadata: { status: 'success' },
        });
    });

    it('stores plain-text MCP output', () => {
        expect(normalizeToolOutput('plain text')).toEqual({
            result: 'plain text',
        });
    });

    it('stores structured MCP output as JSON text', () => {
        const output = {
            content: [{ type: 'text', text: 'hello' }],
        };

        expect(normalizeToolOutput(output)).toEqual({
            result: JSON.stringify(output),
        });
    });

    it('always returns a string result for empty MCP output', () => {
        expect(normalizeToolOutput(undefined)).toEqual({
            result: 'undefined',
        });
    });
});

describe('withEarlyToolProgress', () => {
    const finalOutput = {
        result: 'done',
        metadata: { status: 'success' },
    };
    const streamingTool = {
        async *execute() {
            yield {
                result: '',
                metadata: { status: 'streaming' },
            };
            yield finalOutput;
        },
    };

    it('resolves an async iterable tool to its final output after durable progress', async () => {
        let resolveProgress: () => void = () => undefined;
        const updateProgress = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolveProgress = resolve;
                }),
        );
        const execute = vi.fn(streamingTool.execute);
        const tools = withEarlyToolProgress(
            { streamingTool: { execute } } as never,
            updateProgress,
            true,
        );

        const execution = tools.streamingTool.execute?.({}, {
            toolCallId: 'tool-call-1',
        } as never);
        expect(execute).not.toHaveBeenCalled();

        resolveProgress();

        await expect(execution).resolves.toEqual(finalOutput);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('preserves async iterable tools in the standard execution path', () => {
        const tools = withEarlyToolProgress(
            { streamingTool } as never,
            vi.fn().mockResolvedValue(undefined),
            false,
        );

        const execution = tools.streamingTool.execute?.({}, {
            toolCallId: 'tool-call-1',
        } as never);

        expect(
            (execution as AsyncIterable<unknown>)[Symbol.asyncIterator],
        ).toBeTypeOf('function');
    });
});

// Change B: the workstream tools (listWorkstreams, closePullRequest) are shared
// by the general coding agent (editRepo) and the dbt-writeback agent
// (editDbtProject). Both can now drive several PRs per thread, so the gate
// widened from `enableCodingAgent` to `enableCodingAgent || enableAiWriteback`.
describe('getAgentTools workstream tool gate', () => {
    // Tool factories only capture their inputs at construction, so a Proxy that
    // hands back a fresh vi.fn() for every dependency access is enough to build
    // the whole tool set without enumerating all ~46 dependencies.
    const depsStub = () =>
        new Proxy({}, { get: () => vi.fn() }) as unknown as AiAgentDependencies;

    const mcpStub: AgentMcpToolSetup = {
        tools: {},
        mcpToolNameToServerUuid: {},
        unavailableMcpServers: [],
        closeMcpClients: () => Promise.resolve(),
    };

    type ToolFlags = {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        aiAgentMemoryEnabled?: boolean;
        canCreateDashboards?: boolean;
        canRunSql?: boolean;
        enableComposerQueries?: boolean;
        enableContentTools?: boolean;
        enableDocuments?: boolean;
        enableDataAccess?: boolean;
        enableGenerateDataApp?: boolean;
        enableFilterExpressions?: boolean;
    };

    const buildArgs = (flags: ToolFlags): AiAgentArgs =>
        ({
            canCreateDashboards: true,
            agentSettings: {
                uuid: 'agent-1',
                name: 'test-agent',
                projectUuid: 'project-1',
            },
            autoApproveSql: false,
            autoApproveSqlUserUuid: null,
            availableSkills: [],
            callOptions: {},
            compactionSummary: null,
            canManageAgent: false,
            canRunSql: true,
            debugLoggingEnabled: false,
            enableContentTools: false,
            enableDataAccess: false,
            enableEditProjectContext: false,
            enableGenerateDataApp: false,
            enablePreviewDeploySetup: false,
            enableRepoDiscovery: false,
            enableFilterExpressions: false,
            execution: {
                mode: 'standard',
                maxSteps: 10,
            },
            getDashboardChartsPageSize: 10,
            maxQueryLimit: 5000,
            messageHistory: [{ role: 'user', content: 'Question' }],
            mcpServers: [],
            model: {},
            organizationId: 'org-1',
            aiAgentMemoryEnabled: false,
            projectContextEnabled: false,
            promptUuid: 'prompt-1',
            providerOptions: {},
            runSqlMaxLimit: 5000,
            siteUrl: 'http://localhost',
            telemetryEnabled: false,
            threadUuid: 'thread-1',
            toolDescriptionMaxChars: 1000,
            toolHints: [],
            userId: 'user-1',
            useSlackStreamCard: false,
            slackLinksOnly: false,
            ...flags,
        }) as unknown as AiAgentArgs;

    const buildToolsForArgs = (args: AiAgentArgs) =>
        getAgentTools(
            args,
            depsStub(),
            [],
            mcpStub,
            new Map(),
            {},
            {
                types: [],
                totalCount: 0,
            },
            new AgentContext([]),
        );

    const buildTools = (flags: ToolFlags) =>
        buildToolsForArgs(buildArgs(flags));

    const toolNames = (flags: ToolFlags) => Object.keys(buildTools(flags));

    it.each([false, true])(
        'gates source attribution metadata on fast decisions (enabled=%s)',
        async (enabled) => {
            const args = buildArgs({
                enableDataAccess: true,
                enableCodingAgent: false,
                enableAiWriteback: false,
            });
            if (enabled)
                args.decisions = new AiDecisionClient({
                    apiKey: null,
                    model: 'test',
                    timeoutMs: 100,
                });
            const tools = getAgentTools(
                args,
                depsStub(),
                [validExplore],
                mcpStub,
                new Map(),
                {},
                { types: [], totalCount: 0 },
                new AgentContext([validExplore]),
            );
            const result = await tools.getMetadata.execute!(
                {
                    requests: [
                        { type: 'explore', exploreIds: [validExplore.name] },
                    ],
                },
                { toolCallId: 'metadata', messages: [], context: {} },
            );
            expect(JSON.stringify(result).includes('sqlOn')).toBe(enabled);
        },
    );

    it.each([false, true])(
        'offers chart export only with fast decisions and data access (data=%s)',
        (enableDataAccess) => {
            const args = buildArgs({
                enableCodingAgent: false,
                enableAiWriteback: false,
                enableDataAccess,
            });
            expect(buildToolsForArgs(args)).not.toHaveProperty(
                'exportChartAsCode',
            );
            const enabled = buildToolsForArgs({
                ...args,
                decisions: new AiDecisionClient({
                    apiKey: null,
                    model: 'test',
                    timeoutMs: 100,
                }),
            });
            expect('exportChartAsCode' in enabled).toBe(enableDataAccess);
        },
    );

    it.each([
        [false, false, false],
        [false, false, true],
        [false, true, false],
        [false, true, true],
        [true, false, false],
        [true, false, true],
        [true, true, false],
        [true, true, true],
    ])(
        'gates Document schemas and instructions together (documents=%s, content=%s, data=%s)',
        (enableDocuments, enableContentTools, enableDataAccess) => {
            const args = buildArgs({
                enableCodingAgent: false,
                enableAiWriteback: false,
                enableDocuments,
                enableContentTools,
                enableDataAccess,
            });
            const tools = buildToolsForArgs(args);
            const contentEnabled = enableContentTools && enableDataAccess;
            const documentsEnabled = contentEnabled && enableDocuments;
            const systemMessage = getAgentMessages(
                args,
                [],
                mcpStub,
                tools,
                new Map(),
                null,
                { types: [], totalCount: 0 },
            ).find(({ role }) => role === 'system');
            if (!systemMessage || typeof systemMessage.content !== 'string') {
                throw new Error('Expected a string system message');
            }

            expect(
                systemMessage.content.includes(
                    'Create a Document only when the user explicitly asks',
                ),
            ).toBe(documentsEnabled);
            for (const name of [
                'createContent',
                'readContent',
                'editContent',
            ]) {
                expect(Object.hasOwn(tools, name)).toBe(contentEnabled);
                if (contentEnabled) {
                    expect(
                        JSON.stringify(
                            asSchema(tools[name].inputSchema).jsonSchema,
                        ).includes('"document"'),
                    ).toBe(documentsEnabled);
                }
            }
        },
    );

    it.each([false, true])(
        'matches the %s filter prompt to the selected tool contracts',
        (enableFilterExpressions) => {
            const args = buildArgs({
                enableCodingAgent: false,
                enableAiWriteback: false,
                enableDataAccess: true,
                enableFilterExpressions,
            });
            const tools = buildToolsForArgs(args);
            const systemMessage = getAgentMessages(
                args,
                [],
                mcpStub,
                tools,
                new Map(),
                null,
                { types: [], totalCount: 0 },
            ).find(({ role }) => role === 'system');
            if (!systemMessage || typeof systemMessage.content !== 'string') {
                throw new Error('Expected a string system message');
            }

            expect({
                promptUsesExpressions: systemMessage.content.includes(
                    '## Filter expressions',
                ),
                visualizationUsesExpressions:
                    getStaticToolDescription(
                        tools.generateVisualization,
                    )?.includes('follow the Lightdash Agent system prompt') ??
                    false,
                fieldValueSearchUsesExpressions:
                    getStaticToolDescription(tools.searchFieldValues)?.includes(
                        'follow the Lightdash Agent system prompt',
                    ) ?? false,
            }).toEqual({
                promptUsesExpressions: enableFilterExpressions,
                visualizationUsesExpressions: enableFilterExpressions,
                fieldValueSearchUsesExpressions: enableFilterExpressions,
            });
        },
    );

    it('exposes listWorkstreams + closePullRequest when AI writeback is enabled (coding agent off)', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: true,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editDbtProject');
        expect(names).not.toContain('editRepo');
    });

    it('exposes the data app tools only when the data app gate is satisfied', () => {
        const withGate = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            enableGenerateDataApp: true,
        });
        const withoutGate = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            enableGenerateDataApp: false,
        });

        expect(withGate).toContain('generateDataApp');
        expect(withGate).toContain('iterateDataApp');
        expect(withGate).toContain('listDataAppThemes');
        expect(withoutGate).not.toContain('generateDataApp');
        expect(withoutGate).not.toContain('iterateDataApp');
        expect(withoutGate).not.toContain('listDataAppThemes');
    });

    it('exposes loadProjectContext when AI agent memory is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            aiAgentMemoryEnabled: true,
        });

        expect(names).toContain('loadProjectContext');
    });

    it('uses grepFields and getMetadata as the only field discovery path', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
        });

        expect(names).toContain('grepFields');
        expect(names).toContain('getMetadata');
        expect(names).not.toContain('discoverFields');
    });

    it('matches dashboard detail guidance to the available content tool', () => {
        const contentTools = buildTools({
            enableCodingAgent: false,
            enableAiWriteback: false,
            enableContentTools: true,
            enableDataAccess: true,
        });
        expect(Object.keys(contentTools)).toContain('readContent');
        expect(Object.keys(contentTools)).not.toContain('getDashboardCharts');
        expect(contentTools.findContent.description).toContain('"readContent"');
        expect(contentTools.findContent.description).not.toContain(
            '"getDashboardCharts"',
        );

        const legacyTools = buildTools({
            enableCodingAgent: false,
            enableAiWriteback: false,
            enableContentTools: false,
            enableDataAccess: true,
        });
        expect(Object.keys(legacyTools)).toContain('getDashboardCharts');
        expect(Object.keys(legacyTools)).not.toContain('readContent');
        expect(legacyTools.findContent.description).toContain(
            '"getDashboardCharts"',
        );
        expect(legacyTools.findContent.description).not.toContain(
            '"readContent"',
        );
    });

    it('withholds generateDashboard from users who cannot save one', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            canCreateDashboards: false,
        });

        expect(names).not.toContain('generateDashboard');
        // The read-only companion and the chart tool stay: the user can still
        // inspect existing dashboards and build visualizations.
        expect(names).toContain('getDashboardCharts');
        expect(names).toContain('generateVisualization');
    });

    it('exposes generateDashboard when the user can save one', () => {
        expect(
            toolNames({
                enableCodingAgent: false,
                enableAiWriteback: false,
                canCreateDashboards: true,
            }),
        ).toContain('generateDashboard');
    });

    it('does not expose loadMcpTools when there are no MCP tools', () => {
        expect(
            toolNames({
                enableCodingAgent: false,
                enableAiWriteback: false,
            }),
        ).not.toContain('loadMcpTools');
    });

    it('exposes loadMcpTools when live MCP tools are registered', () => {
        const tools = getAgentTools(
            buildArgs({
                enableCodingAgent: false,
                enableAiWriteback: false,
            }),
            depsStub(),
            [],
            {
                ...mcpStub,
                tools: { mcp_linear__search_issues: {} as never },
            },
            new Map(),
            {},
            { types: [], totalCount: 0 },
            new AgentContext([]),
        );

        expect(Object.keys(tools)).toEqual(
            expect.arrayContaining([
                'loadMcpTools',
                'mcp_linear__search_issues',
            ]),
        );
    });

    it('limits prompt MCP inventory to the final runtime tool set', () => {
        const setup: AgentMcpToolSetup = {
            ...mcpStub,
            tools: { mcp_linear__get_issue: {} as never },
            mcpToolNameToServerUuid: {
                mcp_linear__get_issue: 'linear-server',
            },
        };
        const servers = [
            { uuid: 'linear-server', name: 'Linear' },
        ] as AiAgentArgs['mcpServers'];

        expect(
            getPromptMcpServers(servers, setup, {
                submitWorkerFindings: {} as never,
            }),
        ).toEqual([{ name: 'Linear', toolNames: [] }]);
        expect(
            getPromptMcpServers(servers, setup, {
                loadMcpTools: {} as never,
                mcp_linear__get_issue: {} as never,
            }),
        ).toEqual([{ name: 'Linear', toolNames: ['mcp_linear__get_issue'] }]);
    });

    it('still exposes them for the general coding agent (writeback off) — unchanged', () => {
        const names = toolNames({
            enableCodingAgent: true,
            enableAiWriteback: false,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editRepo');
    });

    it('omits them when neither coding agent nor writeback is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
        });
        expect(names).not.toContain('listWorkstreams');
        expect(names).not.toContain('closePullRequest');
        expect(names).not.toContain('getPullRequestDiff');
    });

    it('withholds runSql when composer queries are enabled — a sql node supersedes it', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            canRunSql: true,
            enableComposerQueries: true,
        });
        expect(names).toContain('runComposerQueries');
        expect(names).not.toContain('runSql');
        // The SQL discovery companions stay: composer sql nodes need them.
        expect(names).toContain('listWarehouseTables');
        expect(names).toContain('describeWarehouseTable');
    });

    it('keeps runSql when composer queries are disabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            canRunSql: true,
            enableComposerQueries: false,
        });
        expect(names).toContain('runSql');
        expect(names).not.toContain('runComposerQueries');
    });

    const buildResearchArgs = (
        research: AiDeepResearchExecutionRole,
        canUseRawSql = true,
    ) => {
        const args = buildArgs({
            enableCodingAgent: false,
            enableAiWriteback: true,
        });
        args.canRunSql = canUseRawSql;
        args.execution = {
            mode: 'deep_research',
            runUuid: 'run-1',
            phase: 'investigating',
            maxSteps: 30,
            budget: {
                maxTokens: 10_000,
                maxToolCalls: 20,
                maxWarehouseQueries: 10,
                maxResultRows: 1_000,
                maxSteps: 16,
                deadlineMs: 600_000,
            },
            canUseRawSql,
            initialTokenUsage: 0,
            research,
        };
        return args;
    };

    const getResearchTools = (
        research: AiDeepResearchExecutionRole,
        canUseRawSql = true,
        includeSpoofedMcp = false,
    ) => {
        const args = buildResearchArgs(research, canUseRawSql);
        args.agentSettings.projectUuid = 'project-1';
        args.mcpServers = [
            {
                uuid: 'lightdash-mcp',
                url: 'http://localhost/api/v1/mcp/projects/project-1',
            },
            ...(includeSpoofedMcp
                ? [
                      {
                          uuid: 'external-mcp',
                          url: 'https://untrusted.example/mcp',
                      },
                  ]
                : []),
        ] as AiAgentArgs['mcpServers'];
        const researchMcpTools: ToolSet = {
            mcp_github__create_issue: {} as never,
            mcp_lightdash__run_metric_query: {} as never,
            mcp_lightdash__run_sql: {} as never,
        };
        const researchMcpToolServers: Record<string, string> = {
            mcp_github__create_issue: 'github-mcp',
            mcp_lightdash__run_metric_query: 'lightdash-mcp',
            mcp_lightdash__run_sql: 'lightdash-mcp',
        };
        if (includeSpoofedMcp) {
            researchMcpTools.mcp_external__run_sql = {} as never;
            researchMcpToolServers.mcp_external__run_sql = 'external-mcp';
        }

        return Object.keys(
            getAgentTools(
                args,
                depsStub(),
                [],
                {
                    ...mcpStub,
                    tools: researchMcpTools,
                    mcpToolNameToServerUuid: researchMcpToolServers,
                },
                new Map(),
                {},
                { types: [], totalCount: 0 },
                new AgentContext([]),
            ),
        );
    };

    it('limits the coordinator to read-only research tools', () => {
        const names = getResearchTools({
            role: 'coordinator',
            runTask: vi.fn(),
        });

        expect(names).toEqual(
            expect.arrayContaining([
                'delegateResearchTask',
                'findContent',
                'generateVisualization',
                'mcp_lightdash__run_sql',
            ]),
        );
        expect(names).not.toContain('createContent');
        expect(names).not.toContain('createScheduledDelivery');
        expect(names).not.toContain('editDbtProject');
        expect(names).not.toContain('editRepo');
        expect(names).not.toContain('loadMcpTools');
        expect(names).not.toContain('mcp_github__create_issue');
        expect(names).not.toContain('updateUserName');
    });

    it('removes native and MCP raw SQL when Deep Research SQL is disabled', () => {
        const names = getResearchTools(
            { role: 'coordinator', runTask: vi.fn() },
            false,
        );

        expect(names).not.toContain('runSql');
        expect(names).not.toContain('mcp_lightdash__run_sql');
        expect(names).toContain('mcp_lightdash__run_metric_query');
    });

    it('rejects warehouse-named tools from untrusted MCP servers', () => {
        const names = getResearchTools(
            { role: 'coordinator', runTask: vi.fn() },
            true,
            true,
        );

        expect(names).toContain('mcp_lightdash__run_sql');
        expect(names).not.toContain('mcp_external__run_sql');
    });

    // Workers are not given attached MCP servers at all (see
    // shouldIncludeAttachedMcpServers); this filter is the second line of
    // defence for anything that still reaches the toolset.
    it('strips a worker down to warehouse tools and its submission tool', () => {
        const names = getResearchTools({
            role: 'worker',
            task: { id: 'task-1', question: 'Why?', focus: 'Orders by week' },
            onFindings: vi.fn(),
        });

        expect(names).toEqual(
            expect.arrayContaining([
                'submitWorkerFindings',
                'generateVisualization',
                'mcp_lightdash__run_metric_query',
            ]),
        );
        // A worker must not delegate, report, reach content/repo tools, or
        // reload the agent's non-warehouse MCP context.
        expect(names).not.toContain('delegateResearchTask');
        expect(names).not.toContain('editDbtProject');
        expect(names).not.toContain('findContent');
        expect(names).not.toContain('loadMcpTools');
        expect(names).not.toContain('mcp_github__create_issue');
    });
});

describe('buildAgentMessages', () => {
    it('builds a deterministic confirmation only for a successful chart result', () => {
        const step = (output: unknown) => [
            {
                toolCalls: [
                    {
                        toolCallId: 'chart-1',
                        toolName: 'generateVisualization',
                        input: { title: 'Orders by month' },
                    },
                ],
                toolResults: [
                    {
                        toolCallId: 'chart-1',
                        toolName: 'generateVisualization',
                        output,
                    },
                ],
            },
        ];
        expect(
            getChartFollowupFastResponse(
                step({
                    result: 'rows',
                    metadata: {
                        status: 'success',
                        artifactVersionUuid: 'version-1',
                    },
                }),
            ),
        ).toBe(
            "Created **Orders by month** using the preceding query's measure, filters and scope.",
        );
        expect(
            getChartFollowupFastResponse(
                step({ result: 'failed', metadata: { status: 'error' } }),
            ),
        ).toBeNull();
        expect(
            getChartFollowupFastResponse(
                step({
                    result: 'The query returned no rows.',
                    metadata: { status: 'success' },
                }),
            ),
        ).toBeNull();
    });

    it('finishes a successful chart export from the server delivery token', () => {
        const step = (output: unknown) => [
            {
                toolCalls: [
                    {
                        toolCallId: 'export-1',
                        toolName: 'exportChartAsCode',
                        input: {},
                    },
                ],
                toolResults: [
                    {
                        toolCallId: 'export-1',
                        toolName: 'exportChartAsCode',
                        output,
                    },
                ],
            },
        ];
        expect(
            getChartExportFastResponse(
                step({
                    result: '```yaml\nname: Orders\n```',
                    metadata: {
                        status: 'success',
                        deliveryToken: '  __chart_export_1__  ',
                    },
                }),
            ),
        ).toBe('__chart_export_1__');
        expect(
            getChartExportFastResponse(
                step({
                    result: '{"missingDestination":["slug"]}',
                    metadata: { status: 'success' },
                }),
            ),
        ).toBeNull();
        expect(
            getChartExportFastResponse(
                step({ result: 'failed', metadata: { status: 'error' } }),
            ),
        ).toBeNull();
    });

    it('finishes immediately after a data app build starts', () => {
        const step = (output: unknown) => [
            {
                toolCalls: [
                    {
                        toolCallId: 'app-1',
                        toolName: 'generateDataApp',
                        input: {},
                    },
                ],
                toolResults: [
                    {
                        toolCallId: 'app-1',
                        toolName: 'generateDataApp',
                        output,
                    },
                ],
            },
        ];
        expect(
            getDataAppBuildFastResponse(
                step({
                    result: 'Started the data app build.',
                    metadata: {
                        status: 'pending',
                        appUuid: 'app-uuid',
                        version: 1,
                    },
                }),
            ),
        ).toBe('Started the data app build. It will take a few minutes.');
        expect(
            getDataAppBuildFastResponse(
                step({ result: 'failed', metadata: { status: 'error' } }),
            ),
        ).toBeNull();
    });

    it('finishes a successful simple data answer from validated query output', () => {
        const result = (
            output: unknown,
            toolCallId = 'query-1',
            toolName = 'runQuery',
        ) => ({
            toolCalls: [{ toolCallId, toolName, input: {} }],
            toolResults: [{ toolCallId, toolName, output }],
        });

        expect(
            getDataAnswerFastResponse([
                result({
                    result: 'csv',
                    metadata: {
                        status: 'success',
                        fastResponse: '**Orders:** 64,357',
                    },
                }),
            ]),
        ).toBe('**Orders:** 64,357');
        expect(
            getDataAnswerFastResponse([
                result({
                    result: 'invalid date',
                    metadata: { status: 'error' },
                }),
                result(
                    {
                        result: 'csv',
                        metadata: {
                            status: 'success',
                            fastResponse: '**Orders:** 64,357',
                        },
                    },
                    'query-2',
                ),
            ]),
        ).toBeNull();
        expect(
            getDataAnswerFastResponse([
                result({
                    result: 'csv',
                    metadata: {
                        status: 'success',
                        fastResponse: '**Orders:** 64,357',
                    },
                }),
                result(
                    {
                        result: 'csv',
                        metadata: {
                            status: 'success',
                            fastResponse: '**Orders:** 12,345',
                        },
                    },
                    'query-2',
                ),
            ]),
        ).toBeNull();
    });

    it('reuses the high-confidence first-turn data answer decision', () => {
        const args = buildAgentArgs();
        args.enableDataAnswerFastResponse = true;

        expect(getFastDataAnswerPreparedContext(args)).toEqual({
            content: null,
            mcpToolNames: [],
            projectContextEntryIds: [],
            turnIntent: 'data_answer',
        });

        args.messageHistory = [
            { role: 'user', content: 'How many orders?' },
            { role: 'assistant', content: '151' },
            { role: 'user', content: 'What about last year?' },
        ];
        expect(getFastDataAnswerPreparedContext(args)).toBeNull();
    });

    it.each(['success', 'error', 'pending', null])(
        'only carries confirmed successful query fields: %s',
        (status) => {
            expect(
                getRecentQueryFieldIds([
                    { role: 'user', content: 'How many orders?' },
                    {
                        role: 'assistant',
                        content: [
                            {
                                type: 'tool-call',
                                toolCallId: 'query-1',
                                toolName: 'runQuery',
                                input: {
                                    queryConfig: {
                                        metrics: ['orders_unique_order_count'],
                                        dimensions: [],
                                        filters: {
                                            dimensions: [
                                                {
                                                    fieldId:
                                                        'orders_order_date',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    {
                        role: 'tool',
                        content: [
                            {
                                type: 'tool-result',
                                toolCallId: 'query-1',
                                toolName: 'runQuery',
                                output: {
                                    type: 'json',
                                    value: { result: 'query output', status },
                                },
                            },
                        ],
                    },
                    { role: 'assistant', content: '151 orders.' },
                    { role: 'user', content: 'As a line chart.' },
                ]),
            ).toEqual(
                status === 'success'
                    ? ['orders_unique_order_count', 'orders_order_date']
                    : [],
            );
        },
    );

    it('prioritizes the follow-up request without discarding prior query scope', () => {
        const previous = Array.from(
            { length: 12 },
            (_, index) => `patient_health_scores_previous_${index}`,
        );
        const searchTerms = getCandidateSearchTerms(
            'Break down these patients by cost tier',
            previous,
        );
        const cost = searchTerms.find((term) => term.includes('cost'));
        expect(cost).toBeDefined();
        expect(searchTerms).toEqual(
            expect.arrayContaining(['tier', previous[0]]),
        );
        expect(searchTerms.indexOf(cost!)).toBeLessThan(
            searchTerms.indexOf(previous[0]),
        );
        expect(searchTerms).toHaveLength(12);
    });

    it('can omit speculative catalog candidates without altering the reference question', () => {
        const args = buildAgentArgs();
        args.messageHistory = [{ role: 'user', content: 'Explain met1' }];
        const messages = (seed?: string) =>
            getAgentMessages(
                args,
                [validExplore],
                mcpToolSetup(),
                {},
                new Map(),
                null,
                { types: [], totalCount: 0 },
                seed,
            );
        expect(JSON.stringify(messages())).toContain('Candidate fields');
        expect(messages('').at(-1)).toEqual({
            role: 'user',
            content: 'Explain met1',
        });
    });
    const systemPrompt: ModelMessage = {
        role: 'system',
        content: 'Cached system prompt',
        providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
        },
    };
    const messageHistory: ModelMessage[] = [
        { role: 'user', content: 'Question' },
    ];

    it('injects an uncached user message immediately after the system prompt', () => {
        const withoutBlock = buildAgentMessages({
            systemPrompt,
            compactionSummary: null,
            messageHistory,
            memoryBlock: null,
        });
        const withBlock = buildAgentMessages({
            systemPrompt,
            compactionSummary: null,
            messageHistory,
            memoryBlock: '<ld-memories></ld-memories>',
        });

        expect(withBlock[0]).toEqual(withoutBlock[0]);
        expect(withBlock[0]).toBe(systemPrompt);
        expect(withBlock[1]).toEqual({
            role: 'user',
            content: '<ld-memories></ld-memories>',
        });
        expect(withBlock[1]).not.toHaveProperty('providerOptions');
        expect(withBlock[2]).toEqual({ role: 'user', content: 'Question' });
    });

    it('does not inject memory without a block', () => {
        const messages = buildAgentMessages({
            systemPrompt,
            compactionSummary: null,
            messageHistory,
            memoryBlock: null,
        });

        expect(messages).toHaveLength(2);
        expect(messages[1]).toEqual({ role: 'user', content: 'Question' });
    });
});

describe('scopeAgentConversation', () => {
    const history: ModelMessage[] = [
        { role: 'user', content: 'Original user question' },
        { role: 'assistant', content: 'Coordinator investigation' },
    ];

    it('removes rebuilt thread, compaction, and memory context from workers', () => {
        expect(
            scopeAgentConversation({
                execution: {
                    mode: 'deep_research',
                    runUuid: 'run-1',
                    phase: 'investigating',
                    maxSteps: 5,
                    budget: {
                        maxTokens: 10_000,
                        maxToolCalls: 20,
                        maxWarehouseQueries: 10,
                        maxResultRows: 1_000,
                        maxSteps: 5,
                        deadlineMs: 600_000,
                    },
                    canUseRawSql: true,
                    initialTokenUsage: 0,
                    research: {
                        role: 'worker',
                        task: {
                            id: 'task-1',
                            question: 'Why?',
                            focus: 'Orders',
                        },
                        onFindings: vi.fn(),
                    },
                },
                messageHistory: history,
                compactionSummary: 'Coordinator summary',
                memoryBlock: 'Agent memory',
            }),
        ).toEqual({
            messageHistory: [
                {
                    role: 'user',
                    content:
                        'Carry out the isolated task packet in your system instructions.',
                },
            ],
            compactionSummary: null,
            memoryBlock: null,
        });
    });

    it('builds a worker prompt with a conversation kickoff and no coordinator text', () => {
        const args = buildAgentArgs({
            mode: 'deep_research',
            runUuid: 'run-1',
            phase: 'investigating',
            maxSteps: 5,
            budget: {
                maxTokens: 10_000,
                maxToolCalls: 20,
                maxWarehouseQueries: 10,
                maxResultRows: 1_000,
                maxSteps: 5,
                deadlineMs: 600_000,
            },
            canUseRawSql: true,
            initialTokenUsage: 0,
            research: {
                role: 'worker',
                task: { id: 'task-1', question: 'Why?', focus: 'Orders' },
                onFindings: vi.fn(),
            },
        });
        args.messageHistory = history;
        args.compactionSummary = 'Coordinator summary';
        args.toolHints = ['runSql'];
        args.forceToolHints = true;
        const messages = getAgentMessages(
            args,
            [],
            mcpToolSetup(),
            {},
            new Map(),
            'Agent memory',
            { types: [], totalCount: 0 },
        );

        expect(messages[0].role).toBe('system');
        expect(messages.slice(1)).toEqual([
            {
                role: 'user',
                content:
                    'Carry out the isolated task packet in your system instructions.',
            },
        ]);
        expect(JSON.stringify(messages)).not.toContain('Coordinator');
        expect(JSON.stringify(messages)).not.toContain(
            'Original user question',
        );
        expect(JSON.stringify(messages)).not.toContain('Agent memory');
        expect(messages[1].content).not.toContain('runSql');
        expect(
            buildForcedFirstStep(args, { runSql: {} as never }),
        ).toBeUndefined();
    });

    it('preserves coordinator conversation context', () => {
        expect(
            scopeAgentConversation({
                execution: {
                    mode: 'deep_research',
                    runUuid: 'run-1',
                    phase: 'planning',
                    maxSteps: 16,
                    budget: {
                        maxTokens: 10_000,
                        maxToolCalls: 20,
                        maxWarehouseQueries: 10,
                        maxResultRows: 1_000,
                        maxSteps: 16,
                        deadlineMs: 600_000,
                    },
                    canUseRawSql: true,
                    initialTokenUsage: 0,
                    research: { role: 'coordinator', runTask: vi.fn() },
                },
                messageHistory: history,
                compactionSummary: 'Coordinator summary',
                memoryBlock: 'Agent memory',
            }),
        ).toEqual({
            messageHistory: history,
            compactionSummary: 'Coordinator summary',
            memoryBlock: 'Agent memory',
        });
    });
});

describe('external MCP tool call activity', () => {
    it.each(['generate', 'stream'] as const)(
        'records a finished external MCP tool call from the %s path',
        async (mode) => {
            const args = buildAgentArgs();
            const dependencies = buildAgentDependencies(
                vi.fn().mockResolvedValue(undefined),
            );
            const recordMcpToolCall = vi.fn().mockResolvedValue(undefined);
            Object.assign(dependencies, {
                consumePromptSteers: async () => [],
                recordMcpToolCall,
            });
            const setup = {
                ...mcpToolSetup(),
                tools: {
                    mcp_issues_search: {
                        description: 'Search issues',
                        execute: vi.fn(),
                    },
                } as unknown as ToolSet,
                mcpToolNameToServerUuid: { mcp_issues_search: 'server-1' },
            };
            let options: AnyType;
            if (mode === 'generate') {
                vi.mocked(generateText).mockImplementationOnce((async (
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {
                        text: 'Answer',
                        steps: [{ usage: { totalTokens: 1 } }],
                        usage: { totalTokens: 1 },
                        finishReason: 'stop',
                    };
                }) as AnyType);
                await generateAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: setup,
                });
            } else {
                vi.mocked(streamText).mockImplementationOnce(((
                    captured: AnyType,
                ) => {
                    options = captured;
                    return {};
                }) as AnyType);
                await streamAgentResponse({
                    args,
                    dependencies,
                    mcpToolSetup: setup,
                });
            }

            const finish = (event: Record<string, unknown>) =>
                options.experimental_onToolCallFinish?.({
                    stepNumber: 0,
                    messages: [],
                    ...event,
                });
            await finish({
                toolCall: {
                    toolCallId: 'call-1',
                    toolName: 'mcp_issues_search',
                    input: { query: 'bug' },
                },
                toolOutput: {
                    type: 'tool-result' as const,
                    output: { content: [] },
                },
                toolExecutionMs: 42,
            });
            await finish({
                toolCall: {
                    toolCallId: 'call-2',
                    toolName: 'mcp_issues_search',
                    input: { query: 'boom' },
                },
                toolOutput: {
                    type: 'tool-error' as const,
                    error: new Error('upstream exploded'),
                },
                toolExecutionMs: 7,
            });
            // A tool-level MCP error comes back as a successful execute with
            // isError set, behind the untrusted-output notice
            await finish({
                toolCall: {
                    toolCallId: 'call-3',
                    toolName: 'mcp_issues_search',
                    input: { query: 'rate limited' },
                },
                toolOutput: {
                    type: 'tool-result' as const,
                    output: {
                        isError: true,
                        content: [
                            { type: 'text', text: MCP_UNTRUSTED_OUTPUT_NOTICE },
                            { type: 'text', text: 'Rate limit exceeded' },
                        ],
                    },
                },
                toolExecutionMs: 1.6,
            });
            // Built-in tools are not MCP activity
            await finish({
                toolCall: {
                    toolCallId: 'call-4',
                    toolName: 'findContent',
                    input: {},
                },
                toolOutput: { type: 'tool-result' as const, output: {} },
                toolExecutionMs: 1,
            });

            expect(recordMcpToolCall).toHaveBeenCalledTimes(3);
            expect(recordMcpToolCall).toHaveBeenNthCalledWith(1, {
                toolCallId: 'call-1',
                toolName: 'mcp_issues_search',
                toolArgs: { query: 'bug' },
                mcpServerUuid: 'server-1',
                status: 'success',
                errorMessage: null,
                durationMs: 42,
            });
            expect(recordMcpToolCall).toHaveBeenNthCalledWith(2, {
                toolCallId: 'call-2',
                toolName: 'mcp_issues_search',
                toolArgs: { query: 'boom' },
                mcpServerUuid: 'server-1',
                status: 'error',
                errorMessage: 'upstream exploded',
                durationMs: 7,
            });
            expect(recordMcpToolCall).toHaveBeenNthCalledWith(3, {
                toolCallId: 'call-3',
                toolName: 'mcp_issues_search',
                toolArgs: { query: 'rate limited' },
                mcpServerUuid: 'server-1',
                status: 'error',
                errorMessage: 'Rate limit exceeded',
                durationMs: 2,
            });
        },
    );
});
