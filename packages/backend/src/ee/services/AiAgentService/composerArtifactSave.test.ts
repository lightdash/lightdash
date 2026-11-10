import {
    ChartType,
    FeatureFlags,
    ForbiddenError,
    NotSupportedError,
    ParameterError,
    QuerySourceType,
    type SessionUser,
} from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const agent = {
    uuid: 'agent-uuid',
    name: 'Agent',
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    adminOnly: false,
    userAccess: [],
    groupAccess: [],
};

const orders = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
};

const byStatus = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'by_status',
    sql: 'SELECT * FROM orders',
    references: ['orders'],
};

const barByStatus = {
    type: 'bar',
    x: 'orders_status',
    y: ['orders_total_order_amount'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

const composerConfig = {
    source: 'composer',
    schemaVersion: 2,
    queries: [orders, byStatus],
    terminalNodeId: 'by_status',
    vizConfig: null,
};

const artifact = {
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    title: 'Revenue by status',
    description: null,
    chartConfig: composerConfig,
};

const artifactThread = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
};

const resultColumns = {
    orders_status: { reference: 'orders_status', type: 'string' },
    orders_total_order_amount: {
        reference: 'orders_total_order_amount',
        type: 'number',
    },
};

const savedChart = {
    uuid: 'chart-uuid',
    name: 'Revenue by status',
    slug: 'revenue-by-status',
    chartConfig: { type: ChartType.TABLE },
};

const dashboard = { uuid: 'dashboard-uuid', tiles: [] };

const args = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
    dashboardUuid: 'dashboard-uuid',
};

type CaslSubject = { __caslSubjectType__?: string };

/** Fake thread owner: every ability except, when `canAuthor` is false, managing explores. */
const makeUser = (canAuthor: boolean) => {
    const allowed = (action: string, subject: CaslSubject | string) =>
        canAuthor ||
        !(
            action === 'manage' &&
            typeof subject === 'object' &&
            subject.__caslSubjectType__ === 'Explore'
        );
    return {
        userUuid: 'owner-uuid',
        userId: 1,
        email: 'owner@example.com',
        firstName: 'Owner',
        lastName: 'User',
        organizationUuid: 'org-uuid',
        organizationName: 'Org',
        organizationCreatedAt: new Date(),
        isActive: true,
        isSetupComplete: true,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        ability: {
            can: vi.fn(allowed),
            cannot: vi.fn(
                (action: string, subject: CaslSubject | string) =>
                    !allowed(action, subject),
            ),
            relevantRuleFor: vi.fn(
                (action: string, subject: CaslSubject | string) =>
                    allowed(action, subject) ? { inverted: false } : null,
            ),
            rules: [],
        },
        abilityRules: [],
    } as unknown as SessionUser;
};

const buildService = (
    overrides: {
        chartConfig?: Record<string, unknown>;
        flagEnabled?: boolean;
        chartsFlagEnabled?: boolean;
        appendTileError?: Error;
    } = {},
) => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue(agent),
        getArtifact: vi.fn().mockResolvedValue({
            ...artifact,
            chartConfig: overrides.chartConfig ?? composerConfig,
        }),
        findThread: vi.fn().mockResolvedValue(artifactThread),
        getThread: vi.fn().mockResolvedValue({ user: { uuid: 'owner-uuid' } }),
        updateArtifactVersion: vi.fn().mockResolvedValue(undefined),
    };
    const querySourceService = {
        submitQueries: vi.fn().mockResolvedValue({
            queries: [
                { nodeId: 'orders', queryUuid: 'orders-query' },
                { nodeId: 'by_status', queryUuid: 'by-status-query' },
            ],
        }),
    };
    const queryHistoryModel = {
        pollForQueryCompletion: vi
            .fn()
            .mockResolvedValue({ columns: resultColumns }),
    };
    const asyncQueryService = {
        assertMetricQueryAuthoring: vi.fn().mockResolvedValue(undefined),
    };
    const savedChartService = {
        createComposerChart: vi.fn().mockResolvedValue(savedChart),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const dashboardService = {
        appendChartTile: overrides.appendTileError
            ? vi.fn().mockRejectedValue(overrides.appendTileError)
            : vi.fn().mockResolvedValue(dashboard),
    };
    const service = new AiAgentService({
        aiAgentModel,
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
        featureFlagService: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.ComposerSqlRunnerCharts
                            ? (overrides.chartsFlagEnabled ?? true)
                            : (overrides.flagEnabled ?? true),
                }),
            ),
        },
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ organizationUuid: 'org-uuid' }),
        },
        querySourceService,
        queryHistoryModel,
        asyncQueryService,
        savedChartService,
        dashboardService,
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(
        service as unknown as { getIsCopilotEnabled: () => Promise<boolean> },
        'getIsCopilotEnabled',
    ).mockResolvedValue(true);
    vi.spyOn(
        service as unknown as {
            getArtifactQuerySurface: () => Promise<string>;
        },
        'getArtifactQuerySurface',
    ).mockResolvedValue('ai_agent');
    return {
        service,
        aiAgentModel,
        querySourceService,
        asyncQueryService,
        savedChartService,
        dashboardService,
    };
};

