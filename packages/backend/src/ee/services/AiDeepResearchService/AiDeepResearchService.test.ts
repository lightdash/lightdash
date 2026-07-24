import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AiResultType,
    AnyType,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type AiDeepResearchBudget,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'stream';
import { AiDeepResearchService } from './AiDeepResearchService';

const budget: AiDeepResearchBudget = {
    maxTokens: 10_000,
    maxToolCalls: 20,
    maxWarehouseQueries: 10,
    maxResultRows: 1_000,
};

const effortBudgets = [
    {
        effort: 'low',
        budget: {
            maxTokens: 500_000,
            maxToolCalls: 50,
            maxWarehouseQueries: 10,
            maxResultRows: 5_000,
        },
    },
    {
        effort: 'medium',
        budget: {
            maxTokens: 1_000_000,
            maxToolCalls: 125,
            maxWarehouseQueries: 25,
            maxResultRows: 10_000,
        },
    },
    {
        effort: 'high',
        budget: {
            maxTokens: 2_000_000,
            maxToolCalls: 250,
            maxWarehouseQueries: 50,
            maxResultRows: 25_000,
        },
    },
    {
        effort: 'xhigh',
        budget: {
            maxTokens: 4_000_000,
            maxToolCalls: 500,
            maxWarehouseQueries: 100,
            maxResultRows: 50_000,
        },
    },
] as const;

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

const report = { markdown: reportMarkdown, charts: [] };

const chartReportMarkdown = reportMarkdown.replace(
    'The baseline trend is stable.',
    `The baseline trend is stable.\n\n${chartRef}`,
);

