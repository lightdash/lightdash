import {
    ForbiddenError,
    InvalidUser,
    type AiDeepResearchEvidencePack,
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchWorkerFindings,
    type AnyType,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { type DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import { AI_DEEP_RESEARCH_REPORT_TOOL_NAME } from './AiDeepResearchAgent';
import { AiDeepResearchExecutor } from './AiDeepResearchExecutor';
import { AiDeepResearchExecutorStageError } from './AiDeepResearchService';

const budget = {
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
    maxSteps: 16,
    deadlineMs: 600_000,
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
};

const taskInput = (index: number) => ({
    question: `Question ${index}`,
    focus: `Focus ${index}`,
});

const workerFindings = (
    overrides: Partial<AiDeepResearchWorkerFindings> = {},
): AiDeepResearchWorkerFindings => ({
    summary: 'The evidence supports the claim.',
    evidence: [
        {
            finding: 'Orders dropped after the pricing change',
            queryUuids: [],
            sources: [],
        },
    ],
    limitations: ['Correlation only; no controlled comparison'],
    confidence: 'medium',
    ...overrides,
});

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
    resume_from_run_uuid: null,
    status: 'running',
    terminal_reason: null,
    failure_stage: null,
    entry_point: 'ask_ai',
    result_markdown: null,
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
    warehouse_limit_prevented_count: null,
    warehouse_limit_retry_count: null,
    warehouse_limit_recovered_count: null,
    warehouse_limit_unrecovered_count: null,
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
    metadata = { status: 'success' },
}: {
    toolName: string;
    toolCallId: string;
    toolArgs: object;
    result: string;
    metadata?: object;
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
            metadata,
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

const researchRole = (options: AnyType) => options.execution.research?.role;

/**
 * A generateAgentThreadResponse stub that plays each role's part: the
 * coordinator drives the run and relies on the mocked provenance for its
 * submitted report, and workers hand back a findings packet.
 */
const respondByRole = ({
    onCoordinate,
    onWork,
    onFinalize,
}: {
    onCoordinate?: (options: AnyType) => Promise<string> | string;
    onWork?: (options: AnyType) => Promise<string> | string;
    onFinalize?: (options: AnyType) => Promise<string> | string;
} = {}) =>
    vi.fn(async (_user: SessionUser, options: AnyType) => {
        const { research } = options.execution;
        switch (research?.role) {
            case 'worker': {
                if (onWork) {
                    return onWork(options);
                }
                research.onFindings(workerFindings());
                return 'worked';
            }
            case 'finalizer':
                return onFinalize ? onFinalize(options) : 'finalized';
            default:
                return onCoordinate ? onCoordinate(options) : 'coordinated';
        }
    });

const evidencePack = (
    overrides: Partial<AiDeepResearchEvidencePack> = {},
): AiDeepResearchEvidencePack => ({
    question: 'Investigate revenue',
    generatedAt: '2026-08-13T10:00:00.000Z',
    timezone: 'Europe/London',
    queries: [
        {
            type: 'metric_query',
            queryUuid: '11111111-1111-4111-8111-111111111111',
            title: 'Revenue by month',
            description: 'Monthly revenue',
            dimensions: ['orders_order_month'],
            metrics: ['orders_total_revenue'],
            rowCount: 12,
            rowsCsv: 'Month,Revenue\n2026-01,100',
            truncated: false,
            warnings: [],
            filters: {},
            sorts: [],
            limit: 500,
            timezone: 'Europe/London',
            chartable: true,
            visualizationType: 'line',
        },
    ],
    workerFindings: [],
    ...overrides,
});

const evidenceBuildResult = (
    pack: AiDeepResearchEvidencePack = evidencePack(),
    hasEvidenceBuildFailures = false,
) => ({ evidencePack: pack, hasEvidenceBuildFailures });

const buildExecutor = ({
    generateAgentThreadResponse = respondByRole(),
    assertDeepResearchAccess = vi.fn().mockResolvedValue(undefined),
    provenance = [],
    childProvenance = provenance,
    generateDeepResearchReport = vi.fn().mockResolvedValue(report),
    buildEvidencePack = vi.fn().mockResolvedValue(evidenceBuildResult()),
}: {
    generateAgentThreadResponse?: AnyType;
    assertDeepResearchAccess?: AnyType;
    provenance?: AnyType[];
    childProvenance?: AnyType[];
    generateDeepResearchReport?: AnyType;
    buildEvidencePack?: AnyType;
} = {}) => {
    const aiDeepResearchRunModel = {
        accumulateTokenUsage: vi.fn().mockResolvedValue(true),
        appendProgressEvent: vi.fn().mockResolvedValue(true),
        findByUuid: vi.fn().mockResolvedValue(run()),
        touch: vi.fn().mockResolvedValue(true),
        updateExecutionContextSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    const aiAgentModel = {
        getToolCallsAndResultsForPrompt: vi.fn(
            async (_promptUuid: string, options?: AnyType) =>
                options?.includeSubagentToolCalls
                    ? childProvenance
                    : provenance,
        ),
    };
    const userService = {
        getAccountByUserUuidAndOrg: vi
            .fn()
            .mockResolvedValue(registeredAccount()),
    };
    const executor = new AiDeepResearchExecutor({
        aiAgentService: {
            assertDeepResearchAccess,
            generateAgentThreadResponse,
            generateDeepResearchReport,
        },
        aiAgentModel: aiAgentModel as AnyType,
        aiDeepResearchRunModel: aiDeepResearchRunModel as AnyType,
        userService: userService as AnyType,
        buildEvidencePack,
    });

    return {
        executor,
        generateAgentThreadResponse,
        generateDeepResearchReport,
        buildEvidencePack,
        aiAgentModel,
        aiDeepResearchRunModel,
        userService,
        assertDeepResearchAccess,
    };
};

const callsByRole = (mock: AnyType, role: string | undefined) =>
    mock.mock.calls.filter(
        ([, options]: AnyType[]) => researchRole(options) === role,
    );

describe('AiDeepResearchExecutor', () => {
    it('does not start a run created by an inactive user', async () => {
        const { executor, userService, generateAgentThreadResponse } =
            buildExecutor();
        userService.getAccountByUserUuidAndOrg.mockResolvedValue(
            registeredAccount({ isActive: false }),
        );

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage:
                'Deep Research cannot run because its creator is inactive',
            terminalReason: 'permission_revoked',
            failureStage: 'authorization',
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('starts a run created by an inactive service-account user', async () => {
        const { executor, userService, generateAgentThreadResponse } =
            buildExecutor();
        userService.getAccountByUserUuidAndOrg.mockResolvedValue(
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

        await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(generateAgentThreadResponse).toHaveBeenCalled();
    });

    it('propagates transient initial access-check errors for job retry', async () => {
        const temporaryError = new Error('temporary database error');
        const { executor, generateAgentThreadResponse } = buildExecutor({
            assertDeepResearchAccess: vi.fn().mockRejectedValue(temporaryError),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).rejects.toMatchObject({
            name: 'AiDeepResearchExecutorStageError',
            failureStage: 'authorization',
            cause: temporaryError,
        } satisfies Partial<AiDeepResearchExecutorStageError>);
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('classifies an explicit initial forbidden result as revocation', async () => {
        const { executor, generateAgentThreadResponse } = buildExecutor({
            assertDeepResearchAccess: vi
                .fn()
                .mockRejectedValue(new ForbiddenError('Access revoked')),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'Access revoked',
            terminalReason: 'permission_revoked',
            failureStage: 'authorization',
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('classifies a missing initial organization membership as revocation', async () => {
        const { executor, userService, generateAgentThreadResponse } =
            buildExecutor();
        userService.getAccountByUserUuidAndOrg.mockRejectedValue(
            new InvalidUser('User is no longer an organization member'),
        );

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({ terminalReason: 'permission_revoked' });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('retries transient periodic access-check errors without aborting the run', async () => {
        vi.useFakeTimers();
        let finishCoordinator: ((value: string) => void) | undefined;
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: () =>
                new Promise<string>((resolve) => {
                    finishCoordinator = resolve;
                }),
        });
        const assertDeepResearchAccess = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('temporary database error'))
            .mockResolvedValue(undefined);
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            assertDeepResearchAccess,
        });

        const pending = executor.execute(run(), {
            signal: new AbortController().signal,
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(assertDeepResearchAccess).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(15_000);
        expect(assertDeepResearchAccess).toHaveBeenCalledTimes(3);
        finishCoordinator?.('coordinated');

        await expect(pending).resolves.toMatchObject({ status: 'completed' });
        vi.useRealTimers();
    });

    it('aborts when a periodic access check explicitly returns forbidden', async () => {
        vi.useFakeTimers();
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: (options: AnyType) =>
                new Promise<string>((_resolve, reject) => {
                    options.execution.abortSignal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                    );
                }),
        });
        const assertDeepResearchAccess = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new ForbiddenError('Access revoked'));
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            assertDeepResearchAccess,
        });

        const pending = executor.execute(run(), {
            signal: new AbortController().signal,
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(15_000);

        await expect(pending).resolves.toMatchObject({
            status: 'failed',
            terminalReason: 'permission_revoked',
        });
        vi.useRealTimers();
    });

    it('aborts when the creator loses organization membership', async () => {
        vi.useFakeTimers();
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: (options: AnyType) =>
                new Promise<string>((_resolve, reject) => {
                    options.execution.abortSignal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                    );
                }),
        });
        const { executor, userService } = buildExecutor({
            generateAgentThreadResponse,
        });
        userService.getAccountByUserUuidAndOrg
            .mockResolvedValueOnce(registeredAccount())
            .mockRejectedValueOnce(
                new InvalidUser('User is no longer an organization member'),
            );

        const pending = executor.execute(run(), {
            signal: new AbortController().signal,
        });
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(15_000);

        await expect(pending).resolves.toMatchObject({
            status: 'failed',
            terminalReason: 'permission_revoked',
        });
        vi.useRealTimers();
    });

    it('does not start an already cancelled run', async () => {
        const generateAgentThreadResponse = vi.fn();
        const { executor } = buildExecutor({ generateAgentThreadResponse });
        const controller = new AbortController();
        controller.abort();

        await expect(
            executor.execute(run(), { signal: controller.signal }),
        ).resolves.toEqual({
            status: 'cancelled',
            terminalReason: 'internal_error',
            failureStage: 'authorization',
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('coordinates the run, delegates bounded tasks, and completes with child-row evidence', async () => {
        const queryUuid = '11111111-1111-4111-8111-111111111111';
        const delegated: AnyType[] = [];
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.execution.onStepUsage({
                    runUuid: 'run-1',
                    phase: options.execution.phase,
                    tokens: {
                        inputTokens: 70,
                        outputTokens: 30,
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        reasoningTokens: 0,
                        totalTokens: 100,
                    },
                });
                await options.execution.onExecutionContextResolved?.(
                    executionContextSnapshot,
                );
                delegated.push(
                    await options.execution.research.runTask(taskInput(1)),
                );
                return 'coordinated';
            },
        });
        const { executor, aiDeepResearchRunModel, aiAgentModel } =
            buildExecutor({
                generateAgentThreadResponse,
                provenance: [reportSubmission()],
                childProvenance: [
                    toolProvenance({
                        toolName: 'runSql',
                        toolCallId: 'query-1',
                        toolArgs: {},
                        // A warehouse tool's result is the text the model
                        // reads, not JSON; the execution id is in metadata.
                        result: `Returned 30 rows. This execution's queryUuid is ${queryUuid}; use exactly this value to reference it.`,
                        metadata: { status: 'success', queryUuid },
                    }),
                    reportSubmission(),
                ],
            });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toEqual({
            status: 'completed',
            report,
            warehouseQueryUuids: [queryUuid],
            terminalReason: null,
        });
        expect(
            aiDeepResearchRunModel.accumulateTokenUsage,
        ).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({ totalTokens: 100 }),
        );

        const coordinatorCalls = callsByRole(
            generateAgentThreadResponse,
            'coordinator',
        );
        const workerCalls = callsByRole(generateAgentThreadResponse, 'worker');
        expect(coordinatorCalls).toHaveLength(1);
        expect(workerCalls).toHaveLength(1);

        // The coordinator is the top-level call and owns the report.
        expect(
            coordinatorCalls[0][1].execution.parentToolCallId,
        ).toBeUndefined();
        expect(coordinatorCalls[0][1].execution.budget).toMatchObject({
            maxToolCalls: 20,
            maxWarehouseQueries: 10,
        });

        // The worker is scoped to its own task and a slice of the budget.
        expect(workerCalls[0][1].execution.parentToolCallId).toBe(
            'deep-research:run-1:task-1',
        );
        expect(workerCalls[0][1].execution.research.task).toMatchObject({
            id: 'task-1',
            question: 'Question 1',
        });
        expect(workerCalls[0][1].execution.budget).toMatchObject({
            maxToolCalls: 6,
            maxWarehouseQueries: 3,
        });
        expect(delegated[0]).toMatchObject({
            task: { id: 'task-1' },
            findings: workerFindings(),
            failureReason: null,
        });

        expect(
            aiDeepResearchRunModel.updateExecutionContextSnapshot,
        ).toHaveBeenCalledWith('run-1', executionContextSnapshot);
        expect(
            aiAgentModel.getToolCallsAndResultsForPrompt,
        ).toHaveBeenLastCalledWith('prompt-1', {
            includeSubagentToolCalls: true,
        });
    });

    it('completes without starting any worker when the coordinator does not delegate', async () => {
        const generateAgentThreadResponse = respondByRole();
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        expect(callsByRole(generateAgentThreadResponse, 'worker')).toHaveLength(
            0,
        );
    });

    it('refuses delegation past the worker cap and tells the coordinator to do it itself', async () => {
        const outcomes: AnyType[] = [];
        const generateAgentThreadResponse = respondByRole({
            // Delegated one at a time: the third must see the cap already used.
            onCoordinate: async (options: AnyType) => {
                const { runTask } = options.execution.research;
                outcomes.push(await runTask(taskInput(1)));
                outcomes.push(await runTask(taskInput(2)));
                outcomes.push(await runTask(taskInput(3)));
                return 'coordinated';
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        // Only two workers ever run, whatever the coordinator asks for.
        expect(callsByRole(generateAgentThreadResponse, 'worker')).toHaveLength(
            2,
        );
        expect(outcomes.map((outcome) => outcome.findings !== null)).toEqual([
            true,
            true,
            false,
        ]);
        expect(outcomes[2].failureReason).toContain(
            'Investigate this question yourself',
        );
    });

    it('returns a worker failure to the coordinator without ending the run', async () => {
        const outcomes: AnyType[] = [];
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                outcomes.push(
                    await options.execution.research.runTask(taskInput(1)),
                );
                return 'coordinated';
            },
            onWork: () => {
                throw new Error('warehouse credentials expired');
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        expect(outcomes[0]).toMatchObject({
            task: { id: 'task-1' },
            findings: null,
            failureReason: 'warehouse credentials expired',
        });
    });

    it('keeps submitted worker findings when the worker call crashes after submission', async () => {
        const outcomes: AnyType[] = [];
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                outcomes.push(
                    await options.execution.research.runTask(taskInput(1)),
                );
                return 'coordinated';
            },
            onWork: (options: AnyType) => {
                options.execution.research.onFindings(workerFindings());
                throw new Error('provider disconnected after submission');
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        expect(outcomes[0]).toMatchObject({
            findings: workerFindings(),
            failureReason: null,
        });
    });

    it('keeps provider failure when worker findings were not rebuilt after a crash', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.execution.research.runTask(taskInput(1));
                return 'coordinated';
            },
            onWork: (options: AnyType) => {
                options.execution.research.onFindings(workerFindings());
                throw new Error('provider disconnected after submission');
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                    ),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({
            status: 'failed',
            terminalReason: 'provider_error',
        });
    });

    it('aborts an in-flight worker on cancellation', async () => {
        const controller = new AbortController();
        const workerSignals: AbortSignal[] = [];
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: (options: AnyType) =>
                options.execution.research
                    .runTask(taskInput(1))
                    .then(() => 'coordinated'),
            onWork: (options: AnyType) => {
                const signal: AbortSignal = options.execution.abortSignal;
                workerSignals.push(signal);
                return new Promise<string>((_resolve, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new Error('aborted')),
                    );
                });
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const pendingRun = executor.execute(run(), {
            signal: controller.signal,
        });
        await vi.waitFor(() => {
            expect(workerSignals).toHaveLength(1);
        });
        controller.abort();

        await expect(pendingRun).resolves.toEqual({
            status: 'cancelled',
            terminalReason: 'internal_error',
            failureStage: 'investigation',
        });
        expect(workerSignals.every((signal) => signal.aborted)).toBe(true);
    });

    it('enforces the aggregate tool-call budget across the coordinator and its workers', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.onStepProgress(
                    'Reading content',
                    'readContent',
                    'content-1',
                );
                await options.onStepProgress(
                    'Reading content',
                    'readContent',
                    'content-2',
                );
                return 'coordinated';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxToolCalls: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'tool_limit',
            failureStage: 'investigation',
            report,
        });
    });

    it('enforces the aggregate warehouse-query budget across the coordinator and its workers', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.execution.research.runTask(taskInput(1));
                return 'coordinated';
            },
            onWork: (options: AnyType) => {
                options.execution.onWarehouseQuery();
                options.execution.onWarehouseQuery();
                options.execution.research.onFindings(workerFindings());
                return 'worked';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxWarehouseQueries: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'query_limit',
            failureStage: 'investigation',
            report,
        });
    });

    it('enforces the aggregate token budget across the coordinator and its workers', async () => {
        const reportUsage = (options: AnyType) =>
            options.execution.onStepUsage({
                runUuid: 'run-1',
                phase: options.execution.phase,
                tokens: {
                    inputTokens: 40,
                    outputTokens: 20,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    reasoningTokens: 0,
                    totalTokens: 60,
                },
            });
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await reportUsage(options);
                await options.execution.research.runTask(taskInput(1));
                return 'coordinated';
            },
            onWork: async (options: AnyType) => {
                await reportUsage(options);
                options.execution.research.onFindings(workerFindings());
                return 'worked';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxTokens: 100 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'token_limit',
            failureStage: 'investigation',
            report,
        });
    });

    it('stops the run at its wall-clock deadline and keeps what it has', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: (options: AnyType) =>
                new Promise<string>((_resolve, reject) => {
                    options.execution.abortSignal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                    );
                }),
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, deadlineMs: 50 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'time_limit',
            failureStage: 'investigation',
            report,
        });
    });

    it('refuses new delegation once the run passes its soft stop', async () => {
        const outcomes: AnyType[] = [];
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                // 3 of 4 tool calls is past the 0.75 soft-stop ratio.
                await options.onStepProgress('a', 'readContent', 'call-1');
                await options.onStepProgress('b', 'readContent', 'call-2');
                await options.onStepProgress('c', 'readContent', 'call-3');
                outcomes.push(
                    await options.execution.research.runTask(taskInput(1)),
                );
                return 'coordinated';
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxToolCalls: 4 } }),
            { signal: new AbortController().signal },
        );

        // The run still completes — the soft stop redirects, it does not abort.
        expect(result).toMatchObject({ status: 'completed' });
        expect(callsByRole(generateAgentThreadResponse, 'worker')).toHaveLength(
            0,
        );
        expect(outcomes[0].failureReason).toContain('submit the report');
    });

    it('reports from evidence after a budget abort instead of returning a stub', async () => {
        const resolvedExecutionContextSnapshot = {
            ...executionContextSnapshot,
            model: {
                ...executionContextSnapshot.model,
                provider: 'anthropic.messages',
                modelName: 'claude-sonnet-selected-for-run',
            },
        };
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.execution.onExecutionContextResolved(
                    resolvedExecutionContextSnapshot,
                );
                options.execution.onWarehouseQuery();
                options.execution.onWarehouseQuery();
                return 'coordinated';
            },
        });
        const { executor, generateDeepResearchReport, buildEvidencePack } =
            buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxWarehouseQueries: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({
            status: 'partially_completed',
            terminalReason: 'query_limit',
            report,
        });
        expect(buildEvidencePack).toHaveBeenCalledTimes(1);
        expect(generateDeepResearchReport).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                reason: 'the maxWarehouseQueries budget was exhausted',
                model: resolvedExecutionContextSnapshot.model,
            }),
        );
    });

    it('reports from evidence even when the research loop finished cleanly', async () => {
        const { executor, generateDeepResearchReport } = buildExecutor();

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        // One mechanism writes the report, whatever happened to the loop.
        expect(result).toMatchObject({ status: 'completed', report });
        expect(generateDeepResearchReport).toHaveBeenCalledTimes(1);
    });

    it('does not finalize when the coordinator already submitted a report', async () => {
        const generateAgentThreadResponse = respondByRole();
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(
            callsByRole(generateAgentThreadResponse, 'finalizer'),
        ).toHaveLength(0);
    });

    it('does not finalize a run the user cancelled', async () => {
        const controller = new AbortController();
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: (options: AnyType) =>
                new Promise<string>((_resolve, reject) => {
                    options.execution.abortSignal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                    );
                }),
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const pendingRun = executor.execute(run(), {
            signal: controller.signal,
        });
        await vi.waitFor(() => {
            expect(generateAgentThreadResponse).toHaveBeenCalled();
        });
        controller.abort();

        await expect(pendingRun).resolves.toMatchObject({
            status: 'cancelled',
        });
        expect(
            callsByRole(generateAgentThreadResponse, 'finalizer'),
        ).toHaveLength(0);
    });

    it('keeps the stub report when finalization itself fails', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                options.execution.onWarehouseQuery();
                options.execution.onWarehouseQuery();
                return 'coordinated';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            generateDeepResearchReport: vi
                .fn()
                .mockRejectedValue(new Error('provider unavailable')),
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxWarehouseQueries: 1 } }),
            { signal: new AbortController().signal },
        );

        expect(result.status).toBe('partially_completed');
        expect(result).toMatchObject({ failureStage: 'investigation' });
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxWarehouseQueries');
    });

    it('does not give the research loop a way to submit a report', async () => {
        const generateAgentThreadResponse = respondByRole();
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        // Exactly one coordinator pass, and no forced submission retry.
        const coordinatorCalls = callsByRole(
            generateAgentThreadResponse,
            'coordinator',
        );
        expect(coordinatorCalls).toHaveLength(1);
        expect(coordinatorCalls[0][1].toolHints).toBeUndefined();
        expect(coordinatorCalls[0][1].forceToolHints).toBeUndefined();
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
            terminalReason: 'provider_error',
            failureStage: 'investigation',
        });
    });

    it('uses the latest valid submitted report when a later draft is invalid', async () => {
        const { executor } = buildExecutor({
            provenance: [
                reportSubmission('report-valid'),
                reportSubmission('report-invalid', {
                    markdown: 'No structured report',
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
            terminalReason: null,
        });
    });

    it('classifies a run that found no relevant data', async () => {
        const { executor, generateDeepResearchReport } = buildExecutor({
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                    ),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage:
                'Deep Research could not find relevant data for this question.',
            terminalReason: 'no_relevant_data',
            failureStage: 'finalization',
        });
        // No point paying a model to write a report with nothing behind it.
        expect(generateDeepResearchReport).not.toHaveBeenCalled();
    });

    it('keeps provider failure when a worker failed before the pack stayed empty', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                await options.execution.research.runTask(taskInput(1));
                return 'coordinated';
            },
            onWork: () => {
                throw new Error('provider disconnected');
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                    ),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({
            status: 'failed',
            terminalReason: 'provider_error',
        });
    });

    it('keeps provider failure when evidence could not be rebuilt', async () => {
        const { executor } = buildExecutor({
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                        true,
                    ),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({
            status: 'failed',
            terminalReason: 'provider_error',
        });
    });

    it('keeps provider failure when the coordinator failed with an empty pack', async () => {
        const { executor } = buildExecutor({
            generateAgentThreadResponse: vi
                .fn()
                .mockRejectedValue(new Error('provider disconnected')),
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                    ),
                ),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toEqual({
            status: 'failed',
            errorMessage: 'provider disconnected',
            terminalReason: 'provider_error',
            failureStage: 'investigation',
        });
    });

    it('keeps a partial result when the budget ended with an empty pack', async () => {
        const generateAgentThreadResponse = respondByRole({
            onCoordinate: async (options: AnyType) => {
                options.execution.onWarehouseQuery();
                options.execution.onWarehouseQuery();
                return 'coordinated';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(
                    evidenceBuildResult(
                        evidencePack({ queries: [], workerFindings: [] }),
                    ),
                ),
        });

        await expect(
            executor.execute(
                run({
                    budget_snapshot: { ...budget, maxWarehouseQueries: 1 },
                }),
                { signal: new AbortController().signal },
            ),
        ).resolves.toMatchObject({
            status: 'partially_completed',
            terminalReason: 'query_limit',
        });
    });

    it('keeps evidence as a partial result when clean-run finalization fails', async () => {
        const { executor } = buildExecutor({
            generateDeepResearchReport: vi
                .fn()
                .mockRejectedValue(new Error('provider unavailable')),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({
            status: 'partially_completed',
            terminalReason: 'provider_error',
            failureStage: 'finalization',
        });
    });

    it.each([
        [
            'a verified zero-row query',
            evidencePack({
                queries: [
                    {
                        ...evidencePack().queries[0],
                        rowCount: 0,
                        rowsCsv: '',
                    },
                ],
            }),
        ],
        [
            'worker findings without a query',
            evidencePack({
                queries: [],
                workerFindings: [workerFindings()],
            }),
        ],
    ])('finalizes %s as evidence', async (_name, pack) => {
        const { executor, generateDeepResearchReport } = buildExecutor({
            buildEvidencePack: vi
                .fn()
                .mockResolvedValue(evidenceBuildResult(pack)),
        });

        await expect(
            executor.execute(run(), {
                signal: new AbortController().signal,
            }),
        ).resolves.toMatchObject({ status: 'completed' });
        expect(generateDeepResearchReport).toHaveBeenCalledOnce();
    });
});
