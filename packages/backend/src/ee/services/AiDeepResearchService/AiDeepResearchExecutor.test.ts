import {
    type AiDeepResearchBudget,
    type AiDeepResearchExecutionContextSnapshot,
    type AnyType,
    type SessionUser,
} from '@lightdash/common';
import { type DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import { AI_DEEP_RESEARCH_REPORT_TOOL_NAME } from './AiDeepResearchAgent';
import { AiDeepResearchExecutor } from './AiDeepResearchExecutor';

const budget: AiDeepResearchBudget = {
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
};

const executionContextSnapshot: AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1,
    resolutionStage: 'execution',
    capturedAt: '2026-07-24T10:00:00.000Z',
    agent: {
        uuid: 'agent-1',
        name: 'Research agent',
        version: 2,
        updatedAt: '2026-07-24T09:00:00.000Z',
        hasInstruction: true,
        tags: null,
        spaceAccess: [],
        enableDataAccess: true,
        enableSelfImprovement: false,
        enableContentTools: false,
        enableUserContext: false,
    },
    model: {
        provider: 'anthropic',
        modelName: 'claude',
        reasoningEnabled: true,
        keyManagement: 'lightdash-managed',
    },
    tools: {
        availableToolNames: ['submitResearchReport'],
        selectedMcpServers: [],
    },
    knowledgeDocuments: [],
    repository: {
        projectContextEnabled: false,
        aiWritebackEnabled: false,
        codingAgentEnabled: false,
        previewDeploySetupEnabled: false,
        repoDiscoveryEnabled: false,
        repoFsRoot: null,
        repoFsSupportsCodeSearch: true,
        availableSkillNames: [],
    },
    effectivePermissions: {
        canManageAgent: false,
        canRunSql: true,
        canUseDataTools: true,
        canUseContentTools: false,
        canUseSelfImprovementTools: false,
        autoApproveSql: true,
    },
};

const report = {
    markdown: `Revenue remained stable overall, with high confidence.

## Baseline

<confidence level="high">Complete order history.</confidence>

The monthly trend was stable.

## Conclusion

- Revenue remained stable.`,
    charts: [],
};

const run = (
    overrides: Partial<DbAiDeepResearchRun> = {},
): DbAiDeepResearchRun => ({
    ai_deep_research_run_uuid: 'run-1',
    organization_uuid: 'org-1',
    project_uuid: 'project-1',
    created_by_user_uuid: 'user-1',
    agent_uuid: 'agent-1',
    ai_thread_uuid: 'thread-1',
    prompt_uuid: 'prompt-1',
    tool_call_id: null,
    prompt: 'Investigate revenue',
    status: 'running',
    selected_mcp_server_uuids: ['mcp-1'],
    result_markdown: null,
    result_chart_data: null,
    budget_snapshot: budget,
    execution_context_snapshot: executionContextSnapshot,
    error_message: null,
    cancellation_requested_at: null,
    started_at: new Date(),
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
});

const toolProvenance = ({
    toolName,
    toolCallId,
    toolArgs,
    result,
}: {
    toolName: string;
    toolCallId: string;
    toolArgs: object;
    result: string;
}) =>
    ({
        toolCall: {
            uuid: `call-${toolCallId}`,
            promptUuid: 'prompt-1',
            toolCallId,
            parentToolCallId: null,
            createdAt: new Date(),
            toolArgs,
            toolType: toolName.startsWith('mcp_') ? 'mcp' : 'built-in',
            toolName,
            mcpServer: toolName.startsWith('mcp_')
                ? { uuid: 'mcp-1', name: 'Analytics' }
                : undefined,
        },
        toolResult: {
            uuid: `result-${toolCallId}`,
            promptUuid: 'prompt-1',
            toolCallId,
            createdAt: new Date(),
            result,
            metadata: { status: 'success' },
            toolType: toolName.startsWith('mcp_') ? 'mcp' : 'built-in',
            toolName,
        },
        approvalDecision: null,
    }) as AnyType;

