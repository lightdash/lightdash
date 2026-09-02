import { type AnyType } from '@lightdash/common';
import {
    APICallError,
    generateText,
    streamText,
    type ModelMessage,
    type ToolSet,
} from 'ai';
import {
    registerAiUsageTracker,
    type AiUsageEvent,
} from '../../../../analytics/aiUsage';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiDeepResearchExecutionRole,
} from '../types/aiAgent';
import {
    AiAgentEmptyResponseError,
    AiAgentStepCapReachedError,
    EMPTY_RESPONSE_MESSAGE,
    PROVIDER_BILLING_MESSAGE,
    STEP_CAP_REACHED_MESSAGE,
} from '../utils/errorMessages';
import {
    buildAgentMessages,
    buildDeepResearchExecutionContextSnapshot,
    buildForcedFirstStep,
    buildPrepareStep,
    generateAgentResponse,
    getAgentMessages,
    getAgentTools,
    getDeepResearchBudgetInstruction,
    getPromptMcpServers,
    getStepBudgetOverride,
    normalizeToolOutput,
    recordAgentStepUsage,
    scopeAgentConversation,
    storeInvalidAgentToolCall,
    streamAgentResponse,
    withEarlyToolProgress,
    type AgentMcpToolSetup,
} from './agentV2';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
    streamText: vi.fn(),
}));

const buildAgentDependencies = (
    updatePrompt: ReturnType<typeof vi.fn>,
    overrides: Partial<AiAgentDependencies> = {},
) =>
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
            ...overrides,
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

describe('tool-call provider metadata persistence', () => {
    it('stores a Google signature from a non-streaming tool call', async () => {
        const storeToolCall = vi.fn().mockResolvedValue(undefined);
        vi.mocked(generateText).mockImplementationOnce((async (
            options: AnyType,
        ) => {
            await options.onStepFinish({
                usage: { totalTokens: 10 },
                toolCalls: [
                    {
                        toolCallId: 'tool-call-1',
                        toolName: 'findExplores',
                        input: {},
                        providerMetadata: {
                            google: { signature: 'google-signature' },
                        },
                    },
                ],
                toolResults: [],
                text: 'Done',
            });
            return {
                text: 'Done',
                steps: [{}],
                usage: { totalTokens: 10 },
                finishReason: 'stop',
            };
        }) as AnyType);

        await generateAgentResponse({
            args: buildAgentArgs(),
            dependencies: buildAgentDependencies(vi.fn(), { storeToolCall }),
            mcpToolSetup: mcpToolSetup(),
        });

        expect(storeToolCall).toHaveBeenCalledWith(
            expect.objectContaining({
                toolCallId: 'tool-call-1',
                providerMetadata: {
                    provider: 'google',
                    signature: 'google-signature',
                },
            }),
        );
    });

    it('stores a Google signature from a streaming tool-call chunk', async () => {
        const storeToolCall = vi.fn().mockResolvedValue(undefined);
        const updateProgress = vi.fn().mockResolvedValue(undefined);
        let capturedOptions: AnyType;
        vi.mocked(streamText).mockImplementationOnce(((options: AnyType) => {
            capturedOptions = options;
            return {} as AnyType;
        }) as AnyType);

        await streamAgentResponse({
            args: buildAgentArgs(),
            dependencies: buildAgentDependencies(vi.fn(), {
                storeToolCall,
                updateProgress,
            }),
            mcpToolSetup: mcpToolSetup(),
        });
        capturedOptions.onChunk({
            chunk: {
                type: 'tool-call',
                toolCallId: 'tool-call-1',
                toolName: 'findExplores',
                input: {},
                providerMetadata: {
                    google: { signature: 'google-signature' },
                },
            },
        });

        await vi.waitFor(() => {
            expect(storeToolCall).toHaveBeenCalledWith(
                expect.objectContaining({
                    toolCallId: 'tool-call-1',
                    providerMetadata: {
                        provider: 'google',
                        signature: 'google-signature',
                    },
                }),
            );
        });
    });
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

describe('empty finishes and interrupts', () => {
    const emptyGenerateResult = {
        text: '',
        steps: [{}],
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
        await capturedOptions.onFinish({
            usage: { totalTokens: 10 },
            totalUsage: { totalTokens: 10 },
            steps: [{ text: '' }],
            reasoning: [],
            finishReason: 'tool-calls',
        });
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
                steps: stepTotals.map(() => ({})),
                usage: { totalTokens: stepTotals.at(-1) ?? 0 },
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

    it('persists matching figures for non-deep-research modes', async () => {
        const updatePrompt = await runWithSteps(
            { mode: 'standard', maxSteps: 10 },
            [12000, 31000],
        );

        expect(updatePrompt).toHaveBeenLastCalledWith({
            promptUuid: 'prompt-1',
            response: 'Answer',
            tokenUsage: {
                totalTokens: 31000,
                finalStepTotalTokens: 31000,
            },
            responseTiming: {
                startedAt: expect.any(String),
                firstTokenAt: null,
                finishedAt: expect.any(String),
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
            functionId: 'generateAgentResponse',
            metadata: {
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
                functionId: 'generateAgentResponse',
                metadata: {
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
        );

    const buildTools = (flags: ToolFlags) =>
        buildToolsForArgs(buildArgs(flags));

    const toolNames = (flags: ToolFlags) => Object.keys(buildTools(flags));

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
                    tools.generateVisualization.description?.includes(
                        'Filter expression syntax:',
                    ) ?? false,
                fieldValueSearchUsesExpressions:
                    tools.searchFieldValues.description?.includes(
                        'When filters is provided, pass one flat AND expression',
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

    it('exposes generateDataApp and iterateDataApp only when the data app gate is satisfied', () => {
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
        expect(withoutGate).not.toContain('generateDataApp');
        expect(withoutGate).not.toContain('iterateDataApp');
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
