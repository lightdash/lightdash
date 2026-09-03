import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AiResultType,
    AnyType,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type AiDeepResearchBudget,
    type AiDeepResearchExecutionContextSnapshot,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { AiDeepResearchActiveRunError } from '../../models/AiDeepResearchRunModel';
import {
    AiDeepResearchExecutorStageError,
    AiDeepResearchService,
    getAiDeepResearchRunBudget,
} from './AiDeepResearchService';

const budget: AiDeepResearchBudget = {
    maxTokens: 10_000_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
    maxSteps: 16,
    deadlineMs: 600_000,
};

const executionContextSnapshot: AiDeepResearchExecutionContextSnapshot = {
    schemaVersion: 1,
    resolutionStage: 'preflight',
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
        provider: null,
        modelName: null,
        reasoningEnabled: null,
        keyManagement: null,
    },
    tools: {
        availableToolNames: [],
        attachedMcpServers: [],
    },
    knowledgeDocuments: [],
    repository: {
        projectContextEnabled: null,
        aiWritebackEnabled: null,
        codingAgentEnabled: null,
        previewDeploySetupEnabled: null,
        repoDiscoveryEnabled: null,
        repoFsRoot: null,
        repoFsSupportsCodeSearch: null,
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

const chart = {
    source: 'warehouse' as const,
    queryUuid: '7c4b40ba-79f8-4fd2-9c43-223eca8fa76f',
    title: 'Revenue trend',
    chartConfig: {
        defaultVizType: 'line' as const,
        xAxisDimension: 'orders_order_month',
        yAxisMetrics: ['orders_total_revenue'],
        groupBy: null,
        xAxisType: 'time' as const,
        stackBars: null,
        lineType: 'line' as const,
        funnelDataInput: null,
        xAxisLabel: 'Month',
        yAxisLabel: 'Revenue',
        secondaryYAxisMetric: null,
        secondaryYAxisLabel: null,
    },
};

const chartRef = `<chart id="${chart.queryUuid}" title="${chart.title}" description="Revenue remained stable across the period.">`;

const reportMarkdown = `Revenue held steady overall, with high confidence.

## Baseline

<confidence level="high">Complete order history.</confidence>

The baseline trend is stable.

## Conclusion

- Revenue held steady.
`;

const report = { markdown: reportMarkdown };

const persistedMetrics = {
    duration_ms: 5_000,
    input_tokens: 150,
    output_tokens: 100,
    cache_read_tokens: 200,
    cache_write_tokens: 50,
    reasoning_tokens: 25,
    total_tokens: 500,
    token_usage_complete: true,
    tool_call_count: 2,
    tool_error_count: 1,
    warehouse_query_count: 1,
    findings_count: 1,
    chart_count: 0,
};

const chartReportMarkdown = reportMarkdown.replace(
    'The baseline trend is stable.',
    `The baseline trend is stable.\n\n${chartRef}`,
);

const chartReport = { markdown: chartReportMarkdown };

const chartToolArgs = {
    title: chart.title,
    description: 'Revenue remained stable across the period.',
    queryConfig: {
        exploreName: 'orders',
        dimensions: chart.chartConfig.xAxisDimension
            ? [chart.chartConfig.xAxisDimension]
            : [],
        metrics: chart.chartConfig.yAxisMetrics ?? [],
        sorts: [],
        limit: 500,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: chart.chartConfig,
};

const chartProvenance = (runUuid = 'run-1') => [
    {
        toolCall: {
            toolName: 'generateVisualization',
            toolArgs: chartToolArgs,
            parentToolCallId: `deep-research:${runUuid}:hypothesis-1`,
        },
        toolResult: {
            metadata: {
                status: 'success',
                queryUuid: chart.queryUuid,
            },
        },
    },
];

const userWithProjectAccess = (): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('view', 'Project', {
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
    });
    can('create', 'AiDeepResearch', {
        organizationUuid: 'org-1',
        projectUuid: 'project-1',
    });
    can('manage', 'PersonalAccessToken', {
        organizationUuid: 'org-1',
    });
    return {
        userUuid: 'user-1',
        organizationUuid: 'org-1',
        organizationName: 'Acme',
        organizationCreatedAt: new Date(),
        role: 'member',
        ability: build(),
    } as AnyType;
};

const runRow = (overrides: Record<string, unknown> = {}) => ({
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
    status: 'queued',
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
    findings_count: null,
    chart_count: null,
    error_message: null,
    cancellation_requested_at: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-07-13T12:00:00.000Z'),
    updated_at: new Date('2026-07-13T12:00:00.000Z'),
    ...overrides,
});

const buildService = (
    overrides: {
        model?: Record<string, unknown>;
        aiAgentModel?: Record<string, unknown>;
        aiAgentService?: Record<string, unknown>;
        aiOrganizationSettingsModel?: Record<string, unknown>;
        projectModel?: Record<string, unknown>;
        schedulerClient?: Record<string, unknown>;
        asyncQueryService?: Record<string, unknown>;
        queryHistoryModel?: Record<string, unknown>;
        executor?: AnyType;
    } = {},
) => {
    const model = {
        create: vi.fn().mockResolvedValue(runRow()),
        findByUuid: vi.fn().mockResolvedValue(runRow()),
        findByUuidScoped: vi.fn().mockResolvedValue(runRow()),
        findByPromptScoped: vi.fn().mockResolvedValue(undefined),
        claimQueuedRun: vi
            .fn()
            .mockResolvedValue(runRow({ status: 'running' })),
        markCompleted: vi.fn().mockResolvedValue(true),
        checkpointReport: vi.fn().mockResolvedValue(true),
        markPartiallyCompleted: vi.fn().mockResolvedValue(true),
        markFailed: vi.fn().mockResolvedValue(true),
        markCancelled: vi.fn().mockResolvedValue(true),
        requestCancellation: vi.fn().mockResolvedValue(
            runRow({
                status: 'cancelled',
                cancellation_requested_at: new Date(),
                completed_at: new Date(),
            }),
        ),
        listEvents: vi.fn().mockResolvedValue([]),
        appendProgressEvent: vi.fn().mockResolvedValue(true),
        touch: vi.fn().mockResolvedValue(true),
        findByThreadScoped: vi.fn().mockResolvedValue([]),
        markStaleRunsAsFailed: vi.fn().mockResolvedValue([]),
        deleteUnstartedFailedRun: vi.fn().mockResolvedValue(true),
        recordRunAccepted: vi.fn().mockResolvedValue(undefined),
        listPendingAnalyticsEvents: vi.fn().mockResolvedValue([]),
        markAnalyticsEventDelivered: vi.fn().mockResolvedValue(true),
        ...overrides.model,
    };
    const aiAgentModel = {
        findThreadOwnership: vi.fn().mockResolvedValue({
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            ownerUserUuid: 'user-1',
        }),
        findWebAppPrompt: vi.fn().mockResolvedValue({
            promptUuid: 'prompt-1',
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            createdByUserUuid: 'user-1',
            prompt: 'Investigate revenue',
            response: null,
            errorMessage: null,
        }),
        getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([]),
        ...overrides.aiAgentModel,
    };
    const aiAgentService = {
        assertDeepResearchAccess: vi.fn().mockResolvedValue(undefined),
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        resolveDeepResearchExecutionContext: vi
            .fn()
            .mockResolvedValue(executionContextSnapshot),
        ...overrides.aiAgentService,
    };
    const aiOrganizationSettingsModel = {
        findByOrganizationUuid: vi.fn().mockResolvedValue({
            deepResearchRawSqlEnabled: false,
            deepResearchLimits: {
                maxTokens: budget.maxTokens,
                maxToolCalls: budget.maxToolCalls,
                maxWarehouseQueries: budget.maxWarehouseQueries,
                maxSteps: budget.maxSteps,
                deadlineMs: budget.deadlineMs,
            },
        }),
        ...overrides.aiOrganizationSettingsModel,
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org-1' }),
        getQueryTimezone: vi.fn().mockResolvedValue('Europe/London'),
        ...overrides.projectModel,
    };
    const schedulerClient = {
        aiDeepResearch: vi.fn().mockResolvedValue({ jobId: 'job-1' }),
        ...overrides.schedulerClient,
    };
    const asyncQueryService = {
        executeAsyncMetricQuery: vi.fn(),
        ...overrides.asyncQueryService,
    };
    const queryHistoryModel = {
        getByQueryUuid: vi.fn(),
        ...overrides.queryHistoryModel,
    };
    const executor =
        overrides.executor ??
        vi.fn().mockResolvedValue({
            status: 'completed',
            report,
            warehouseQueryUuids: [],
            terminalReason: null,
        });
    const analytics = {
        track: vi.fn(),
    };
    const service = new AiDeepResearchService({
        analytics: analytics as AnyType,
        aiDeepResearchRunModel: model as AnyType,
        aiAgentModel: aiAgentModel as AnyType,
        aiAgentService: aiAgentService as AnyType,
        aiOrganizationSettingsModel: aiOrganizationSettingsModel as AnyType,
        projectModel: projectModel as AnyType,
        schedulerClient: schedulerClient as AnyType,
        asyncQueryService: asyncQueryService as AnyType,
        queryHistoryModel: queryHistoryModel as AnyType,
        executor,
    });
    return {
        service,
        model,
        aiAgentModel,
        aiAgentService,
        aiOrganizationSettingsModel,
        projectModel,
        schedulerClient,
        asyncQueryService,
        queryHistoryModel,
        executor,
        analytics,
    };
};

const validCreateRunArgs = () => ({
    user: userWithProjectAccess(),
    projectUuid: 'project-1',
    prompt: 'Investigate revenue',
    agentUuid: 'agent-1',
    aiThreadUuid: 'thread-1',
    promptUuid: 'prompt-1',
    entryPoint: 'ask_ai' as const,
});

describe('AiDeepResearchService', () => {
    describe('createRun', () => {
        it('preflights the inherited agent configuration and persists organization limits before enqueueing', async () => {
            const {
                service,
                model,
                aiAgentModel,
                aiAgentService,
                schedulerClient,
            } = buildService();

            const run = await service.createRun({
                ...validCreateRunArgs(),
                prompt: '  Investigate revenue  ',
            });

            expect(aiAgentModel.findThreadOwnership).toHaveBeenCalledWith({
                organizationUuid: 'org-1',
                threadUuid: 'thread-1',
            });
            expect(aiAgentModel.findWebAppPrompt).toHaveBeenCalledWith(
                'prompt-1',
            );
            expect(
                aiAgentService.resolveDeepResearchExecutionContext,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-1' }),
                {
                    projectUuid: 'project-1',
                    agentUuid: 'agent-1',
                    modelConfig: null,
                    rawSqlEnabled: false,
                },
            );
            expect(model.create).toHaveBeenCalledWith({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                createdByUserUuid: 'user-1',
                agentUuid: 'agent-1',
                aiThreadUuid: 'thread-1',
                promptUuid: 'prompt-1',
                toolCallId: null,
                prompt: 'Investigate revenue',
                entryPoint: 'ask_ai',
                budget: { ...budget, maxResultRows: 10_000 },
                executionContextSnapshot,
            });
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            });
            expect(aiAgentService.getIsCopilotEnabled).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-1' }),
            );
            expect(run.status).toBe('queued');
        });

        it('preflights raw SQL when the organization enables it', async () => {
            const { service, aiAgentService } = buildService({
                aiOrganizationSettingsModel: {
                    findByOrganizationUuid: vi.fn().mockResolvedValue({
                        deepResearchRawSqlEnabled: true,
                        deepResearchLimits: AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                    }),
                },
            });

            await service.createRun(validCreateRunArgs());

            expect(
                aiAgentService.resolveDeepResearchExecutionContext,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-1' }),
                expect.objectContaining({ rawSqlEnabled: true }),
            );
        });

        it('emits one accepted-run event with persisted dimensions', async () => {
            const { service, analytics } = buildService({
                model: {
                    listPendingAnalyticsEvents: vi.fn().mockResolvedValue([
                        {
                            ai_deep_research_analytics_event_uuid:
                                'analytics-start-1',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'run_started',
                            terminal_reason: null,
                            delivered_at: null,
                            created_at: new Date(),
                        },
                    ]),
                },
            });

            await service.createRun(validCreateRunArgs());

            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                messageId: 'analytics-start-1',
                event: 'ai_deep_research.run_started',
                userId: 'user-1',
                properties: {
                    organizationId: 'org-1',
                    projectId: 'project-1',
                    runUuid: 'run-1',
                    threadId: 'thread-1',
                    aiAgentId: 'agent-1',
                    entryPoint: 'ask_ai',
                    provider: null,
                    model: null,
                    keyManagement: null,
                    attachedMcpServerCount: 0,
                },
            });
        });

        it('uses default limits when the organization has no settings row', async () => {
            const { service, model } = buildService({
                aiOrganizationSettingsModel: {
                    findByOrganizationUuid: vi.fn().mockResolvedValue(null),
                },
            });

            await service.createRun(validCreateRunArgs());

            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    budget: {
                        ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                        maxResultRows: 10_000,
                    },
                }),
            );
        });

        it('returns the existing run when the same prompt is retried', async () => {
            const { service, model, aiAgentService, schedulerClient } =
                buildService({
                    model: {
                        findByPromptScoped: vi.fn().mockResolvedValue(runRow()),
                    },
                });

            const run = await service.createRun(validCreateRunArgs());

            expect(run.aiDeepResearchRunUuid).toBe('run-1');
            expect(
                aiAgentService.resolveDeepResearchExecutionContext,
            ).not.toHaveBeenCalled();
            expect(
                aiAgentService.assertDeepResearchAccess,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-1' }),
                {
                    agentUuid: 'agent-1',
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                    threadUuid: 'thread-1',
                },
            );
            expect(model.create).not.toHaveBeenCalled();
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            });
        });

        it('rejects an idempotent retry after current agent access is revoked', async () => {
            const accessError = new ForbiddenError(
                'Deep Research access was revoked',
            );
            const { service, schedulerClient } = buildService({
                model: {
                    findByPromptScoped: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'completed',
                            result_markdown: 'Private result',
                        }),
                    ),
                },
                aiAgentService: {
                    assertDeepResearchAccess: vi
                        .fn()
                        .mockRejectedValue(accessError),
                },
            });

            await expect(service.createRun(validCreateRunArgs())).rejects.toBe(
                accessError,
            );
            expect(schedulerClient.aiDeepResearch).not.toHaveBeenCalled();
        });

        it('returns the concurrent winner when prompt uniqueness races', async () => {
            const findByPromptScoped = vi
                .fn()
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(runRow());
            const { service, model, schedulerClient } = buildService({
                model: {
                    findByPromptScoped,
                    create: vi.fn().mockRejectedValue(new Error('duplicate')),
                },
            });

            const run = await service.createRun(validCreateRunArgs());

            expect(run.aiDeepResearchRunUuid).toBe('run-1');
            expect(model.create).toHaveBeenCalledOnce();
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            });
        });

        it('returns the active run UUID when another prompt wins the thread race', async () => {
            const { service, schedulerClient } = buildService({
                model: {
                    create: vi
                        .fn()
                        .mockRejectedValue(
                            new AiDeepResearchActiveRunError('active-run'),
                        ),
                },
            });

            await expect(
                service.createRun(validCreateRunArgs()),
            ).rejects.toMatchObject({
                name: ConflictError.name,
                statusCode: 409,
                data: { activeRunUuid: 'active-run' },
            });
            expect(schedulerClient.aiDeepResearch).not.toHaveBeenCalled();
        });

        it('rejects a prompt body that differs from the persisted message', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    prompt: 'A different question',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.findByPromptScoped).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it.each([
            {
                state: 'answered',
                aiAgentModel: {
                    findWebAppPrompt: vi.fn().mockResolvedValue({
                        promptUuid: 'prompt-1',
                        threadUuid: 'thread-1',
                        projectUuid: 'project-1',
                        agentUuid: 'agent-1',
                        createdByUserUuid: 'user-1',
                        prompt: 'Investigate revenue',
                        response: 'An existing answer',
                        errorMessage: null,
                    }),
                },
            },
            {
                state: 'previously executed',
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue([{ toolCall: {} }]),
                },
            },
        ])(
            'rejects a $state prompt before MCP preflight',
            async ({ aiAgentModel }) => {
                const { service, model, aiAgentService } = buildService({
                    aiAgentModel,
                });

                await expect(
                    service.createRun(validCreateRunArgs()),
                ).rejects.toBeInstanceOf(ParameterError);
                expect(
                    aiAgentService.resolveDeepResearchExecutionContext,
                ).not.toHaveBeenCalled();
                expect(model.create).not.toHaveBeenCalled();
            },
        );

        it('rejects a blank prompt before persistence', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    prompt: '   ',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('allows background execution for a service account', async () => {
            const { service, model } = buildService();

            const run = await service.createRun({
                ...validCreateRunArgs(),
                user: {
                    ...userWithProjectAccess(),
                    serviceAccount: { uuid: 'service-account-1' },
                },
            });

            expect(run.status).toBe('queued');
            expect(model.create).toHaveBeenCalled();
        });

        it('rejects background execution for an impersonated user', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    user: {
                        ...userWithProjectAccess(),
                        impersonation: {
                            adminId: 'admin-1',
                            adminEmail: 'admin@example.com',
                            adminRole: 'admin',
                        },
                    },
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation when AI Agents are unavailable', async () => {
            const { service, model } = buildService({
                aiAgentService: {
                    getIsCopilotEnabled: vi.fn().mockResolvedValue(false),
                },
            });

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without the Deep Research scope', async () => {
            const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
            can('view', 'Project', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('manage', 'PersonalAccessToken', {
                organizationUuid: 'org-1',
            });
            const user = {
                ...userWithProjectAccess(),
                ability: build(),
            } as SessionUser;
            const { service, model, aiAgentService } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    user,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(aiAgentService.getIsCopilotEnabled).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects a Deep Research scope granted for another project', async () => {
            const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
            can('view', 'Project', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('create', 'AiDeepResearch', {
                organizationUuid: 'org-1',
                projectUuid: 'project-2',
            });
            can('manage', 'PersonalAccessToken', {
                organizationUuid: 'org-1',
            });
            const user = {
                ...userWithProjectAccess(),
                ability: build(),
            } as SessionUser;
            const { service, model, aiAgentService } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    user,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(aiAgentService.getIsCopilotEnabled).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without project view permission', async () => {
            const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
            can('create', 'AiDeepResearch', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('manage', 'PersonalAccessToken', {
                organizationUuid: 'org-1',
            });
            const user = {
                ...userWithProjectAccess(),
                ability: build(),
            } as SessionUser;
            const { service, model, aiAgentService } = buildService();

            await expect(
                service.createRun({
                    ...validCreateRunArgs(),
                    user,
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(aiAgentService.getIsCopilotEnabled).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it.each([
            [
                'thread',
                {
                    aiAgentModel: {
                        findThreadOwnership: vi
                            .fn()
                            .mockResolvedValue(undefined),
                    },
                },
            ],
            [
                'prompt',
                {
                    aiAgentModel: {
                        findWebAppPrompt: vi.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        ])(
            'rejects an inaccessible %s before MCP preflight',
            async (_name, overrides) => {
                const { service, model, aiAgentService } =
                    buildService(overrides);

                await expect(
                    service.createRun(validCreateRunArgs()),
                ).rejects.toBeInstanceOf(NotFoundError);
                expect(
                    aiAgentService.resolveDeepResearchExecutionContext,
                ).not.toHaveBeenCalled();
                expect(model.create).not.toHaveBeenCalled();
            },
        );

        it('fails during preflight without persisting or enqueueing', async () => {
            const preflightError = new ParameterError(
                'MCP connection required',
            );
            const { service, model, schedulerClient } = buildService({
                aiAgentService: {
                    resolveDeepResearchExecutionContext: vi
                        .fn()
                        .mockRejectedValue(preflightError),
                },
            });

            await expect(service.createRun(validCreateRunArgs())).rejects.toBe(
                preflightError,
            );
            expect(model.create).not.toHaveBeenCalled();
            expect(schedulerClient.aiDeepResearch).not.toHaveBeenCalled();
        });

        it('marks the durable run failed when enqueueing fails', async () => {
            const error = new Error('queue unavailable');
            const { service, model, analytics } = buildService({
                schedulerClient: {
                    aiDeepResearch: vi.fn().mockRejectedValue(error),
                },
            });

            await expect(
                service.createRun(validCreateRunArgs()),
            ).rejects.toThrow('queue unavailable');
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
                'internal_error',
                'enqueue',
            );
            expect(model.deleteUnstartedFailedRun).toHaveBeenCalledWith(
                'run-1',
            );
            expect(analytics.track).not.toHaveBeenCalled();
        });

        it('rejects invalid organization limits before persistence', async () => {
            const { service, model } = buildService({
                aiOrganizationSettingsModel: {
                    findByOrganizationUuid: vi.fn().mockResolvedValue({
                        deepResearchLimits: {
                            ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                            maxToolCalls: 0,
                        },
                    }),
                },
            });

            await expect(
                service.createRun(validCreateRunArgs()),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });
    });

    describe('access and cancellation', () => {
        it('does not expose checkpoint markdown before terminal completion', async () => {
            const { service } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'running',
                            result_markdown: 'Unverified checkpoint',
                        }),
                    ),
                },
            });

            const run = await service.getRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(run.resultMarkdown).toBeNull();
        });

        it('does not expose a run through a different project path', async () => {
            const { service, model, projectModel } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(undefined),
                },
            });

            await expect(
                service.getRun(
                    userWithProjectAccess(),
                    'another-project',
                    'run-1',
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.findByUuidScoped).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'another-project',
            });
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it('returns a redacted model cancellation outcome for queued runs', async () => {
            const { service, model, aiAgentService } = buildService({
                model: {
                    requestCancellation: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'cancelled',
                            cancellation_requested_at: new Date(),
                            completed_at: new Date(),
                            result_markdown: 'Private result',
                        }),
                    ),
                },
                aiAgentService: {
                    assertDeepResearchAccess: vi
                        .fn()
                        .mockRejectedValue(new ForbiddenError()),
                },
            });

            const run = await service.cancelRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(model.requestCancellation).toHaveBeenCalledWith('run-1');
            expect(run.status).toBe('cancelled');
            expect(run.cancellationRequestedAt).not.toBeNull();
            expect(run.resultMarkdown).toBeNull();
            expect(run.executionContextSnapshot).toBeNull();
            expect(
                aiAgentService.assertDeepResearchAccess,
            ).not.toHaveBeenCalled();
        });

        it('revalidates current agent and thread access before returning a run', async () => {
            const accessError = new ForbiddenError(
                'Deep Research access was revoked',
            );
            const { service, aiAgentService } = buildService({
                aiAgentService: {
                    assertDeepResearchAccess: vi
                        .fn()
                        .mockRejectedValue(accessError),
                },
            });

            await expect(
                service.getRun(userWithProjectAccess(), 'project-1', 'run-1'),
            ).rejects.toBe(accessError);
            expect(
                aiAgentService.assertDeepResearchAccess,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userUuid: 'user-1' }),
                {
                    agentUuid: 'agent-1',
                    organizationUuid: 'org-1',
                    projectUuid: 'project-1',
                    threadUuid: 'thread-1',
                },
            );
        });

        it('redacts report data immediately after its expiry boundary', async () => {
            const reportExpiresAt = new Date('2026-07-01T00:00:00.000Z');
            const { service } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'completed',
                            completed_at: new Date('2026-06-01T00:00:00.000Z'),
                            result_markdown: 'Expired private report',
                            report_expires_at: reportExpiresAt,
                        }),
                    ),
                },
            });

            const run = await service.getRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(run.resultMarkdown).toBeNull();
            expect(run.reportExpiresAt).toBe(reportExpiresAt.toISOString());
            expect(run.reportExpiredAt).toBeNull();
            expect(run.isReportExpired).toBe(true);
        });

        it('returns the persisted terminal reason', async () => {
            const { service } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'failed',
                            terminal_reason: 'no_relevant_data',
                        }),
                    ),
                },
            });

            const run = await service.getRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(run.terminalReason).toBe('no_relevant_data');
        });

        it("does not expose another creator's run to a project viewer", async () => {
            const { service, projectModel } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ created_by_user_uuid: 'user-2' }),
                        ),
                },
            });

            await expect(
                service.getRun(userWithProjectAccess(), 'project-1', 'run-1'),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(projectModel.getSummary).not.toHaveBeenCalled();
        });

        it("does not let a project viewer cancel another creator's run", async () => {
            const { service, model } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ created_by_user_uuid: 'user-2' }),
                        ),
                },
            });

            await expect(
                service.cancelRun(
                    userWithProjectAccess(),
                    'project-1',
                    'run-1',
                ),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(model.requestCancellation).not.toHaveBeenCalled();
        });
    });

    describe('listRunsForThread', () => {
        it('lists only the callers runs for the thread, scoped to org and project', async () => {
            const { service, model } = buildService({
                model: {
                    findByThreadScoped: vi
                        .fn()
                        .mockResolvedValue([
                            runRow({ ai_thread_uuid: 'thread-1' }),
                        ]),
                },
            });

            const runs = await service.listRunsForThread(
                userWithProjectAccess(),
                'project-1',
                'thread-1',
            );

            expect(model.findByThreadScoped).toHaveBeenCalledWith({
                aiThreadUuid: 'thread-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                createdByUserUuid: 'user-1',
            });
            expect(runs).toHaveLength(1);
            expect(runs[0].aiThreadUuid).toBe('thread-1');
            expect(runs[0].prompt).toBe('Investigate revenue');
        });

        it('revalidates current agent and thread access before listing runs', async () => {
            const accessError = new ForbiddenError(
                'Deep Research access was revoked',
            );
            const { service, model } = buildService({
                aiAgentService: {
                    assertDeepResearchAccess: vi
                        .fn()
                        .mockRejectedValue(accessError),
                },
            });

            await expect(
                service.listRunsForThread(
                    userWithProjectAccess(),
                    'project-1',
                    'thread-1',
                ),
            ).rejects.toBe(accessError);
            expect(model.findByThreadScoped).not.toHaveBeenCalled();
        });
    });

    describe('executeRun', () => {
        it('skips duplicate delivery after another worker claims the run', async () => {
            const executor = vi.fn();
            const { service, model } = buildService({
                model: { claimQueuedRun: vi.fn().mockResolvedValue(undefined) },
                executor,
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(executor).not.toHaveBeenCalled();
            expect(model.markCompleted).not.toHaveBeenCalled();
        });

        it('persists an explicit completed executor result', async () => {
            const { service, model } = buildService();

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.checkpointReport).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
            expect(
                model.checkpointReport.mock.invocationCallOrder[0],
            ).toBeLessThan(model.markCompleted.mock.invocationCallOrder[0]);
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
        });

        it('retries transient evidence preparation failures after checkpointing', async () => {
            const getToolCallsAndResultsForPrompt = vi
                .fn()
                .mockRejectedValueOnce(new Error('temporary database error'))
                .mockResolvedValue([]);
            const { service, model } = buildService({
                aiAgentModel: { getToolCallsAndResultsForPrompt },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.checkpointReport).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
            expect(getToolCallsAndResultsForPrompt).toHaveBeenCalledTimes(2);
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
            expect(model.markFailed).not.toHaveBeenCalled();
        });

        it('publishes the checkpointed narrative when evidence preparation stays unavailable', async () => {
            const getToolCallsAndResultsForPrompt = vi
                .fn()
                .mockRejectedValue(new Error('database unavailable'));
            const { service, model } = buildService({
                aiAgentModel: { getToolCallsAndResultsForPrompt },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(getToolCallsAndResultsForPrompt).toHaveBeenCalledTimes(3);
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
            expect(model.markFailed).not.toHaveBeenCalled();
        });

        it('retries terminal persistence without discarding the checkpoint', async () => {
            const markCompleted = vi
                .fn()
                .mockRejectedValueOnce(new Error('temporary database error'))
                .mockResolvedValue(true);
            const { service, model } = buildService({
                model: { markCompleted },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(markCompleted).toHaveBeenCalledTimes(2);
            expect(model.markFailed).not.toHaveBeenCalled();
        });

        it('leaves an exhausted terminal write checkpointed for stale recovery', async () => {
            const terminalError = new Error('database unavailable');
            const { service, model } = buildService({
                model: {
                    markCompleted: vi.fn().mockRejectedValue(terminalError),
                },
            });

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toBe(terminalError);

            expect(model.checkpointReport).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
            );
            expect(model.markCompleted).toHaveBeenCalledTimes(3);
            expect(model.markFailed).not.toHaveBeenCalled();
        });

        it('emits one terminal rollup from the persisted metrics snapshot', async () => {
            const { service, analytics } = buildService({
                model: {
                    findByUuid: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'completed',
                            started_at: new Date('2026-07-13T12:00:01.000Z'),
                            completed_at: new Date('2026-07-13T12:00:06.000Z'),
                            result_markdown: reportMarkdown,
                            ...persistedMetrics,
                        }),
                    ),
                    listPendingAnalyticsEvents: vi
                        .fn()
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([
                            {
                                ai_deep_research_analytics_event_uuid:
                                    'analytics-complete-1',
                                ai_deep_research_run_uuid: 'run-1',
                                event_type: 'run_completed',
                                terminal_reason: null,
                                delivered_at: null,
                                created_at: new Date(),
                            },
                        ]),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                messageId: 'analytics-complete-1',
                event: 'ai_deep_research.run_completed',
                userId: 'user-1',
                properties: expect.objectContaining({
                    status: 'completed',
                    terminalReason: null,
                    failureStage: null,
                    inputTokens: 150,
                    outputTokens: 100,
                    cacheReadTokens: 200,
                    cacheWriteTokens: 50,
                    reasoningTokens: 25,
                    totalTokens: 500,
                    tokenUsageComplete: true,
                    toolCallCount: 2,
                    toolErrorCount: 1,
                    warehouseQueryCount: 1,
                    findingsCount: 1,
                    hasReport: true,
                    chartCount: 0,
                    durationMs: 5_000,
                }),
            });
            expect(
                JSON.stringify(analytics.track.mock.calls[0][0]),
            ).not.toContain(reportMarkdown);
            expect(
                analytics.track.mock.calls[0][0].properties,
            ).not.toHaveProperty('errorMessage');
        });

        it.each([
            {
                status: 'partially_completed' as const,
                terminalReason: 'tool_limit' as const,
                failureStage: 'investigation' as const,
                executorResult: {
                    status: 'partially_completed' as const,
                    report,
                    warehouseQueryUuids: [],
                    terminalReason: 'tool_limit' as const,
                    failureStage: 'investigation' as const,
                },
            },
            {
                status: 'failed' as const,
                terminalReason: 'provider_error' as const,
                failureStage: 'finalization' as const,
                executorResult: {
                    status: 'failed' as const,
                    errorMessage: 'provider unavailable',
                    terminalReason: 'provider_error' as const,
                    failureStage: 'finalization' as const,
                },
            },
            {
                status: 'cancelled' as const,
                terminalReason: 'user_cancellation' as const,
                failureStage: 'investigation' as const,
                executorResult: {
                    status: 'cancelled' as const,
                    terminalReason: 'user_cancellation' as const,
                    failureStage: 'investigation' as const,
                },
            },
        ])(
            'emits one $status terminal event with its stable reason',
            async ({
                status,
                terminalReason,
                failureStage,
                executorResult,
            }) => {
                const { service, analytics } = buildService({
                    executor: vi.fn().mockResolvedValue(executorResult),
                    model: {
                        findByUuid: vi.fn().mockResolvedValue(
                            runRow({
                                status,
                                started_at: new Date(
                                    '2026-07-13T12:00:01.000Z',
                                ),
                                completed_at: new Date(
                                    '2026-07-13T12:00:06.000Z',
                                ),
                                result_markdown:
                                    status === 'partially_completed'
                                        ? reportMarkdown
                                        : null,
                                failure_stage: failureStage,
                                ...persistedMetrics,
                            }),
                        ),
                        listPendingAnalyticsEvents: vi
                            .fn()
                            .mockResolvedValueOnce([])
                            .mockResolvedValueOnce([
                                {
                                    ai_deep_research_analytics_event_uuid: `analytics-${status}`,
                                    ai_deep_research_run_uuid: 'run-1',
                                    event_type: 'run_completed',
                                    terminal_reason: terminalReason,
                                    delivered_at: null,
                                    created_at: new Date(),
                                },
                            ]),
                    },
                });

                await service.executeRun({
                    aiDeepResearchRunUuid: 'run-1',
                });

                let completionClass:
                    | 'useful_partial'
                    | 'cancelled'
                    | 'empty_failure' = 'empty_failure';
                if (status === 'partially_completed') {
                    completionClass = 'useful_partial';
                } else if (status === 'cancelled') {
                    completionClass = 'cancelled';
                }

                expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
                    expect.objectContaining({
                        messageId: `analytics-${status}`,
                        event: 'ai_deep_research.run_completed',
                        properties: expect.objectContaining({
                            status,
                            terminalReason,
                            failureStage,
                            durationMs: 5_000,
                            completionClass,
                            reportOutcome:
                                status === 'partially_completed'
                                    ? 'report'
                                    : 'empty',
                        }),
                    }),
                );
            },
        );

        it('does not emit a terminal event when the transition loses a race', async () => {
            const { service, analytics } = buildService({
                model: {
                    markCompleted: vi.fn().mockResolvedValue(false),
                    findByUuid: vi
                        .fn()
                        .mockResolvedValue(runRow({ status: 'completed' })),
                    listPendingAnalyticsEvents: vi.fn().mockResolvedValue([]),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(analytics.track).not.toHaveBeenCalled();
        });

        it('retries an undelivered terminal outbox event with the same message id', async () => {
            const analyticsEvent = {
                ai_deep_research_analytics_event_uuid: 'analytics-retry-1',
                ai_deep_research_run_uuid: 'run-1',
                event_type: 'run_completed' as const,
                terminal_reason: null,
                delivered_at: null,
                created_at: new Date(),
            };
            const claimQueuedRun = vi
                .fn()
                .mockResolvedValueOnce(runRow({ status: 'running' }))
                .mockResolvedValueOnce(undefined);
            const { service, analytics, model } = buildService({
                model: {
                    claimQueuedRun,
                    findByUuid: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'completed',
                            completed_at: new Date('2026-07-13T12:00:06.000Z'),
                            result_markdown: reportMarkdown,
                            ...persistedMetrics,
                        }),
                    ),
                    listPendingAnalyticsEvents: vi
                        .fn()
                        .mockResolvedValueOnce([])
                        .mockResolvedValueOnce([analyticsEvent])
                        .mockResolvedValueOnce([analyticsEvent]),
                },
            });
            analytics.track.mockImplementationOnce(() => {
                throw new Error('temporary analytics failure');
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });
            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(analytics.track).toHaveBeenCalledTimes(2);
            expect(analytics.track.mock.calls).toEqual([
                [
                    expect.objectContaining({
                        messageId: 'analytics-retry-1',
                        event: 'ai_deep_research.run_completed',
                    }),
                ],
                [
                    expect.objectContaining({
                        messageId: 'analytics-retry-1',
                        event: 'ai_deep_research.run_completed',
                    }),
                ],
            ]);
            expect(
                model.markAnalyticsEventDelivered,
            ).toHaveBeenCalledExactlyOnceWith('analytics-retry-1');
        });

        it('accepts query-backed chart evidence returned by this research run', async () => {
            const verifiedQuery = {
                queryUuid: chart.queryUuid,
                createdAt: new Date('2026-07-14T12:00:00.000Z'),
                context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                projectUuid: 'project-1',
                organizationUuid: 'org-1',
                createdByUserUuid: 'user-1',
                createdByActorType: 'pat',
                status: QueryHistoryStatus.READY,
                resultsFileName: 'evidence.jsonl',
                resultsExpiresAt: new Date('2099-07-15T12:00:00.000Z'),
                totalRowCount: 2,
                metricQuery: {
                    dimensions: ['orders_order_month'],
                    metrics: ['orders_total_revenue'],
                },
                fields: { orders_order_month: { name: 'orders_order_month' } },
            };
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [chart.queryUuid],
                }),
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue(verifiedQuery),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                chartReportMarkdown,
            );
        });

        it('records persistence when preparing a verified report fails', async () => {
            const error = new Error('provenance unavailable');
            const { service, model } = buildService();
            vi.spyOn(
                service as AnyType,
                'persistAndPrepareEvidenceReport',
            ).mockRejectedValue(error);

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toBe(error);
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
                'internal_error',
                'persistence',
            );
        });

        it('accepts a chart that references a verified table calculation', async () => {
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [chart.queryUuid],
                }),
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                        {
                            ...chartProvenance()[0],
                            toolCall: {
                                ...chartProvenance()[0].toolCall,
                                toolArgs: {
                                    ...chartToolArgs,
                                    chartConfig: {
                                        ...chart.chartConfig,
                                        secondaryYAxisMetric: 'running_pct',
                                        secondaryYAxisLabel:
                                            'Cumulative revenue',
                                    },
                                },
                            },
                        },
                    ]),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        queryUuid: chart.queryUuid,
                        createdAt: new Date('2026-07-14T12:00:00.000Z'),
                        context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                        projectUuid: 'project-1',
                        organizationUuid: 'org-1',
                        createdByUserUuid: 'user-1',
                        createdByActorType: 'pat',
                        status: QueryHistoryStatus.READY,
                        resultsFileName: 'evidence.jsonl',
                        resultsExpiresAt: new Date('2099-07-15T12:00:00.000Z'),
                        metricQuery: {
                            dimensions: ['orders_order_month'],
                            metrics: ['orders_total_revenue'],
                            tableCalculations: [
                                {
                                    name: 'running_pct',
                                },
                            ],
                        },
                        fields: {},
                    }),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                chartReportMarkdown,
            );
        });

        it('drops a reference to an execution this run never charted', async () => {
            const { service, model, queryHistoryModel } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: {
                        markdown: `# Evidence report\n\n${chartReportMarkdown}`,
                    },
                    warehouseQueryUuids: [chart.queryUuid],
                }),
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            // No generateVisualization call means no chart to derive, so the
            // reference is dropped before query history is ever consulted.
            expect(queryHistoryModel.getByQueryUuid).not.toHaveBeenCalled();
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.not.stringContaining(chart.queryUuid),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.stringContaining('The baseline trend is stable.'),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.stringMatching(
                    /^# Evidence report\n\n<warning title="Report adjusted">/,
                ),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
        });

        it('drops a chart whose query this run did not return', async () => {
            const { service, model, queryHistoryModel } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [],
                }),
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            // A queryUuid outside the run's own set is rejected without even
            // reaching query history.
            expect(queryHistoryModel.getByQueryUuid).not.toHaveBeenCalled();
            expect(model.markFailed).not.toHaveBeenCalled();
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.not.stringContaining(chart.queryUuid),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.stringContaining('The baseline trend is stable.'),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
        });

        it('drops a chart backed by a replayed query that predates this run', async () => {
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [chart.queryUuid],
                }),
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        queryUuid: chart.queryUuid,
                        createdAt: new Date('2026-07-12T12:00:00.000Z'),
                        context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                        projectUuid: 'project-1',
                        organizationUuid: 'org-1',
                        createdByUserUuid: 'user-1',
                        createdByActorType: 'pat',
                        status: QueryHistoryStatus.READY,
                        resultsFileName: 'old-evidence.jsonl',
                        resultsExpiresAt: null,
                        totalRowCount: 1,
                        metricQuery: {
                            dimensions: ['orders_order_month'],
                            metrics: ['orders_total_revenue'],
                        },
                        fields: {
                            orders_order_month: {
                                name: 'orders_order_month',
                            },
                        },
                    }),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            // The narrative still publishes; only the unverifiable chart goes.
            expect(model.markFailed).not.toHaveBeenCalled();
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.not.stringContaining(chart.queryUuid),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.stringContaining('The baseline trend is stable.'),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
        });

        it('drops a chart whose fields are absent from the verified query', async () => {
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [chart.queryUuid],
                }),
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        queryUuid: chart.queryUuid,
                        context: QueryExecutionContext.MCP_RUN_METRIC_QUERY,
                        projectUuid: 'project-1',
                        organizationUuid: 'org-1',
                        createdByUserUuid: 'user-1',
                        createdByActorType: 'pat',
                        status: QueryHistoryStatus.READY,
                        resultsFileName: 'evidence.jsonl',
                        resultsExpiresAt: null,
                        totalRowCount: 0,
                        metricQuery: {
                            dimensions: ['orders_order_month'],
                            metrics: ['orders_order_count'],
                        },
                        fields: {},
                    }),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            // The narrative still publishes; only the unverifiable chart goes.
            expect(model.markFailed).not.toHaveBeenCalled();
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.not.stringContaining(chart.queryUuid),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                expect.stringContaining('The baseline trend is stable.'),
                {
                    repaired: [],
                    dropped: [{ key: chart.queryUuid, reason: 'unverifiable' }],
                },
            );
        });

        it('lets a concurrent cancellation request win over completion', async () => {
            const { service, model } = buildService({
                model: {
                    markCompleted: vi.fn().mockResolvedValue(false),
                    findByUuid: vi.fn().mockResolvedValue(
                        runRow({
                            status: 'running',
                            cancellation_requested_at: new Date(),
                        }),
                    ),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCancelled).toHaveBeenCalledWith(
                'run-1',
                'persistence',
            );
        });

        it('persists executor failures and keeps the job failed', async () => {
            const error = new Error('executor failed');
            const { service, model } = buildService({
                executor: vi.fn().mockRejectedValue(error),
            });

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toThrow('executor failed');
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
                'internal_error',
                'investigation',
            );
        });

        it('persists the stage attached to an executor infrastructure error', async () => {
            const error = new AiDeepResearchExecutorStageError(
                'authorization',
                new Error('account lookup failed'),
            );
            const { service, model } = buildService({
                executor: vi.fn().mockRejectedValue(error),
            });

            await expect(
                service.executeRun({ aiDeepResearchRunUuid: 'run-1' }),
            ).rejects.toBe(error);
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
                'internal_error',
                'authorization',
            );
        });

        it('persists the no relevant data outcome with actionable copy', async () => {
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'failed',
                    errorMessage:
                        'Deep Research could not find relevant data for this question.',
                    terminalReason: 'no_relevant_data',
                    failureStage: 'finalization',
                }),
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not find relevant data for this question.',
                'no_relevant_data',
                'finalization',
            );
        });

        it('passes an abort signal to the executor', async () => {
            const abortController = new AbortController();
            const { service, executor } = buildService();

            await service.executeRun(
                { aiDeepResearchRunUuid: 'run-1' },
                abortController.signal,
            );

            expect(executor).toHaveBeenCalledWith(
                expect.objectContaining({
                    ai_deep_research_run_uuid: 'run-1',
                }),
                { signal: abortController.signal },
            );
        });
    });

    describe('buildEvidencePack', () => {
        const evidenceQueryHistory = {
            queryUuid: chart.queryUuid,
            createdAt: new Date('2026-07-14T12:00:00.000Z'),
            context: QueryExecutionContext.AI,
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
            createdByUserUuid: 'user-1',
            createdByActorType: 'session',
            status: QueryHistoryStatus.READY,
            resultsFileName: 'evidence.jsonl',
            resultsExpiresAt: new Date('2099-07-15T12:00:00.000Z'),
            totalRowCount: 400,
            metricQuery: {
                dimensions: ['orders_order_month'],
                metrics: ['orders_total_revenue'],
                filters: {
                    dimensions: { id: 'filter-1', and: [] },
                },
                sorts: [{ fieldId: 'orders_order_month', descending: true }],
                limit: 400,
                timezone: 'America/New_York',
            },
            fields: {},
        };
        const resultRows = Array.from({ length: 20 }, (_, index) => ({
            orders_order_month: `2026-${String(index + 1).padStart(2, '0')}`,
        }));

        const buildEvidenceService = (overrides: AnyType = {}) =>
            buildService({
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi
                        .fn()
                        .mockResolvedValue(evidenceQueryHistory),
                },
                asyncQueryService: {
                    getResultsPageFromS3: vi
                        .fn()
                        .mockResolvedValue({ rows: resultRows }),
                },
                ...overrides,
            });

        it('rebuilds evidence from the run own verified executions', async () => {
            const { service } = buildEvidenceService();

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(false);
            expect(pack.question).toBe('Investigate revenue');
            expect(pack.timezone).toBe('Europe/London');
            expect(pack.generatedAt).toEqual(expect.any(String));
            expect(pack.queries).toHaveLength(1);
            expect(pack.queries[0]).toMatchObject({
                type: 'metric_query',
                queryUuid: chart.queryUuid,
                title: chart.title,
                // The pack states the real total so the finalizer never reads
                // its 20-row slice as the whole result.
                rowCount: 400,
                truncated: true,
                filters: evidenceQueryHistory.metricQuery.filters,
                sorts: evidenceQueryHistory.metricQuery.sorts,
                limit: 400,
                timezone: 'America/New_York',
                warnings: [
                    expect.stringContaining('first 20 of 400'),
                    expect.stringContaining('filtered'),
                    expect.stringContaining('400-row query limit'),
                ],
                // The execution carries a chart config, so the finalizer is
                // told it may reference this queryUuid as a chart.
                chartable: true,
                visualizationType: chart.chartConfig.defaultVizType,
            });
            expect(pack.queries[0].rowsCsv).toContain('2026-01');
        });

        it('rebuilds MCP raw SQL as non-chartable evidence', async () => {
            const { service } = buildEvidenceService({
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                        {
                            toolCall: {
                                toolName: 'lightdash__run_sql',
                                toolArgs: { sql: 'SELECT total FROM orders' },
                                parentToolCallId: 'deep-research:run-1:task-1',
                            },
                            toolResult: {
                                metadata: {
                                    status: 'success',
                                    queryUuid: chart.queryUuid,
                                },
                            },
                        },
                    ]),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        ...evidenceQueryHistory,
                        context: QueryExecutionContext.MCP_RUN_SQL,
                        columns: {
                            total: { reference: 'total', type: 'number' },
                        },
                    }),
                },
                asyncQueryService: {
                    getResultsPageFromS3: vi
                        .fn()
                        .mockResolvedValue({ rows: [{ total: 42 }] }),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(false);
            expect(pack.queries).toEqual([
                expect.objectContaining({
                    type: 'sql_query',
                    title: 'Raw SQL query',
                    columns: ['total'],
                    chartable: false,
                    rowsCsv: expect.stringContaining('42'),
                }),
            ]);
        });

        it('keeps raw SQL column metadata when the result has no rows', async () => {
            const { service } = buildEvidenceService({
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                        {
                            toolCall: {
                                toolName: 'lightdash__run_sql',
                                toolArgs: { sql: 'SELECT total FROM orders' },
                                parentToolCallId: null,
                            },
                            toolResult: {
                                metadata: {
                                    status: 'success',
                                    queryUuid: chart.queryUuid,
                                },
                            },
                        },
                    ]),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        ...evidenceQueryHistory,
                        context: QueryExecutionContext.MCP_RUN_SQL,
                        totalRowCount: 0,
                        columns: {},
                        originalColumns: {
                            total: { reference: 'total', type: 'number' },
                        },
                    }),
                },
                asyncQueryService: {
                    getResultsPageFromS3: vi
                        .fn()
                        .mockResolvedValue({ rows: [] }),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(false);
            expect(pack.queries).toEqual([
                expect.objectContaining({
                    type: 'sql_query',
                    rowCount: 0,
                    columns: ['total'],
                }),
            ]);
        });

        it('marks an execution with no chart config as not chartable', async () => {
            const { service } = buildEvidenceService({
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                        {
                            ...chartProvenance()[0],
                            toolCall: {
                                ...chartProvenance()[0].toolCall,
                                toolName: 'lightdash__run_metric_query',
                                toolArgs: {
                                    ...chartToolArgs,
                                    chartConfig: null,
                                },
                            },
                        },
                    ]),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(false);
            expect(pack.queries).toHaveLength(1);
            expect(pack.queries[0].chartable).toBe(false);
        });

        it('refuses evidence tagged for a different run', async () => {
            const { service } = buildEvidenceService({
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance('foreign-run')),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(false);
            expect(pack.queries).toEqual([]);
        });

        it('drops a query whose result cannot be read rather than the pack', async () => {
            const { service } = buildEvidenceService({
                asyncQueryService: {
                    getResultsPageFromS3: vi
                        .fn()
                        .mockRejectedValue(new Error('results expired')),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(true);
            expect(pack.queries).toEqual([]);
            expect(pack.question).toBe('Investigate revenue');
        });

        it('refuses an execution this run did not make', async () => {
            const { service } = buildEvidenceService({
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        ...evidenceQueryHistory,
                        createdByUserUuid: 'someone-else',
                    }),
                },
            });

            const { evidencePack: pack, hasEvidenceBuildFailures } =
                await service.buildEvidencePack(runRow() as AnyType);

            expect(hasEvidenceBuildFailures).toBe(true);
            expect(pack.queries).toEqual([]);
        });

        it.each([
            {
                name: 'successful field-value search',
                toolName: 'searchFieldValues',
                toolResult: { metadata: { status: 'success' } },
                expectedFailure: false,
            },
            {
                name: 'failed field-value search',
                toolName: 'searchFieldValues',
                toolResult: { metadata: { status: 'error' } },
                expectedFailure: true,
            },
            {
                name: 'failed metadata discovery',
                toolName: 'getMetadata',
                toolResult: { metadata: { status: 'error' } },
                expectedFailure: true,
            },
            {
                name: 'failed MCP discovery',
                toolName: 'catalog__search',
                toolResult: {
                    toolType: 'mcp',
                    metadata: null,
                    result: JSON.stringify({ isError: true }),
                },
                expectedFailure: true,
            },
        ])(
            'classifies $name without treating value search as query evidence',
            async ({ toolName, toolResult, expectedFailure }) => {
                const { service } = buildEvidenceService({
                    aiAgentModel: {
                        getToolCallsAndResultsForPrompt: vi
                            .fn()
                            .mockResolvedValue([
                                {
                                    toolCall: {
                                        toolName,
                                        toolArgs: {},
                                        parentToolCallId: null,
                                    },
                                    toolResult,
                                },
                            ]),
                    },
                });

                const { evidencePack, hasEvidenceBuildFailures } =
                    await service.buildEvidencePack(runRow() as AnyType);

                expect(hasEvidenceBuildFailures).toBe(expectedFailure);
                expect(evidencePack.queries).toEqual([]);
                expect(evidencePack.workerFindings).toEqual([]);
            },
        );
    });

    describe('getChart', () => {
        const queryHistory = {
            queryUuid: chart.queryUuid,
            createdAt: new Date('2026-07-14T12:00:00.000Z'),
            context: QueryExecutionContext.AI,
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
            createdByUserUuid: 'user-1',
            createdByActorType: 'session',
            status: QueryHistoryStatus.READY,
            resultsFileName: 'evidence.jsonl',
            resultsExpiresAt: new Date('2099-07-15T12:00:00.000Z'),
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_month'],
                metrics: ['orders_total_revenue'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
            fields: {},
        };

        it('hydrates a referenced chart from run-scoped query provenance', async () => {
            const { service } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ result_markdown: chartReportMarkdown }),
                        ),
                },
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue(queryHistory),
                },
            });

            await expect(
                service.getChart({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    queryUuid: chart.queryUuid,
                }),
            ).resolves.toMatchObject({
                source: 'warehouse',
                queryUuid: chart.queryUuid,
                title: chart.title,
                chartConfig: chart.chartConfig,
                metricQuery: queryHistory.metricQuery,
            });
        });

        it('rejects matching query metadata from a different run', async () => {
            const { service, queryHistoryModel } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ result_markdown: chartReportMarkdown }),
                        ),
                },
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance('foreign-run')),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue(queryHistory),
                },
            });

            await expect(
                service.getChart({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    queryUuid: chart.queryUuid,
                }),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(queryHistoryModel.getByQueryUuid).not.toHaveBeenCalled();
        });
    });

    describe('refreshChart', () => {
        const refreshQueryHistory = {
            queryUuid: chart.queryUuid,
            createdAt: new Date('2026-07-14T12:00:00.000Z'),
            context: QueryExecutionContext.AI,
            projectUuid: 'project-1',
            organizationUuid: 'org-1',
            createdByUserUuid: 'user-1',
            createdByActorType: 'session',
            status: QueryHistoryStatus.READY,
            resultsFileName: null,
            resultsExpiresAt: new Date('2026-07-15T12:00:00.000Z'),
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_month'],
                metrics: ['orders_total_revenue'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                timezone: 'Europe/London',
            },
            fields: {},
        };

        it('re-executes the metric query behind a referenced report chart', async () => {
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ result_markdown: chartReportMarkdown }),
                        ),
                },
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi
                        .fn()
                        .mockResolvedValue(chartProvenance()),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi
                        .fn()
                        .mockResolvedValue(refreshQueryHistory),
                },
                asyncQueryService: {
                    executeAsyncMetricQuery: vi.fn().mockResolvedValue({
                        queryUuid: 'query-2',
                        cacheMetadata: { cacheHit: true },
                        metricQuery: refreshQueryHistory.metricQuery,
                        fields: {},
                        warnings: [],
                    }),
                },
            });

            const result = await service.refreshChart({
                account: {} as AnyType,
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                chartKey: chart.queryUuid,
            });

            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledWith({
                account: {},
                projectUuid: 'project-1',
                metricQuery: refreshQueryHistory.metricQuery,
                context: QueryExecutionContext.AI,
                pivotConfiguration: undefined,
            });
            expect(result).toEqual({
                source: 'semantic',
                type: AiResultType.QUERY_RESULT,
                mergeQuery: null,
                query: {
                    queryUuid: 'query-2',
                    cacheMetadata: { cacheHit: true },
                    metricQuery: refreshQueryHistory.metricQuery,
                    fields: {},
                    warnings: [],
                    parameterReferences: [],
                    usedParametersValues: {},
                    resolvedTimezone: 'Europe/London',
                },
                metadata: {
                    title: chart.title,
                    description: null,
                },
            });
        });

        it('pivots the refreshed query by the chart group-by dimension', async () => {
            const groupedChartConfig = {
                ...chart.chartConfig,
                yAxisMetrics: ['orders_unique_order_count'],
                groupBy: ['orders_status'],
            };
            const groupedMetricQuery = {
                ...refreshQueryHistory.metricQuery,
                dimensions: ['orders_order_month', 'orders_status'],
                metrics: ['orders_unique_order_count'],
            };
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ result_markdown: chartReportMarkdown }),
                        ),
                },
                aiAgentModel: {
                    getToolCallsAndResultsForPrompt: vi.fn().mockResolvedValue([
                        {
                            ...chartProvenance()[0],
                            toolCall: {
                                ...chartProvenance()[0].toolCall,
                                toolArgs: {
                                    ...chartToolArgs,
                                    queryConfig: {
                                        ...chartToolArgs.queryConfig,
                                        dimensions:
                                            groupedMetricQuery.dimensions,
                                        metrics: groupedMetricQuery.metrics,
                                    },
                                    chartConfig: groupedChartConfig,
                                },
                            },
                        },
                    ]),
                },
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue({
                        ...refreshQueryHistory,
                        metricQuery: groupedMetricQuery,
                    }),
                },
                asyncQueryService: {
                    executeAsyncMetricQuery: vi.fn().mockResolvedValue({
                        queryUuid: 'query-2',
                        cacheMetadata: { cacheHit: true },
                        metricQuery: groupedMetricQuery,
                        fields: {},
                        warnings: [],
                    }),
                },
            });

            await service.refreshChart({
                account: {} as AnyType,
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                chartKey: chart.queryUuid,
            });

            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    metricQuery: groupedMetricQuery,
                    pivotConfiguration: expect.objectContaining({
                        groupByColumns: [{ reference: 'orders_status' }],
                        valuesColumns: [
                            expect.objectContaining({
                                reference: 'orders_unique_order_count',
                            }),
                        ],
                    }),
                }),
            );
        });

        it('rejects a chart key that is not part of the persisted report', async () => {
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(runRow()),
                },
            });

            await expect(
                service.refreshChart({
                    account: {} as AnyType,
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    chartKey: chart.queryUuid,
                }),
            ).rejects.toBeInstanceOf(NotFoundError);
            expect(
                asyncQueryService.executeAsyncMetricQuery,
            ).not.toHaveBeenCalled();
        });
    });

    describe('listEvents', () => {
        it('uses an opaque keyset cursor and excludes the lookahead row', async () => {
            const { service, model } = buildService({
                model: {
                    listEvents: vi.fn().mockResolvedValue([
                        {
                            ai_deep_research_event_uuid: 'event-1',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'status_changed',
                            payload: { status: 'queued' },
                            created_at: new Date('2026-07-13T12:00:00.000Z'),
                            cursor_created_at: '2026-07-13 12:00:00.000001',
                        },
                        {
                            ai_deep_research_event_uuid: 'event-2',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'status_changed',
                            payload: { status: 'running' },
                            created_at: new Date('2026-07-13T12:01:00.000Z'),
                            cursor_created_at: '2026-07-13 12:01:00.000001',
                        },
                    ]),
                },
            });

            const page = await service.listEvents({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                limit: 1,
            });

            expect(page.events).toHaveLength(1);
            expect(page.nextCursor).not.toBeNull();
            expect(model.listEvents).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                cursor: null,
                limit: 1,
            });
        });

        it('returns a cursor for the final event so clients can keep polling', async () => {
            const { service } = buildService({
                model: {
                    listEvents: vi.fn().mockResolvedValue([
                        {
                            ai_deep_research_event_uuid:
                                '9323399d-2329-4fd1-aa22-840c014f36f1',
                            ai_deep_research_run_uuid: 'run-1',
                            event_type: 'status_changed',
                            payload: { status: 'queued' },
                            created_at: new Date('2026-07-13T12:00:00.000Z'),
                            cursor_created_at: '2026-07-13 12:00:00.000001',
                        },
                    ]),
                },
            });

            const page = await service.listEvents({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
            });

            expect(page.nextCursor).not.toBeNull();
        });

        it('keeps the current cursor when no new events are available', async () => {
            const { service } = buildService();
            const cursor = Buffer.from(
                JSON.stringify({
                    createdAt: '2026-07-13 12:00:00.000001',
                    eventUuid: '9323399d-2329-4fd1-aa22-840c014f36f1',
                }),
            ).toString('base64url');

            const page = await service.listEvents({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                aiDeepResearchRunUuid: 'run-1',
                cursor,
            });

            expect(page).toEqual({ events: [], nextCursor: cursor });
        });

        it('rejects malformed cursors', async () => {
            const { service } = buildService();

            await expect(
                service.listEvents({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor: 'not-a-cursor',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
        });

        it('rejects a cursor with a non-UUID event identifier', async () => {
            const { service, model } = buildService();
            const cursor = Buffer.from(
                JSON.stringify({
                    createdAt: '2026-07-13 12:00:00.000001',
                    eventUuid: 'not-a-uuid',
                }),
            ).toString('base64url');

            await expect(
                service.listEvents({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    cursor,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.listEvents).not.toHaveBeenCalled();
        });
    });
});

describe('getAiDeepResearchRunBudget', () => {
    it('keeps every limit a run recorded for itself', () => {
        expect(getAiDeepResearchRunBudget(budget)).toEqual(budget);
    });

    it('fills limits a snapshot predating them never stored', () => {
        // A run queued before the limits changed: no maxSteps, no deadlineMs.
        const legacy = {
            maxTokens: 10_000_000,
            maxToolCalls: 1_000,
            maxWarehouseQueries: 100,
            maxHypotheses: 5,
            maxResultRows: 10_000,
        } as unknown as AiDeepResearchBudget;

        const resolved = getAiDeepResearchRunBudget(legacy);

        // An undefined deadline makes setTimeout fire immediately, which would
        // abort the run on its first tick.
        expect(resolved.deadlineMs).toBe(
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.deadlineMs,
        );
        expect(resolved.maxSteps).toBe(
            AI_DEEP_RESEARCH_DEFAULT_LIMITS.maxSteps,
        );
        // What the run did record is still honoured.
        expect(resolved.maxToolCalls).toBe(1_000);
        expect(resolved).not.toHaveProperty('maxHypotheses');
    });

    it('replaces values that are not usable limits', () => {
        const corrupt = {
            maxTokens: 0,
            maxSteps: -1,
            maxToolCalls: 2.5,
            maxWarehouseQueries: null,
            deadlineMs: 'soon',
            maxResultRows: undefined,
        } as unknown as AiDeepResearchBudget;

        expect(getAiDeepResearchRunBudget(corrupt)).toEqual({
            ...AI_DEEP_RESEARCH_DEFAULT_LIMITS,
            maxResultRows: 10_000,
        });
    });
});