describe('AiAgentService.saveComposerArtifactToDashboard', () => {
    it('stores an artifact without a viz config as a table chart and backlinks the version', async () => {
        const deps = buildService();

        const result = await deps.service.saveComposerArtifactToDashboard(
            makeUser(true),
            args,
        );

        expect(
            deps.asyncQueryService.assertMetricQueryAuthoring,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_order_amount'],
                }),
            }),
        );
        expect(deps.savedChartService.createComposerChart).toHaveBeenCalledWith(
            expect.anything(),
            'project-uuid',
            {
                name: 'Revenue by status',
                description: null,
                dashboardUuid: 'dashboard-uuid',
                pipeline: {
                    schemaVersion: 1,
                    nodes: [orders, byStatus],
                    terminalNodeId: 'by_status',
                },
                chartConfig: { type: ChartType.TABLE },
                pivotConfig: undefined,
            },
        );
        expect(deps.dashboardService.appendChartTile).toHaveBeenCalledWith(
            expect.anything(),
            'dashboard-uuid',
            savedChart,
            { projectUuid: 'project-uuid' },
        );
        expect(deps.aiAgentModel.updateArtifactVersion).toHaveBeenCalledWith(
            'version-uuid',
            {
                savedQueryUuid: 'chart-uuid',
                savedDashboardUuid: 'dashboard-uuid',
            },
        );
        expect(result).toEqual({ chart: savedChart, dashboard });
    });

    it('converts a bar viz config once, over composer result field ids', async () => {
        const deps = buildService({
            chartConfig: {
                ...composerConfig,
                vizConfig: { ...barByStatus, groupBy: ['orders_status'] },
            },
        });

        await deps.service.saveComposerArtifactToDashboard(
            makeUser(true),
            args,
        );

        const written = deps.savedChartService.createComposerChart.mock
            .calls[0][2] as {
            chartConfig: { type: string; config: { layout: unknown } };
            pivotConfig: unknown;
        };
        expect(written.chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(written.chartConfig.config.layout).toMatchObject({
            xField: 'composer_result_orders_status',
            yField: ['composer_result_orders_total_order_amount'],
        });
        expect(written.pivotConfig).toEqual({
            columns: ['composer_result_orders_status'],
        });
    });

    it('refuses when the composer charts flag is off, before running anything', async () => {
        const deps = buildService({ chartsFlagEnabled: false });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow('Composer charts are not enabled');
        expect(deps.querySourceService.submitQueries).not.toHaveBeenCalled();
        expect(
            deps.savedChartService.createComposerChart,
        ).not.toHaveBeenCalled();
    });

    it('refuses when the compose flag is off, before running anything', async () => {
        const deps = buildService({ flagEnabled: false });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow(/not enabled/);
        expect(deps.querySourceService.submitQueries).not.toHaveBeenCalled();
        expect(
            deps.savedChartService.createComposerChart,
        ).not.toHaveBeenCalled();
    });

    it('refuses an author who cannot author multi-source queries, before running anything', async () => {
        const deps = buildService();

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(false), args),
        ).rejects.toThrow(ForbiddenError);
        expect(deps.querySourceService.submitQueries).not.toHaveBeenCalled();
        expect(
            deps.savedChartService.createComposerChart,
        ).not.toHaveBeenCalled();
    });

    it('refuses a python node by name, before running anything', async () => {
        const deps = buildService({
            chartConfig: {
                ...composerConfig,
                queries: [
                    orders,
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'by_status',
                        code: 'result = inputs["orders"]',
                        references: ['orders'],
                    },
                ],
            },
        });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow(/by_status/);
        expect(deps.querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('refuses a custom chart type by name, before running anything', async () => {
        const deps = buildService({
            chartConfig: {
                ...composerConfig,
                vizConfig: {
                    type: 'custom',
                    customChartTypeSlug: 'ribbon',
                    fieldMapping: {},
                    options: null,
                    dataAppVizUuid: 'viz-uuid',
                    dataAppVizVersion: null,
                },
            },
        });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow(NotSupportedError);
        expect(deps.querySourceService.submitQueries).not.toHaveBeenCalled();
    });

    it('refuses a v1 composer artifact', async () => {
        const deps = buildService({
            chartConfig: { ...composerConfig, schemaVersion: 1 },
        });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow(ParameterError);
    });

    it('removes the chart and leaves the version unlinked when the tile cannot be added', async () => {
        const deps = buildService({
            appendTileError: new ForbiddenError('No dashboard access'),
        });

        await expect(
            deps.service.saveComposerArtifactToDashboard(makeUser(true), args),
        ).rejects.toThrow('No dashboard access');
        expect(deps.savedChartService.delete).toHaveBeenCalledWith(
            expect.anything(),
            'chart-uuid',
        );
        expect(deps.aiAgentModel.updateArtifactVersion).not.toHaveBeenCalled();
    });
});
