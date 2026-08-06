import { APICallError, generateText, type ModelMessage } from 'ai';
import {
    registerAiUsageTracker,
    type AiUsageEvent,
} from '../../../../analytics/aiUsage';
import type {
    AiAgentArgs,
    AiAgentDependencies,
    AiDeepResearchExecutionRole,
} from '../types/aiAgent';
import { PROVIDER_BILLING_MESSAGE } from '../utils/errorMessages';
import {
    buildAgentMessages,
    buildDeepResearchExecutionContextSnapshot,
    buildForcedFirstStep,
    captureV3StreamBoundaries,
    generateAgentResponse,
    getAgentTools,
    getDeepResearchBudgetInstruction,
    getPromptMcpServers,
    getStepBudgetOverride,
    normalizeToolOutput,
    recordAgentStepUsage,
    storeInvalidAgentToolCall,
    withEarlyToolProgress,
    withMcpToolApprovals,
    type AgentMcpToolSetup,
} from './agentV2';

describe('captureV3StreamBoundaries', () => {
    it('persists an empty reasoning boundary before later tool chunks', async () => {
        const onChunk = vi.fn(async () => undefined);
        const transform = captureV3StreamBoundaries({ onChunk })({
            tools: {},
            stopStream: vi.fn(),
        });
        const writer = transform.writable.getWriter();
        const reader = transform.readable.getReader();
        const reasoningStart = {
            type: 'reasoning-start' as const,
            id: 'reasoning-1',
            providerMetadata: { openai: { itemId: 'rs_1' } },
        };
        const toolCall = {
            type: 'tool-call' as const,
            toolCallId: 'call-1',
            toolName: 'getMetadata',
            input: {},
        };

        const firstRead = reader.read();
        await writer.write(reasoningStart);
        await expect(firstRead).resolves.toMatchObject({
            value: reasoningStart,
        });
        const secondRead = reader.read();
        await writer.write(toolCall);
        await expect(secondRead).resolves.toMatchObject({ value: toolCall });

        expect(onChunk).toHaveBeenCalledTimes(1);
        expect(onChunk).toHaveBeenCalledWith(reasoningStart);

        await writer.close();
        await reader.cancel();
    });
});

describe('withMcpToolApprovals', () => {
    it('gates only ask-mode MCP tools on v3 runs', () => {
        const tools = {
            safe: { description: 'safe' },
            destructive: { description: 'destructive' },
        } as never;

        expect(withMcpToolApprovals(tools, ['destructive'], true)).toEqual({
            safe: { description: 'safe' },
            destructive: {
                description: 'destructive',
                needsApproval: true,
            },
        });
        expect(withMcpToolApprovals(tools, ['destructive'], false)).toBe(tools);
    });
});

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

describe('generateAgentResponse error persistence', () => {
    it('persists provider billing guidance for a self-managed key', async () => {
        const updatePrompt = vi.fn().mockResolvedValue(undefined);
        const dependencies = new Proxy(
            {
                listExplores: vi.fn().mockResolvedValue([]),
                updatePrompt,
            },
            {
                get: (target, property: string) =>
                    target[property as keyof typeof target] ?? vi.fn(),
            },
        ) as unknown as AiAgentDependencies;
        const args = {
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
            enableGrepFields: false,
            enablePreviewDeploySetup: false,
            enableRepoDiscovery: false,
            execution: { mode: 'standard', maxSteps: 10 },
            findExploresFieldSearchSize: 10,
            findFieldsPageSize: 10,
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
        } as unknown as AiAgentArgs;
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
                mcpToolSetup: {
                    tools: {},
                    mcpToolNameToServerUuid: {},
                    approvalRequiredToolNames: [],
                    unavailableMcpServers: [],
                    closeMcpClients: vi.fn().mockResolvedValue(undefined),
                },
            }),
        ).rejects.toBe(providerError);
        expect(updatePrompt).toHaveBeenCalledWith({
            promptUuid: 'prompt-1',
            errorMessage: PROVIDER_BILLING_MESSAGE,
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
                inputTokens: 10,
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
                inputTokens: 10,
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
                approvalRequiredToolNames: [],
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
            { discoverFields: { execute } } as never,
            updateProgress,
            true,
        );

        const execution = tools.discoverFields.execute?.({}, {
            toolCallId: 'tool-call-1',
        } as never);
        expect(execute).not.toHaveBeenCalled();

        resolveProgress();

        await expect(execution).resolves.toEqual(finalOutput);
        expect(execute).toHaveBeenCalledOnce();
    });

    it('preserves async iterable tools in the standard execution path', () => {
        const tools = withEarlyToolProgress(
            { discoverFields: streamingTool } as never,
            vi.fn().mockResolvedValue(undefined),
            false,
        );

        const execution = tools.discoverFields.execute?.({}, {
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
        approvalRequiredToolNames: [],
        unavailableMcpServers: [],
        closeMcpClients: () => Promise.resolve(),
    };

    const buildArgs = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        aiAgentMemoryEnabled?: boolean;
        canCreateDashboards?: boolean;
    }): AiAgentArgs =>
        ({
            canCreateDashboards: true,
            agentSettings: { name: 'test-agent' },
            autoApproveSql: false,
            autoApproveSqlUserUuid: null,
            availableSkills: [],
            callOptions: {},
            canManageAgent: false,
            canRunSql: true,
            debugLoggingEnabled: false,
            enableContentTools: false,
            enableDataAccess: false,
            enableEditProjectContext: false,
            enableGrepFields: false,
            enablePreviewDeploySetup: false,
            enableRepoDiscovery: false,
            execution: {
                mode: 'standard',
                maxSteps: 10,
            },
            findExploresFieldSearchSize: 10,
            findFieldsPageSize: 10,
            getDashboardChartsPageSize: 10,
            maxQueryLimit: 5000,
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
            userId: 'user-1',
            useSlackStreamCard: false,
            ...flags,
        }) as unknown as AiAgentArgs;

    const toolNames = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        aiAgentMemoryEnabled?: boolean;
        canCreateDashboards?: boolean;
    }) =>
        Object.keys(
            getAgentTools(buildArgs(flags), depsStub(), [], mcpStub, new Map()),
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

    it('exposes loadProjectContext when AI agent memory is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            aiAgentMemoryEnabled: true,
        });

        expect(names).toContain('loadProjectContext');
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
    ) =>
        Object.keys(
            getAgentTools(
                buildResearchArgs(research, canUseRawSql),
                depsStub(),
                [],
                {
                    ...mcpStub,
                    tools: {
                        mcp_github__create_issue: {} as never,
                        mcp_lightdash__run_metric_query: {} as never,
                        mcp_lightdash__run_sql: {} as never,
                    },
                },
                new Map(),
            ),
        );

    it('adds delegation while preserving inherited built-in and MCP tools for the coordinator', () => {
        const names = getResearchTools({
            role: 'coordinator',
            runTask: vi.fn(),
        });

        expect(names).toEqual(
            expect.arrayContaining([
                'delegateResearchTask',
                'editDbtProject',
                'generateVisualization',
                'loadMcpTools',
                'mcp_github__create_issue',
                'mcp_lightdash__run_sql',
            ]),
        );
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