const chartReport = { markdown: chartReportMarkdown, charts: [chart] };

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
    ai_thread_uuid: null,
    prompt_uuid: null,
    tool_call_id: null,
    prompt: 'Investigate revenue',
    status: 'queued',
    claude_session_id: null,
    result_markdown: null,
    result_chart_data: null,
    budget_snapshot: budget,
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
        projectModel?: Record<string, unknown>;
        featureFlagModel?: Record<string, unknown>;
        schedulerClient?: Record<string, unknown>;
        asyncQueryService?: Record<string, unknown>;
        queryHistoryModel?: Record<string, unknown>;
        resultsFileStorageClient?: Record<string, unknown>;
        executor?: AnyType;
    } = {},
) => {
    const model = {
        create: vi.fn().mockResolvedValue(runRow()),
        findByUuid: vi.fn().mockResolvedValue(runRow()),
        findByUuidScoped: vi.fn().mockResolvedValue(runRow()),
        claimQueuedRun: vi
            .fn()
            .mockResolvedValue(runRow({ status: 'running' })),
        markCompleted: vi.fn().mockResolvedValue(true),
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
        setClaudeSessionId: vi.fn().mockResolvedValue(true),
        touch: vi.fn().mockResolvedValue(true),
        findByThreadScoped: vi.fn().mockResolvedValue([]),
        markStaleRunsAsFailed: vi.fn().mockResolvedValue([]),
        ...overrides.model,
    };
    const aiAgentModel = {
        findThreadOwnership: vi.fn().mockResolvedValue({
            threadUuid: 'thread-1',
            projectUuid: 'project-1',
            agentUuid: null,
            ownerUserUuid: 'user-1',
        }),
        ...overrides.aiAgentModel,
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({ organizationUuid: 'org-1' }),
        ...overrides.projectModel,
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({
            id: FeatureFlags.AiDeepResearch,
            enabled: true,
        }),
        ...overrides.featureFlagModel,
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
    const resultsFileStorageClient = {
        getDownloadStream: vi.fn().mockResolvedValue(Readable.from([])),
        ...overrides.resultsFileStorageClient,
    };
    const executor =
        overrides.executor ??
        vi.fn().mockResolvedValue({
            status: 'completed',
            report,
            warehouseQueryUuids: [],
        });
    const service = new AiDeepResearchService({
        aiDeepResearchRunModel: model as AnyType,
        aiAgentModel: aiAgentModel as AnyType,
        projectModel: projectModel as AnyType,
        featureFlagModel: featureFlagModel as AnyType,
        schedulerClient: schedulerClient as AnyType,
        asyncQueryService: asyncQueryService as AnyType,
        queryHistoryModel: queryHistoryModel as AnyType,
        resultsFileStorageClient: resultsFileStorageClient as AnyType,
        executor,
    });
    return {
        service,
        model,
        aiAgentModel,
        projectModel,
        featureFlagModel,
        schedulerClient,
        asyncQueryService,
        queryHistoryModel,
        resultsFileStorageClient,
        executor,
    };
};

describe('AiDeepResearchService', () => {
    describe('createRun', () => {
        it('persists the run before enqueueing a uniquely addressable job', async () => {
            const { service, model, schedulerClient, featureFlagModel } =
                buildService();

            const run = await service.createRun({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                prompt: '  Investigate revenue  ',
                budget,
            });

            expect(model.create).toHaveBeenCalledWith({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                createdByUserUuid: 'user-1',
                aiThreadUuid: null,
                promptUuid: null,
                toolCallId: null,
                prompt: 'Investigate revenue',
                budget,
            });
            expect(schedulerClient.aiDeepResearch).toHaveBeenCalledWith({
                aiDeepResearchRunUuid: 'run-1',
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                userUuid: 'user-1',
            });
            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: expect.objectContaining({ userUuid: 'user-1' }),
                featureFlagId: FeatureFlags.AiDeepResearch,
            });
            expect(run.status).toBe('queued');
        });

        it('persists the thread link when the caller owns the thread', async () => {
            const { service, model, aiAgentModel } = buildService();

            await service.createRun({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                prompt: 'Investigate revenue',
                budget,
                aiThreadUuid: 'thread-1',
            });

            expect(aiAgentModel.findThreadOwnership).toHaveBeenCalledWith({
                organizationUuid: 'org-1',
                threadUuid: 'thread-1',
            });
            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({ aiThreadUuid: 'thread-1' }),
            );
        });

        it('persists the prompt link alongside its thread', async () => {
            const { service, model } = buildService();

            await service.createRun({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                prompt: 'Investigate revenue',
                budget,
                aiThreadUuid: 'thread-1',
                promptUuid: 'prompt-1',
            });

            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    aiThreadUuid: 'thread-1',
                    promptUuid: 'prompt-1',
                }),
            );
        });

        it('rejects a prompt link without its thread', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget,
                    promptUuid: 'prompt-1',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it.each([
            ['missing', undefined],
            [
                'owned by another user',
                {
                    threadUuid: 'thread-1',
                    projectUuid: 'project-1',
                    agentUuid: null,
                    ownerUserUuid: 'user-2',
                },
            ],
            [
                'in another project',
                {
                    threadUuid: 'thread-1',
                    projectUuid: 'project-2',
                    agentUuid: null,
                    ownerUserUuid: 'user-1',
                },
            ],
        ] as const)(
            'rejects a thread link that is %s',
            async (_case, ownership) => {
                const { service, model } = buildService({
                    aiAgentModel: {
                        findThreadOwnership: vi
                            .fn()
                            .mockResolvedValue(ownership),
                    },
                });

                await expect(
                    service.createRun({
                        user: userWithProjectAccess(),
                        projectUuid: 'project-1',
                        prompt: 'Investigate revenue',
                        budget,
                        aiThreadUuid: 'thread-1',
                    }),
                ).rejects.toBeInstanceOf(NotFoundError);
                expect(model.create).not.toHaveBeenCalled();
            },
        );

        it('uses the server-owned default budget when none is provided', async () => {
            const { service, model } = buildService();

            await service.createRun({
                user: userWithProjectAccess(),
                projectUuid: 'project-1',
                prompt: 'Investigate revenue',
            });

            expect(model.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    budget: effortBudgets[1].budget,
                }),
            );
        });

        it.each(effortBudgets)(
            'maps $effort effort to its server-owned budget',
            async ({ effort, budget: expectedBudget }) => {
                const { service, model } = buildService();

                await service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    effort,
                });

                expect(model.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        budget: expectedBudget,
                    }),
                );
            },
        );

        it('rejects a blank prompt before persistence', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: '   ',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation when Deep Research is disabled', async () => {
            const { service, model } = buildService({
                featureFlagModel: {
                    get: vi.fn().mockResolvedValue({
                        id: FeatureFlags.AiDeepResearch,
                        enabled: false,
                    }),
                },
            });

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
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
            const { service, model, featureFlagModel } = buildService();

            await expect(
                service.createRun({
                    user,
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without permission to create the temporary PAT', async () => {
            const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
            can('view', 'Project', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('create', 'AiDeepResearch', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            const user = {
                ...userWithProjectAccess(),
                ability: build(),
            } as SessionUser;
            const { service, model, featureFlagModel } = buildService();

            await expect(
                service.createRun({
                    user,
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects run creation without permission to delete the temporary PAT', async () => {
            const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
            can('view', 'Project', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('create', 'AiDeepResearch', {
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
            });
            can('create', 'PersonalAccessToken', {
                organizationUuid: 'org-1',
            });
            const user = {
                ...userWithProjectAccess(),
                ability: build(),
            } as SessionUser;
            const { service, model, featureFlagModel } = buildService();

            await expect(
                service.createRun({
                    user,
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
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
            const { service, model, featureFlagModel } = buildService();

            await expect(
                service.createRun({
                    user,
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
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
            const { service, model, featureFlagModel } = buildService();

            await expect(
                service.createRun({
                    user,
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(featureFlagModel.get).not.toHaveBeenCalled();
            expect(model.create).not.toHaveBeenCalled();
        });

        it('marks the durable run failed when enqueueing fails', async () => {
            const error = new Error('queue unavailable');
            const { service, model } = buildService({
                schedulerClient: {
                    aiDeepResearch: vi.fn().mockRejectedValue(error),
                },
            });

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget,
                }),
            ).rejects.toThrow('queue unavailable');
            expect(model.markFailed).toHaveBeenCalledWith(
                'run-1',
                'Deep Research could not finish. Please try again.',
            );
        });

        it('rejects invalid budget snapshots before persistence', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget: { ...budget, maxTokens: 0 },
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });

        it('rejects budget snapshots above server limits', async () => {
            const { service, model } = buildService();

            await expect(
                service.createRun({
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    prompt: 'Investigate revenue',
                    budget: {
                        ...budget,
                        maxTokens: 4_000_000 + 1,
                    },
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(model.create).not.toHaveBeenCalled();
        });
    });

    describe('access and cancellation', () => {
        it('omits legacy runtime limits from returned budget snapshots', async () => {
            const legacyBudget = {
                ...budget,
                maxRuntimeMs: 30 * 60 * 1_000,
            } as AiDeepResearchBudget;
            const { service } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(
                            runRow({ budget_snapshot: legacyBudget }),
                        ),
                },
            });

            const run = await service.getRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(run.budget).toEqual(budget);
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

        it('returns the model cancellation outcome for queued runs', async () => {
            const { service, model } = buildService();

            const run = await service.cancelRun(
                userWithProjectAccess(),
                'project-1',
                'run-1',
            );

            expect(model.requestCancellation).toHaveBeenCalledWith('run-1');
            expect(run.status).toBe('cancelled');
            expect(run.cancellationRequestedAt).not.toBeNull();
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

            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                reportMarkdown,
                {},
            );
        });

        it('snapshots chart evidence returned by this research run', async () => {
            const verifiedQuery = {
                queryUuid: chart.queryUuid,
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
            const { service, model, resultsFileStorageClient } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [chart.queryUuid],
                }),
                queryHistoryModel: {
                    getByQueryUuid: vi.fn().mockResolvedValue(verifiedQuery),
                },
                resultsFileStorageClient: {
                    getDownloadStream: vi
                        .fn()
                        .mockResolvedValue(
                            Readable.from([
                                '{"orders_order_month":"2026-05","orders_total_revenue":120}\n',
                                '{"orders_order_month":"2026-06","orders_total_revenue":90}\n',
                            ]),
                        ),
                },
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(
                resultsFileStorageClient.getDownloadStream,
            ).toHaveBeenCalledWith('evidence.jsonl');
            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                chartReportMarkdown,
                {
                    [chart.queryUuid]: {
                        source: 'warehouse',
                        title: chart.title,
                        chartConfig: chart.chartConfig,
                        queryUuid: chart.queryUuid,
                        derivedFrom: null,
                        metricQuery: verifiedQuery.metricQuery,
                        fields: verifiedQuery.fields,
                        snapshot: {
                            takenAt: expect.any(String),
                            rowCount: 2,
                            truncated: false,
                            columnOrder: [
                                'orders_order_month',
                                'orders_total_revenue',
                            ],
                            rows: [
                                ['2026-05', 120],
                                ['2026-06', 90],
                            ],
                        },
                    },
                },
            );
        });

        it('persists an inline chart with synthesized query metadata and run-scoped provenance', async () => {
            const inlineChart = {
                source: 'inline' as const,
                key: 'refund-share',
                title: 'Refund share by month',
                chartConfig: chart.chartConfig,
                columns: [
                    { id: 'month', label: 'Month', type: 'string' as const },
                    {
                        id: 'refund_share',
                        label: 'Refund share',
                        type: 'number' as const,
                    },
                ],
                rows: [
                    ['2026-05', 0.12],
                    ['2026-06', 0.19],
                ],
                derivedFrom: [
                    chart.queryUuid,
                    '00000000-0000-4000-8000-000000000009',
                ],
            };
            const inlineMarkdown = reportMarkdown.replace(
                'The baseline trend is stable.',
                `The baseline trend is stable.\n\n<chart id="${inlineChart.key}" title="${inlineChart.title}" description="The enterprise ratio was lower than the SMB ratio.">`,
            );
            const { service, model } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: {
                        markdown: inlineMarkdown,
                        charts: [inlineChart],
                    },
                    warehouseQueryUuids: [chart.queryUuid],
                }),
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(model.markCompleted).toHaveBeenCalledWith(
                'run-1',
                inlineMarkdown,
                {
                    'refund-share': expect.objectContaining({
                        source: 'inline',
                        title: inlineChart.title,
                        queryUuid: null,
                        derivedFrom: [chart.queryUuid],
                        metricQuery: expect.objectContaining({
                            exploreName: 'inline',
                            dimensions: ['month'],
                            metrics: ['refund_share'],
                        }),
                        fields: expect.objectContaining({
                            month: expect.objectContaining({
                                fieldType: 'dimension',
                            }),
                            refund_share: expect.objectContaining({
                                fieldType: 'metric',
                            }),
                        }),
                        snapshot: expect.objectContaining({
                            rowCount: 2,
                            truncated: false,
                            columnOrder: ['month', 'refund_share'],
                            rows: inlineChart.rows,
                        }),
                    }),
                },
            );
        });

        it('omits an older same-user query that was not returned by this run', async () => {
            const { service, model, queryHistoryModel } = buildService({
                executor: vi.fn().mockResolvedValue({
                    status: 'completed',
                    report: chartReport,
                    warehouseQueryUuids: [],
                }),
            });

            await service.executeRun({ aiDeepResearchRunUuid: 'run-1' });

            expect(queryHistoryModel.getByQueryUuid).not.toHaveBeenCalled();
            const [, persisted, chartData] = model.markCompleted.mock.calls[0];
            expect(chartData).toEqual({});
            expect(persisted).not.toContain(`<chart id="${chart.queryUuid}"`);
            expect(persisted).toContain('*(chart omitted:');
            expect(persisted).toContain(
                'Some proposed charts were omitted because their query evidence could not be verified.',
            );
        });

        it('omits chart fields that are absent from the verified query', async () => {
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

            const [, persisted, chartData] = model.markCompleted.mock.calls[0];
            expect(chartData).toEqual({});
            expect(persisted).not.toContain(`<chart id="${chart.queryUuid}"`);
            expect(persisted).toContain('*(chart omitted:');
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

            expect(model.markCancelled).toHaveBeenCalledWith('run-1');
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

    describe('refreshChart', () => {
        const chartDataEntry = {
            source: 'warehouse' as const,
            title: chart.title,
            chartConfig: chart.chartConfig,
            queryUuid: chart.queryUuid,
            derivedFrom: null,
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
            snapshot: null,
        };

        it('re-executes the stored metric query behind a report chart', async () => {
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(
                        runRow({
                            result_chart_data: {
                                [chart.queryUuid]: chartDataEntry,
                            },
                        }),
                    ),
                },
                asyncQueryService: {
                    executeAsyncMetricQuery: vi.fn().mockResolvedValue({
                        queryUuid: 'query-2',
                        cacheMetadata: { cacheHit: true },
                        metricQuery: chartDataEntry.metricQuery,
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
                metricQuery: chartDataEntry.metricQuery,
                context: QueryExecutionContext.AI,
            });
            expect(result).toEqual({
                source: 'semantic',
                type: AiResultType.QUERY_RESULT,
                query: {
                    queryUuid: 'query-2',
                    cacheMetadata: { cacheHit: true },
                    metricQuery: chartDataEntry.metricQuery,
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

        it('rejects a chart key that is not part of the persisted report', async () => {
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi
                        .fn()
                        .mockResolvedValue(runRow({ result_chart_data: {} })),
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

        it('rejects refreshing an inline chart', async () => {
            const { service, asyncQueryService } = buildService({
                model: {
                    findByUuidScoped: vi.fn().mockResolvedValue(
                        runRow({
                            result_chart_data: {
                                'refund-share': {
                                    ...chartDataEntry,
                                    source: 'inline' as const,
                                    queryUuid: null,
                                },
                            },
                        }),
                    ),
                },
            });

            await expect(
                service.refreshChart({
                    account: {} as AnyType,
                    user: userWithProjectAccess(),
                    projectUuid: 'project-1',
                    aiDeepResearchRunUuid: 'run-1',
                    chartKey: 'refund-share',
                }),
            ).rejects.toBeInstanceOf(ParameterError);
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
