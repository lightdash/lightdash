import {
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    type AiDeepResearchExecutionContextSnapshot,
    type AnyType,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { type DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import { AiDeepResearchExecutor } from './AiDeepResearchExecutor';

const budget = {
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
        attachedMcpServers: [],
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
    entry_point: 'ask_ai',
    result_markdown: null,
    result_chart_data: null,
    report_expires_at: null,
    report_expired_at: null,
    budget_snapshot: budget,
    execution_context_snapshot: executionContextSnapshot,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
    token_usage_complete: null,
    duration_ms: null,
    tool_call_count: null,
    tool_error_count: null,
    warehouse_query_count: null,
    findings_count: null,
    chart_count: null,
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

const registeredAccount = ({
    authentication = { type: 'session' as const, source: '' },
    isActive = true,
}: {
    authentication?: RegisteredAccount['authentication'];
    isActive?: boolean;
} = {}): RegisteredAccount =>
    ({
        authentication,
        organization: {
            organizationUuid: 'org-1',
            name: 'Acme',
            createdAt: new Date('2026-01-01'),
        },
        user: {
            userUuid: 'user-1',
            id: 'user-1',
            type: 'registered',
            isActive,
        },
    }) as RegisteredAccount;

const buildExecutor = ({
    generateAgentThreadResponse = vi.fn().mockResolvedValue('researched'),
    provenance = [reportSubmission()],
}: {
    generateAgentThreadResponse?: AnyType;
    provenance?: AnyType[];
} = {}) => {
    let currentProvenance = provenance;
    const aiDeepResearchRunModel = {
        accumulateTokenUsage: vi.fn().mockResolvedValue(true),
        appendProgressEvent: vi.fn().mockResolvedValue(true),
        findByUuid: vi.fn().mockResolvedValue(run()),
        touch: vi.fn().mockResolvedValue(true),
        updateExecutionContextSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentModel = {
        getToolCallsAndResultsForPrompt: vi.fn(async () => currentProvenance),
    };
    const userService = {
        getAccountByUserUuidAndOrg: vi
            .fn()
            .mockResolvedValue(registeredAccount()),
    };
    const assertDeepResearchAccess = vi.fn().mockResolvedValue(undefined);
    const executor = new AiDeepResearchExecutor({
        aiAgentService: {
            assertDeepResearchAccess,
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
        assertDeepResearchAccess,
        setProvenance: (nextProvenance: AnyType[]) => {
            currentProvenance = nextProvenance;
        },
    };
};

describe('AiDeepResearchExecutor', () => {
    it('runs one iterative agent with the full budget and direct provenance', async () => {
        const queryUuid = '11111111-1111-4111-8111-111111111111';
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, options: AnyType) => {
                await options.execution.onStepUsage({
                    runUuid: 'run-1',
                    tokens: {
                        inputTokens: 70,
                        outputTokens: 30,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        reasoningTokens: 0,
                        totalTokens: 100,
                    },
                });
                await options.execution.onExecutionContextResolved(
                    executionContextSnapshot,
                );
                return 'researched';
            },
        );
        const { executor, aiAgentModel, aiDeepResearchRunModel } =
            buildExecutor({
                generateAgentThreadResponse,
                provenance: [
                    toolProvenance({
                        toolName: 'runSql',
                        toolCallId: 'query-1',
                        toolArgs: {},
                        result: JSON.stringify({ queryUuid }),
                    }),
                    reportSubmission(),
                ],
            });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'completed',
            report,
            warehouseQueryUuids: [queryUuid],
            terminalReason: null,
        });

        expect(generateAgentThreadResponse).toHaveBeenCalledTimes(1);
        expect(generateAgentThreadResponse.mock.calls[0][1]).toMatchObject({
            execution: {
                mode: 'deep_research',
                budget,
                initialTokenUsage: 0,
            },
        });
        expect(
            generateAgentThreadResponse.mock.calls[0][1].execution,
        ).not.toHaveProperty('research');
        expect(
            generateAgentThreadResponse.mock.calls[0][1].execution,
        ).not.toHaveProperty('parentToolCallId');
        expect(
            aiDeepResearchRunModel.accumulateTokenUsage,
        ).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({ totalTokens: 100 }),
        );
        expect(
            aiDeepResearchRunModel.updateExecutionContextSnapshot,
        ).toHaveBeenCalledWith('run-1', executionContextSnapshot);
        expect(
            aiAgentModel.getToolCallsAndResultsForPrompt,
        ).toHaveBeenLastCalledWith('prompt-1', {
            includeSubagentToolCalls: true,
        });
    });

    it('retries once with forced report submission', async () => {
        const generateAgentThreadResponse = vi.fn();
        const harness = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });
        generateAgentThreadResponse.mockImplementation(
            async (_user, options) => {
                if (generateAgentThreadResponse.mock.calls.length === 1) {
                    await options.execution.onStepUsage?.({
                        runUuid: 'run-1',
                        tokens: {
                            inputTokens: 30,
                            outputTokens: 20,
                            cacheReadTokens: 0,
                            cacheWriteTokens: 0,
                            reasoningTokens: 0,
                            totalTokens: 50,
                        },
                    });
                }
                if (generateAgentThreadResponse.mock.calls.length === 2) {
                    harness.setProvenance([reportSubmission()]);
                }
                return 'researched';
            },
        );

        await expect(
            harness.executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({ status: 'completed', report });

        expect(generateAgentThreadResponse).toHaveBeenCalledTimes(2);
        expect(generateAgentThreadResponse.mock.calls[1][1]).toMatchObject({
            toolHints: [AI_DEEP_RESEARCH_REPORT_TOOL_NAME],
            forceToolHints: true,
            includeSubagentToolCalls: true,
            execution: { initialTokenUsage: 50 },
        });
    });

    it('fails after one repair when no report is submitted', async () => {
        const generateAgentThreadResponse = vi
            .fn()
            .mockResolvedValue('no report');
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'Deep Research finished without submitting a report',
            terminalReason: 'provider_error',
        });
        expect(generateAgentThreadResponse).toHaveBeenCalledTimes(2);
    });

    it('keeps a report saved before the provider disconnects', async () => {
        const { executor } = buildExecutor({
            generateAgentThreadResponse: vi
                .fn()
                .mockRejectedValue(
                    new Error('provider disconnected after submission'),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({
            status: 'partially_completed',
            report,
            terminalReason: 'provider_error',
        });
    });

    it('returns an error when the provider fails without a report', async () => {
        const { executor } = buildExecutor({
            generateAgentThreadResponse: vi
                .fn()
                .mockRejectedValue(new Error('provider disconnected')),
            provenance: [],
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'provider disconnected',
            terminalReason: 'provider_error',
        });
    });

    it('does not start a run created by an inactive user', async () => {
        const harness = buildExecutor();
        harness.userService.getAccountByUserUuidAndOrg.mockResolvedValue(
            registeredAccount({ isActive: false }),
        );

        await expect(
            harness.executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage:
                'Deep Research cannot run because its creator is inactive',
            terminalReason: 'permission_revoked',
        });
        expect(harness.generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('starts a run created by an inactive service-account user', async () => {
        const harness = buildExecutor();
        harness.userService.getAccountByUserUuidAndOrg.mockResolvedValue(
            registeredAccount({
                authentication: {
                    type: 'service-account',
                    source: '',
                    serviceAccountUuid: 'service-account-1',
                    serviceAccountDescription: 'CI',
                },
                isActive: false,
            }),
        );

        await harness.executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(harness.generateAgentThreadResponse).toHaveBeenCalled();
    });

    it('does not start a run with persisted cancellation requested', async () => {
        const harness = buildExecutor();

        await expect(
            harness.executor.execute(
                run({ cancellation_requested_at: new Date() }),
                { signal: new AbortController().signal },
            ),
        ).resolves.toEqual({
            status: 'cancelled',
            terminalReason: 'user_cancellation',
        });
        expect(harness.generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('does not start when access is revoked', async () => {
        const harness = buildExecutor();
        harness.assertDeepResearchAccess.mockRejectedValue(
            new Error('Agent access was revoked'),
        );

        await expect(
            harness.executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'Agent access was revoked',
            terminalReason: 'permission_revoked',
        });
        expect(harness.generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('cancels the active research call', async () => {
        const controller = new AbortController();
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, options: AnyType) =>
                new Promise<string>((_resolve, reject) => {
                    options.execution.abortSignal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                    );
                }),
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });
        const pending = executor.execute(run(), {
            signal: controller.signal,
        });

        await vi.waitFor(() => {
            expect(generateAgentThreadResponse).toHaveBeenCalledTimes(1);
        });
        controller.abort();

        await expect(pending).resolves.toEqual({
            status: 'cancelled',
            terminalReason: 'internal_error',
        });
    });

    it('polls persisted cancellation while research is active', async () => {
        vi.useFakeTimers();
        try {
            const generateAgentThreadResponse = vi.fn(
                async (_user: SessionUser, options: AnyType) =>
                    new Promise<string>((_resolve, reject) => {
                        options.execution.abortSignal.addEventListener(
                            'abort',
                            () => reject(new Error('aborted')),
                        );
                    }),
            );
            const harness = buildExecutor({
                generateAgentThreadResponse,
                provenance: [],
            });
            harness.aiDeepResearchRunModel.findByUuid.mockResolvedValue(
                run({ cancellation_requested_at: new Date() }),
            );

            const pending = harness.executor.execute(run(), {
                signal: new AbortController().signal,
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(generateAgentThreadResponse).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1_000);

            await expect(pending).resolves.toEqual({
                status: 'cancelled',
                terminalReason: 'user_cancellation',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('rechecks access while research is active', async () => {
        vi.useFakeTimers();
        try {
            const generateAgentThreadResponse = vi.fn(
                async (_user: SessionUser, options: AnyType) =>
                    new Promise<string>((_resolve, reject) => {
                        options.execution.abortSignal.addEventListener(
                            'abort',
                            () => reject(new Error('aborted')),
                        );
                    }),
            );
            const harness = buildExecutor({
                generateAgentThreadResponse,
                provenance: [],
            });
            harness.assertDeepResearchAccess
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Agent access was revoked'));

            const pending = harness.executor.execute(run(), {
                signal: new AbortController().signal,
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(generateAgentThreadResponse).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(15_000);

            await expect(pending).resolves.toEqual({
                status: 'failed',
                errorMessage: 'Agent access was revoked',
                terminalReason: 'permission_revoked',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('enforces the tool-call budget', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, options: AnyType) => {
                await options.onStepProgress(
                    'Reading content',
                    'readContent',
                    'content-1',
                );
                await options.onStepProgress(
                    'Reading more content',
                    'readContent',
                    'content-2',
                );
            },
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxToolCalls: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'tool_limit',
        });
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxToolCalls');
    });

    it('enforces the warehouse-query budget', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, options: AnyType) => {
                await options.execution.onWarehouseQuery();
                await options.execution.onWarehouseQuery();
            },
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxWarehouseQueries: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'query_limit',
        });
    });

    it('enforces the token budget', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, options: AnyType) => {
                await options.execution.onStepUsage({
                    runUuid: 'run-1',
                    tokens: {
                        inputTokens: 80,
                        outputTokens: 21,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        reasoningTokens: 0,
                        totalTokens: 101,
                    },
                });
            },
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxTokens: 100 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'token_limit',
        });
    });

    it('uses the latest valid report when a later draft is invalid', async () => {
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
        ).resolves.toMatchObject({ status: 'completed', report });
    });
});