const reportSubmission = (toolCallId = 'report-1', input = report) =>
    toolProvenance({
        toolName: AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
        toolCallId,
        toolArgs: input,
        result: JSON.stringify({ submitted: true }),
    });

const buildExecutor = ({
    generateAgentThreadResponse = vi.fn().mockResolvedValue('done'),
    provenance = [reportSubmission()],
}: {
    generateAgentThreadResponse?: AnyType;
    provenance?: AnyType[];
} = {}) => {
    const session = {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        isActive: true,
    } as SessionUser;
    const aiDeepResearchRunModel = {
        appendProgressEvent: vi.fn().mockResolvedValue(true),
        findByUuid: vi.fn().mockResolvedValue(run()),
        touch: vi.fn().mockResolvedValue(true),
        updateExecutionContextSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentModel = {
        getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue(provenance),
    };
    const userService = {
        getSessionByUserUuidAndOrg: vi.fn().mockResolvedValue(session),
    };
    const executor = new AiDeepResearchExecutor({
        aiAgentService: {
            assertDeepResearchAccess: vi.fn().mockResolvedValue(undefined),
            generateAgentThreadResponse,
        },
        aiAgentModel: aiAgentModel as AnyType,
        aiDeepResearchRunModel: aiDeepResearchRunModel as AnyType,
        userService: userService as AnyType,
    });

    return {
        executor,
        generateAgentThreadResponse,
        aiAgentModel,
        aiDeepResearchRunModel,
        userService,
    };
};

describe('AiDeepResearchExecutor', () => {
    it('does not start a run created by an inactive user', async () => {
        const { executor, userService, generateAgentThreadResponse } =
            buildExecutor();
        userService.getSessionByUserUuidAndOrg.mockResolvedValue({
            userUuid: 'user-1',
            organizationUuid: 'org-1',
            isActive: false,
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage:
                'Deep Research cannot run because its creator is inactive',
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('executes the stored prompt with the full native agent runtime selection', async () => {
        const queryUuid = '11111111-1111-4111-8111-111111111111';
        const decoyQueryUuid = '22222222-2222-4222-8222-222222222222';
        const provenance = [
            toolProvenance({
                toolName: 'mcp_analytics__run_metric_query_2',
                toolCallId: 'query-1',
                toolArgs: { queryUuid: decoyQueryUuid },
                result: JSON.stringify({
                    content: [{ queryUuid }],
                }),
            }),
            reportSubmission(),
        ];
        const generateAgentThreadResponse = vi.fn(
            async (
                _user: SessionUser,
                options: {
                    execution: {
                        onExecutionContextResolved: (
                            snapshot: AiDeepResearchExecutionContextSnapshot,
                        ) => Promise<void>;
                    };
                },
            ) => {
                await options.execution.onExecutionContextResolved(
                    executionContextSnapshot,
                );
                return 'ignored';
            },
        );
        const { executor, userService, aiDeepResearchRunModel } = buildExecutor(
            {
                generateAgentThreadResponse,
                provenance: [
                    toolProvenance({
                        toolName: 'readContent',
                        toolCallId: 'content-1',
                        toolArgs: {},
                        result: JSON.stringify({ queryUuid: decoyQueryUuid }),
                    }),
                    ...provenance,
                ],
            },
        );
        const inputRun = run();

        const result = await executor.execute(inputRun, {
            signal: new AbortController().signal,
        });

        expect(userService.getSessionByUserUuidAndOrg).toHaveBeenCalledWith(
            'user-1',
            'org-1',
        );
        expect(generateAgentThreadResponse).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'user-1' }),
            expect.objectContaining({
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                promptUuid: 'prompt-1',
                autoApproveSql: true,
                execution: expect.objectContaining({
                    mode: 'deep_research',
                    budget,
                    selectedMcpServerUuids: ['mcp-1'],
                    abortSignal: expect.any(AbortSignal),
                    onStepUsage: expect.any(Function),
                    onWarehouseQuery: expect.any(Function),
                    onExecutionContextResolved: expect.any(Function),
                }),
                onStepProgress: expect.any(Function),
            }),
        );
        expect(result).toEqual({
            status: 'completed',
            report,
            warehouseQueryUuids: [queryUuid],
        });
        expect(
            aiDeepResearchRunModel.updateExecutionContextSnapshot,
        ).toHaveBeenCalledWith('run-1', executionContextSnapshot);
    });

    it('records unique tool progress and returns a partial report when a budget is exhausted', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (
                _user: SessionUser,
                options: {
                    onStepProgress: (
                        progress: string,
                        toolName: string,
                        toolCallId: string,
                    ) => Promise<void>;
                },
            ) => {
                await Promise.allSettled([
                    options.onStepProgress(
                        'Running query',
                        'runQuery',
                        'query-1',
                    ),
                    options.onStepProgress(
                        'Running query',
                        'runQuery',
                        'query-1',
                    ),
                    options.onStepProgress(
                        'Reading content',
                        'readContent',
                        'content-1',
                    ),
                ]);
            },
        );
        const { executor, aiDeepResearchRunModel } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        const result = await executor.execute(
            run({
                budget_snapshot: {
                    ...budget,
                    maxToolCalls: 1,
                },
            }),
            { signal: new AbortController().signal },
        );

        expect(
            aiDeepResearchRunModel.appendProgressEvent,
        ).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            status: 'partially_completed',
            warehouseQueryUuids: [],
            report: {
                charts: [],
            },
        });
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxToolCalls');
    });

    it('enforces every native warehouse execution, including multiple queries inside one tool', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (
                _user: SessionUser,
                options: {
                    execution: {
                        onWarehouseQuery: () => void;
                    };
                },
            ) => {
                options.execution.onWarehouseQuery();
                options.execution.onWarehouseQuery();
            },
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        const result = await executor.execute(
            run({
                budget_snapshot: {
                    ...budget,
                    maxWarehouseQueries: 1,
                },
            }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            warehouseQueryUuids: [],
        });
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxWarehouseQueries');
    });

    it('uses the latest valid submitted report when a later draft is invalid', async () => {
        const { executor } = buildExecutor({
            provenance: [
                reportSubmission('report-valid'),
                reportSubmission('report-invalid', {
                    markdown: 'No structured report',
                    charts: [],
                }),
            ],
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'completed',
            report,
            warehouseQueryUuids: [],
        });
    });

    it('returns the saved report when the model token budget is exhausted', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (
                _user: SessionUser,
                options: {
                    execution: {
                        onStepUsage: (tokens: number) => void;
                    };
                },
            ) => {
                options.execution.onStepUsage(600);
                options.execution.onStepUsage(500);
            },
        );
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        await expect(
            executor.execute(
                run({
                    budget_snapshot: {
                        ...budget,
                        maxTokens: 1_000,
                    },
                }),
                { signal: new AbortController().signal },
            ),
        ).resolves.toEqual({
            status: 'partially_completed',
            report,
            warehouseQueryUuids: [],
        });
    });

    it('returns a partial result when execution fails after a valid report was saved', async () => {
        const { executor } = buildExecutor({
            generateAgentThreadResponse: vi
                .fn()
                .mockRejectedValue(new Error('provider disconnected')),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'partially_completed',
            report,
            warehouseQueryUuids: [],
        });
    });

    it('fails when execution ends without a valid submitted report', async () => {
        const { executor } = buildExecutor({ provenance: [] });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'Deep Research finished without submitting a report',
        });
    });

    it('does not start an already cancelled run', async () => {
        const generateAgentThreadResponse = vi.fn();
        const { executor } = buildExecutor({ generateAgentThreadResponse });
        const controller = new AbortController();
        controller.abort();

        await expect(
            executor.execute(run(), { signal: controller.signal }),
        ).resolves.toEqual({ status: 'cancelled' });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });
});
