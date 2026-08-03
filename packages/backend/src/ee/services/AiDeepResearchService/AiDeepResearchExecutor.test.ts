import {
    type AiDeepResearchExecutionContextSnapshot,
    type AiDeepResearchHypothesis,
    type AiDeepResearchInvestigationReport,
    type AnyType,
    type SessionUser,
} from '@lightdash/common';
import { type DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import {
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    getAiDeepResearchPhaseBudgets,
} from './AiDeepResearchAgent';
import { AiDeepResearchExecutor } from './AiDeepResearchExecutor';

const budget = {
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
    maxHypotheses: 2,
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

const hypothesis = (index: number): AiDeepResearchHypothesis => ({
    id: `hypothesis-${index}`,
    claim: `Claim ${index}`,
    rationale: `Rationale ${index}`,
    supportingEvidence: `Supporting evidence ${index}`,
    falsifyingEvidence: `Falsifying evidence ${index}`,
});

const investigationReport = (
    overrides: Partial<AiDeepResearchInvestigationReport> = {},
): AiDeepResearchInvestigationReport => ({
    verdict: 'supported',
    summary: 'The evidence supports the claim.',
    evidence: [
        {
            finding: 'Orders dropped after the pricing change',
            queryUuids: [],
            sources: [],
        },
    ],
    alternativeExplanations: ['Seasonality'],
    causalLimitations: ['Correlation only; no controlled comparison'],
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

const researchRole = (options: AnyType) => options.execution.research?.role;

/**
 * A generateAgentThreadResponse stub that plays each phase's part: the
 * planner hands back hypotheses, investigators hand back reports, and the
 * judge relies on the mocked provenance for its submitted report.
 */
const respondByRole = ({
    onInvestigate,
}: {
    onInvestigate?: (options: AnyType) => Promise<string> | string;
} = {}) =>
    vi.fn(async (_user: SessionUser, options: AnyType) => {
        const { research } = options.execution;
        switch (research?.role) {
            case 'planner': {
                research.onHypotheses(
                    Array.from({ length: research.maxHypotheses }, (_, i) =>
                        hypothesis(i + 1),
                    ),
                );
                return 'planned';
            }
            case 'investigator': {
                if (onInvestigate) {
                    return onInvestigate(options);
                }
                research.onReport(investigationReport());
                return 'investigated';
            }
            default:
                return 'judged';
        }
    });

const buildExecutor = ({
    generateAgentThreadResponse = respondByRole(),
    provenance = [reportSubmission()],
    childProvenance = provenance,
}: {
    generateAgentThreadResponse?: AnyType;
    provenance?: AnyType[];
    childProvenance?: AnyType[];
} = {}) => {
    const session = {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        isActive: true,
    } as SessionUser;
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

const callsByRole = (mock: AnyType, role: string | undefined) =>
    mock.mock.calls.filter(
        ([, options]: AnyType[]) => researchRole(options) === role,
    );

describe('getAiDeepResearchPhaseBudgets', () => {
    it('reserves fixed capacity for planning and judging and splits the rest across investigators', () => {
        const phases = getAiDeepResearchPhaseBudgets(budget);

        expect(phases.planner.maxToolCalls).toBe(2);
        expect(phases.judge.maxToolCalls).toBe(4);
        // (20 - 2 - 4) / 2 hypotheses
        expect(phases.investigator.maxToolCalls).toBe(7);
        expect(phases.investigator.maxWarehouseQueries).toBe(5);
        expect(phases.investigator.maxResultRows).toBe(budget.maxResultRows);
    });

    it('scales per-hypothesis depth down as the hypothesis count grows', () => {
        const twoWay = getAiDeepResearchPhaseBudgets({
            ...budget,
            maxHypotheses: 2,
        });
        const sixWay = getAiDeepResearchPhaseBudgets({
            ...budget,
            maxHypotheses: 6,
        });

        expect(sixWay.investigator.maxToolCalls).toBeLessThan(
            twoWay.investigator.maxToolCalls,
        );
        expect(sixWay.investigator.maxToolCalls).toBeGreaterThanOrEqual(1);
        expect(sixWay.investigator.maxWarehouseQueries).toBeGreaterThanOrEqual(
            1,
        );
    });
});

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
            terminalReason: 'permission_revoked',
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
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
        });
        expect(generateAgentThreadResponse).not.toHaveBeenCalled();
    });

    it('plans, investigates every hypothesis, judges, and completes with child-row evidence', async () => {
        const queryUuid = '11111111-1111-4111-8111-111111111111';
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: async (options: AnyType) => {
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
                options.execution.research.onReport(investigationReport());
                return 'investigated';
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
                        result: JSON.stringify({ queryUuid }),
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
        ).toHaveBeenCalledTimes(2);
        expect(
            aiDeepResearchRunModel.accumulateTokenUsage,
        ).toHaveBeenCalledWith(
            'run-1',
            expect.objectContaining({ totalTokens: 100 }),
        );

        const plannerCalls = callsByRole(
            generateAgentThreadResponse,
            'planner',
        );
        const investigatorCalls = callsByRole(
            generateAgentThreadResponse,
            'investigator',
        );
        const judgeCalls = callsByRole(generateAgentThreadResponse, 'judge');
        expect(plannerCalls).toHaveLength(1);
        expect(investigatorCalls).toHaveLength(2);
        expect(judgeCalls).toHaveLength(1);

        expect(plannerCalls[0][1]).toMatchObject({
            toolHints: [AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME],
            forceToolHints: true,
            execution: {
                parentToolCallId: 'deep-research:run-1:planner',
                research: { maxHypotheses: 2 },
            },
        });

        const investigatorParents = investigatorCalls.map(
            ([, options]: AnyType[]) => options.execution.parentToolCallId,
        );
        expect(investigatorParents).toEqual([
            'deep-research:run-1:hypothesis-1',
            'deep-research:run-1:hypothesis-2',
        ]);
        investigatorCalls.forEach(([, options]: AnyType[]) => {
            expect(options.execution.budget).toMatchObject({
                maxToolCalls: 7,
                maxWarehouseQueries: 5,
            });
        });

        // The judge starts from the aggregate usage of every prior phase and
        // receives every investigation report.
        expect(judgeCalls[0][1].execution.initialTokenUsage).toBe(200);
        expect(judgeCalls[0][1].execution.parentToolCallId).toBeUndefined();
        expect(
            judgeCalls[0][1].execution.research.investigations.map(
                (investigation: AnyType) => ({
                    id: investigation.hypothesis.id,
                    hasReport: investigation.report !== null,
                }),
            ),
        ).toEqual([
            { id: 'hypothesis-1', hasReport: true },
            { id: 'hypothesis-2', hasReport: true },
        ]);

        expect(
            aiDeepResearchRunModel.updateExecutionContextSnapshot,
        ).toHaveBeenCalledWith('run-1', executionContextSnapshot);
        expect(
            aiAgentModel.getToolCallsAndResultsForPrompt,
        ).toHaveBeenLastCalledWith('prompt-1', {
            includeSubagentToolCalls: true,
        });
    });

    it('starts every investigator before any of them resolves', async () => {
        const started: Array<(value: string) => void> = [];
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: (options: AnyType) => {
                options.execution.research.onReport(investigationReport());
                return new Promise<string>((resolve) => {
                    started.push(resolve);
                });
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const pendingRun = executor.execute(run(), {
            signal: new AbortController().signal,
        });

        // Both investigators are in flight while neither has resolved —
        // the fan-out is deterministic, not sequential.
        await vi.waitFor(() => {
            expect(started).toHaveLength(2);
        });
        started.forEach((resolve) => resolve('investigated'));

        await expect(pendingRun).resolves.toMatchObject({
            status: 'completed',
        });
    });

    it('passes a failed investigation to the judge as unavailable without discarding successes', async () => {
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: (options: AnyType) => {
                if (
                    options.execution.research.hypothesis.id === 'hypothesis-2'
                ) {
                    throw new Error('warehouse credentials expired');
                }
                options.execution.research.onReport(investigationReport());
                return 'investigated';
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
        });

        const result = await executor.execute(
            run({ budget_snapshot: { ...budget, maxHypotheses: 3 } }),
            { signal: new AbortController().signal },
        );

        expect(result).toMatchObject({ status: 'completed' });
        const judgeCalls = callsByRole(generateAgentThreadResponse, 'judge');
        expect(judgeCalls).toHaveLength(1);
        expect(
            judgeCalls[0][1].execution.research.investigations.map(
                (investigation: AnyType) => ({
                    id: investigation.hypothesis.id,
                    hasReport: investigation.report !== null,
                    failureReason: investigation.failureReason,
                }),
            ),
        ).toEqual([
            {
                id: 'hypothesis-1',
                hasReport: true,
                failureReason: null,
            },
            {
                id: 'hypothesis-2',
                hasReport: false,
                failureReason: 'warehouse credentials expired',
            },
            {
                id: 'hypothesis-3',
                hasReport: true,
                failureReason: null,
            },
        ]);
    });

    it('fails with an actionable reason when fewer than two investigations complete', async () => {
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: () => {
                throw new Error('model provider unavailable');
            },
        });
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result.status).toBe('failed');
        expect(result.status === 'failed' && result.errorMessage).toContain(
            'requires at least two',
        );
        expect(result.status === 'failed' && result.errorMessage).toContain(
            'model provider unavailable',
        );
        expect(callsByRole(generateAgentThreadResponse, 'judge')).toHaveLength(
            0,
        );
    });

    it('fails when the planner does not submit hypotheses', async () => {
        const generateAgentThreadResponse = vi.fn(
            async (_user: SessionUser, _options: AnyType) => 'no submission',
        );
        const { executor } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [],
        });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toEqual({
            status: 'failed',
            errorMessage:
                'Deep Research could not produce competing hypotheses to investigate',
            terminalReason: 'provider_error',
        });
        expect(generateAgentThreadResponse).toHaveBeenCalledTimes(1);
    });

    it('aborts every in-flight investigator on cancellation and never starts the judge', async () => {
        const controller = new AbortController();
        const investigatorSignals: AbortSignal[] = [];
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: (options: AnyType) => {
                const signal: AbortSignal = options.execution.abortSignal;
                investigatorSignals.push(signal);
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
            expect(investigatorSignals).toHaveLength(2);
        });
        controller.abort();

        await expect(pendingRun).resolves.toEqual({
            status: 'cancelled',
            terminalReason: 'internal_error',
        });
        expect(investigatorSignals.every((signal) => signal.aborted)).toBe(
            true,
        );
        expect(callsByRole(generateAgentThreadResponse, 'judge')).toHaveLength(
            0,
        );
    });

    it('enforces the aggregate tool-call budget across parallel investigators', async () => {
        let investigatorIndex = 0;
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: async (options: AnyType) => {
                investigatorIndex += 1;
                await options.onStepProgress(
                    'Reading content',
                    'readContent',
                    `content-${investigatorIndex}`,
                );
                options.execution.research.onReport(investigationReport());
                return 'investigated';
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

        expect(result.status).toBe('partially_completed');
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxToolCalls');
        expect(callsByRole(generateAgentThreadResponse, 'judge')).toHaveLength(
            0,
        );
    });

    it('enforces the aggregate warehouse-query budget across parallel investigators', async () => {
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: async (options: AnyType) => {
                options.execution.onWarehouseQuery();
                options.execution.research.onReport(investigationReport());
                return 'investigated';
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

        expect(result.status).toBe('partially_completed');
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxWarehouseQueries');
    });

    it('enforces the aggregate token budget across phases', async () => {
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: async (options: AnyType) => {
                await options.execution.onStepUsage({
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
                options.execution.research.onReport(investigationReport());
                return 'investigated';
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

        expect(result.status).toBe('partially_completed');
        expect(result.terminalReason).toBe('token_limit');
        expect(
            result.status === 'partially_completed' && result.report.markdown,
        ).toContain('maxTokens');
        expect(callsByRole(generateAgentThreadResponse, 'judge')).toHaveLength(
            0,
        );
    });

    it('retries each investigator once with forced submission before giving up on it', async () => {
        const attemptsByHypothesis = new Map<string, number>();
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: (options: AnyType) => {
                const { research } = options.execution;
                const attempts =
                    (attemptsByHypothesis.get(research.hypothesis.id) ?? 0) + 1;
                attemptsByHypothesis.set(research.hypothesis.id, attempts);
                if (attempts === 2) {
                    expect(options.toolHints).toEqual([
                        AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
                    ]);
                    expect(options.forceToolHints).toBe(true);
                    research.onReport(investigationReport());
                }
                return 'investigated';
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        expect([...attemptsByHypothesis.values()]).toEqual([2, 2]);
    });

    it('keeps a submitted investigation report when the call crashes after submission', async () => {
        const generateAgentThreadResponse = respondByRole({
            onInvestigate: (options: AnyType) => {
                options.execution.research.onReport(investigationReport());
                throw new Error('provider disconnected after submission');
            },
        });
        const { executor } = buildExecutor({ generateAgentThreadResponse });

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed' });
        const judgeCalls = callsByRole(generateAgentThreadResponse, 'judge');
        expect(
            judgeCalls[0][1].execution.research.investigations.every(
                (investigation: AnyType) => investigation.report !== null,
            ),
        ).toBe(true);
    });

    it('retries the judge once with forced report submission when no report was submitted', async () => {
        const generateAgentThreadResponse = respondByRole();
        const { executor, aiAgentModel } = buildExecutor({
            generateAgentThreadResponse,
            provenance: [],
            childProvenance: [reportSubmission()],
        });
        // First top-level read (post-judge check) finds nothing; the forced
        // retry submits, and the final child-inclusive read returns it.
        aiAgentModel.getToolCallsAndResultsForPrompt.mockImplementation(
            async (_promptUuid: string, options?: AnyType) =>
                options?.includeSubagentToolCalls ? [reportSubmission()] : [],
        );

        const result = await executor.execute(run(), {
            signal: new AbortController().signal,
        });

        expect(result).toMatchObject({ status: 'completed', report });
        const judgeCalls = callsByRole(generateAgentThreadResponse, 'judge');
        expect(judgeCalls).toHaveLength(2);
        expect(judgeCalls[1][1]).toMatchObject({
            toolHints: [AI_DEEP_RESEARCH_REPORT_TOOL_NAME],
            forceToolHints: true,
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
            terminalReason: 'provider_error',
        });
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
            terminalReason: null,
        });
    });

    it('fails when execution ends without a valid submitted report', async () => {
        const { executor } = buildExecutor({
            provenance: [],
            childProvenance: [],
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
    });
});
