import { Ability } from '@casl/ability';
import {
    ChartType,
    ComposerChartNotSupportedError,
    ContentAsCodeType,
    NotFoundError,
    PossibleAbilities,
    PromotionAction,
    QuerySourceType,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    type AnyType,
    type ComposerChartAsCode,
    type ComposerSavedChartDAO,
    type SavedChartDAO,
    type SavedChartVariant,
    type SavedComposerPipelineNode,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const projectUuid = 'project-uuid';
const space = {
    uuid: 'space-uuid',
    name: 'Reports',
    slug: 'reports',
    path: 'reports',
};
const dashboard = { uuid: 'dashboard-uuid', slug: 'revenue-dashboard' };
const classicChart: SavedChartDAO = {
    uuid: 'classic-uuid',
    projectUuid,
    organizationUuid: 'org-uuid',
    slug: 'orders-by-status',
    name: 'Orders by status',
    description: undefined,
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
    tableConfig: { columnOrder: [] },
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    spaceUuid: space.uuid,
    spaceName: space.name,
    dashboardUuid: null,
    dashboardName: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: { colors: [] } as AnyType,
    verification: null,
};
const composerChart: ComposerSavedChartDAO = {
    uuid: 'composer-uuid',
    projectUuid,
    organizationUuid: 'org-uuid',
    slug: 'revenue-share-by-status',
    name: 'Revenue share by status',
    description: 'Share of revenue per order status',
    pipeline: {
        schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
                limit: 500,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'share',
                sql: 'SELECT orders_status, orders_total_order_amount / SUM(orders_total_order_amount) OVER () AS revenue_share FROM orders',
                references: ['orders'],
                limit: 100,
            },
        ],
        terminalNodeId: 'share',
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: {
                xField: 'composer_result_orders_status',
                yField: ['composer_result_revenue_share'],
            },
            eChartsConfig: { series: [] },
        },
    },
    pivotConfig: undefined,
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    spaceUuid: space.uuid,
    spaceName: space.name,
    dashboardUuid: dashboard.uuid,
    dashboardName: 'Revenue dashboard',
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: { colors: [] } as AnyType,
    verification: null,
};
const variants: Record<string, SavedChartVariant> = {
    [classicChart.uuid]: { queryType: 'semantic', chart: classicChart },
    [composerChart.uuid]: { queryType: 'composer', chart: composerChart },
};
const admin = {
    userUuid: 'admin-uuid',
    organizationUuid: 'org-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;

const buildService = () => {
    const savedChartModel = {
        find: vi.fn(async () => [
            {
                uuid: classicChart.uuid,
                slug: classicChart.slug,
                spaceUuid: space.uuid,
            },
            {
                uuid: composerChart.uuid,
                slug: composerChart.slug,
                spaceUuid: space.uuid,
            },
        ]),
        getVariant: vi.fn(async (uuid: string) => {
            const variant = variants[uuid];
            if (!variant) throw new Error(`unexpected read of ${uuid}`);
            return variant;
        }),
        getSlugsForUuids: vi.fn(async () => []),
        getSlugAliasesForUuids: vi.fn(async () => []),
    };
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
        },
        savedChartModel,
        dashboardModel: {
            getSlugsForUuids: vi.fn(async () => ({
                [dashboard.uuid]: dashboard.slug,
            })),
        },
        spaceModel: { find: vi.fn(async () => [space]) },
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        },
        appModel: { findAppsByUuids: vi.fn(async () => []) },
    } as AnyType);
    return { service, savedChartModel };
};

describe('content-as-code chart download with a composer chart', () => {
    it('emits the composer chart as a pipeline document beside the classic chart', async () => {
        const { service } = buildService();

        const results = await service.getChartsForRead(admin, projectUuid, [
            classicChart.slug,
            composerChart.slug,
        ]);

        expect(results.charts.map((chart) => chart.slug)).toEqual([
            classicChart.slug,
            composerChart.slug,
        ]);
        expect(results.charts[1]).toEqual({
            name: composerChart.name,
            description: composerChart.description,
            slug: composerChart.slug,
            pipeline: composerChart.pipeline,
            chartConfig: composerChart.chartConfig,
            pivotConfig: undefined,
            updatedAt: composerChart.updatedAt,
            dashboardSlug: dashboard.slug,
            spaceSlug: space.slug,
            version: 1,
            contentType: ContentAsCodeType.CHART,
            downloadedAt: expect.any(Date),
            verified: undefined,
            verification: null,
        });
        expect(results).not.toHaveProperty('skippedCharts');
        expect(results.missingIds).toEqual([]);
    });

    it.each([
        ['space', { spaceUuid: 'gone-space-uuid' }],
        ['dashboard', { dashboardUuid: 'gone-dashboard-uuid' }],
    ])(
        'leaves out a composer chart whose %s is gone and warns once with its uuid',
        async (_missing, orphaned) => {
            const { service, savedChartModel } = buildService();
            savedChartModel.getVariant.mockImplementation(async (uuid) =>
                uuid === composerChart.uuid
                    ? {
                          queryType: 'composer',
                          chart: { ...composerChart, ...orphaned },
                      }
                    : variants[uuid],
            );
            const warn = vi
                .spyOn((service as AnyType).logger, 'warn')
                .mockImplementation(() => undefined);

            const results = await service.getChartsForRead(admin, projectUuid, [
                classicChart.slug,
                composerChart.slug,
            ]);

            expect(results.charts.map((chart) => chart.slug)).toEqual([
                classicChart.slug,
            ]);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain(composerChart.uuid);
        },
    );

    it.each([
        ['space', { spaceUuid: 'gone-space-uuid' }],
        ['dashboard', { dashboardUuid: 'gone-dashboard-uuid' }],
    ])(
        'a single read of a composer chart whose %s is gone is not found',
        async (_missing, orphaned) => {
            const { service, savedChartModel } = buildService();
            savedChartModel.getVariant.mockResolvedValueOnce({
                queryType: 'composer',
                chart: { ...composerChart, ...orphaned },
            });

            await expect(
                service.getCurrentChartAsCode(composerChart.uuid),
            ).rejects.toBeInstanceOf(NotFoundError);
        },
    );

    it('drops the empty config a table chart stores, so the file validates', async () => {
        const { service, savedChartModel } = buildService();
        savedChartModel.getVariant.mockResolvedValueOnce({
            queryType: 'composer',
            chart: {
                ...composerChart,
                chartConfig: { type: ChartType.TABLE, config: null } as AnyType,
            },
        });

        const chartAsCode = await service.getCurrentChartAsCode(
            composerChart.uuid,
        );

        expect(chartAsCode.chartConfig).toEqual({ type: ChartType.TABLE });
    });
});

const composerFile: ComposerChartAsCode = {
    name: composerChart.name,
    description: composerChart.description,
    slug: composerChart.slug,
    pipeline: composerChart.pipeline,
    chartConfig: composerChart.chartConfig,
    pivotConfig: undefined,
    dashboardSlug: dashboard.slug,
    spaceSlug: space.slug,
    version: 1,
    contentType: ContentAsCodeType.CHART,
};

const buildUploadService = ({
    existing = null,
    flagEnabled = true,
}: {
    existing?: SavedChartVariant | null;
    flagEnabled?: boolean;
} = {}) => {
    const savedChartModel = {
        find: vi.fn(async () =>
            existing
                ? [
                      {
                          uuid: existing.chart.uuid,
                          slug: existing.chart.slug,
                          spaceUuid: space.uuid,
                      },
                  ]
                : [],
        ),
        getVariant: vi.fn(async () => existing),
        // The classic read refuses composer rows, as the real model does
        get: vi.fn(async (_uuid: string) => {
            if (existing?.queryType === 'composer') {
                throw new ComposerChartNotSupportedError(
                    existing.chart.uuid,
                    existing.chart.name,
                );
            }
            return existing?.chart;
        }),
        createComposerChart: vi.fn(async () => composerChart),
        createComposerChartVersion: vi.fn(async () => composerChart),
    };
    const projectService = {
        assertMetricQueryAuthoring: vi.fn(async () => undefined),
    };
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid: 'org-uuid',
            })),
        },
        savedChartModel,
        // Classic uploads read the chart through promotion, which refuses composer rows
        promoteService: {
            getPromoteCharts: vi.fn(async (_user, _project, uuid: string) => {
                await savedChartModel.get(uuid);
                throw new Error('classic promotion is not under test here');
            }),
        } as AnyType,
        dashboardModel: {
            find: vi.fn(async () => [
                { uuid: dashboard.uuid, spaceUuid: space.uuid },
            ]),
        },
        spaceModel: { find: vi.fn(async () => [space]) },
        spacePermissionService: {
            can: vi.fn(async () => true),
            resolveAccessBatch: vi.fn(
                async (
                    _userUuid: string,
                    targets: { type: 'space'; spaceUuid: string }[],
                ) =>
                    targets.map((target) => ({
                        target,
                        context: {
                            organizationUuid: 'org-uuid',
                            projectUuid,
                            inheritsFromOrgOrProject: true,
                            access: [],
                        },
                    })),
            ),
        },
        featureFlagModel: {
            get: vi.fn(async () => ({ enabled: flagEnabled })),
        },
        projectService,
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        },
        agentActionLogModel: { insert: vi.fn() },
    } as AnyType);
    return { service, savedChartModel, projectService };
};

describe('content-as-code upload of a composer chart file', () => {
    it('creates the chart through the composer writer with the file slug and its dashboard', async () => {
        const { service, savedChartModel } = buildUploadService();

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            composerFile.slug,
            composerFile,
            { syncEnabled: false },
        );

        expect(savedChartModel.createComposerChart).toHaveBeenCalledWith(
            projectUuid,
            admin.userUuid,
            {
                name: composerFile.name,
                description: composerFile.description,
                dashboardUuid: dashboard.uuid,
                pipeline: composerFile.pipeline,
                chartConfig: composerFile.chartConfig,
                pivotConfig: undefined,
                slug: composerFile.slug,
                forceSlug: true,
            },
        );
        expect(changes.charts).toEqual([]);
        expect(changes.composerCharts).toEqual([
            {
                action: PromotionAction.CREATE,
                data: {
                    ...composerChart,
                    spaceSlug: space.slug,
                    spacePath: space.path,
                    oldUuid: composerChart.uuid,
                },
            },
        ]);
    });
});

describe('content-as-code upload stores the terminal closure, as save does', () => {
    it('drops a node the terminal node never reads and checks authoring for the stored nodes only', async () => {
        const { service, savedChartModel, projectService } =
            buildUploadService();
        const unreadNode: SavedComposerPipelineNode = {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'customers',
            exploreName: 'customers',
            dimensions: ['customers_segment'],
            metrics: [],
            limit: 500,
        };
        const file: ComposerChartAsCode = {
            ...composerFile,
            pipeline: {
                ...composerFile.pipeline,
                nodes: [...composerFile.pipeline.nodes, unreadNode],
            },
        };

        await service.upsertChart(admin, projectUuid, file.slug, file, {
            syncEnabled: false,
        });

        expect(savedChartModel.createComposerChart).toHaveBeenCalledWith(
            projectUuid,
            admin.userUuid,
            expect.objectContaining({ pipeline: composerFile.pipeline }),
        );
        expect(projectService.assertMetricQueryAuthoring).toHaveBeenCalledTimes(
            1,
        );
        expect(projectService.assertMetricQueryAuthoring).toHaveBeenCalledWith(
            expect.objectContaining({
                metricQuery: expect.objectContaining({ exploreName: 'orders' }),
            }),
        );
    });
});

describe('content-as-code upload refuses what save refuses', () => {
    it('refuses when the compose flag is off', async () => {
        const { service, savedChartModel } = buildUploadService({
            flagEnabled: false,
        });
        await expect(
            service.upsertChart(
                admin,
                projectUuid,
                composerFile.slug,
                composerFile,
                {
                    syncEnabled: false,
                },
            ),
        ).rejects.toThrow('Multi-source queries are not enabled');
        expect(savedChartModel.createComposerChart).not.toHaveBeenCalled();
    });

    it('refuses a node kind a composer chart cannot store, naming the node', async () => {
        const { service, savedChartModel } = buildUploadService();
        const file: ComposerChartAsCode = {
            ...composerFile,
            pipeline: {
                ...composerFile.pipeline,
                nodes: [
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'orders',
                        sql: 'select 1 as orders_status',
                    } as AnyType,
                    composerFile.pipeline.nodes[1],
                ],
            },
        };
        await expect(
            service.upsertChart(admin, projectUuid, file.slug, file, {
                syncEnabled: false,
            }),
        ).rejects.toThrow(
            'Composer pipeline node "orders" is a sql node, which a composer chart cannot store.',
        );
        expect(savedChartModel.createComposerChart).not.toHaveBeenCalled();
    });

    it('refuses a node that reads a query result by uuid', async () => {
        const { service } = buildUploadService();
        const file: ComposerChartAsCode = {
            ...composerFile,
            pipeline: {
                ...composerFile.pipeline,
                nodes: [
                    composerFile.pipeline.nodes[0],
                    {
                        ...composerFile.pipeline.nodes[1],
                        references: ['11111111-2222-4333-8444-555555555555'],
                    } as AnyType,
                ],
            },
        };
        await expect(
            service.upsertChart(admin, projectUuid, file.slug, file, {
                syncEnabled: false,
            }),
        ).rejects.toThrow(
            'Node "share" reads a query result by uuid, which expires; a composer chart stores nodes only.',
        );
    });
});

describe('content-as-code upload applies the authoring rules of save', () => {
    it('refuses a custom chart type by name', async () => {
        const { service } = buildUploadService();
        const file = {
            ...composerFile,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: { dataAppVizSlug: 'my-viz' },
            },
        } as AnyType as ComposerChartAsCode;
        await expect(
            service.upsertChart(admin, projectUuid, file.slug, file, {
                syncEnabled: false,
            }),
        ).rejects.toThrow(
            'A custom chart type cannot be saved to a dashboard yet',
        );
    });

    it('checks every semantic node as the uploader would author it, and writes nothing when one is refused', async () => {
        const { service, savedChartModel, projectService } =
            buildUploadService();
        projectService.assertMetricQueryAuthoring.mockRejectedValueOnce(
            new Error('You cannot query the "orders" explore'),
        );
        await expect(
            service.upsertChart(
                admin,
                projectUuid,
                composerFile.slug,
                composerFile,
                {
                    syncEnabled: false,
                },
            ),
        ).rejects.toThrow('You cannot query the "orders" explore');
        expect(projectService.assertMetricQueryAuthoring).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid,
                metricQuery: expect.objectContaining({
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_total_order_amount'],
                }),
            }),
        );
        expect(savedChartModel.createComposerChart).not.toHaveBeenCalled();
    });

    it('refuses a DuckDB node for an uploader who cannot author multi-source queries', async () => {
        const { service, savedChartModel } = buildUploadService();
        const editor = {
            ...admin,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'ContentAsCode' },
                { action: 'manage', subject: 'SavedChart' },
                { action: 'manage', subject: 'Dashboard' },
                { action: 'manage', subject: 'Space' },
                { action: 'view', subject: 'Explore' },
            ]),
        } as unknown as SessionUser;
        await expect(
            service.upsertChart(
                editor,
                projectUuid,
                composerFile.slug,
                composerFile,
                {
                    syncEnabled: false,
                },
            ),
        ).rejects.toThrow(
            'You cannot author multi-source queries in this project',
        );
        expect(savedChartModel.createComposerChart).not.toHaveBeenCalled();
    });
});

describe('content-as-code upload onto an existing chart', () => {
    const classicFile = {
        name: classicChart.name,
        description: classicChart.description,
        slug: composerChart.slug,
        tableName: classicChart.tableName,
        metricQuery: classicChart.metricQuery,
        chartConfig: classicChart.chartConfig,
        spaceSlug: space.slug,
        dashboardSlug: undefined,
        version: 1,
    };

    it('refuses a composer file whose slug belongs to a classic chart', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: variants[classicChart.uuid],
        });
        await expect(
            service.upsertChart(
                admin,
                projectUuid,
                composerFile.slug,
                composerFile,
                {
                    syncEnabled: false,
                },
            ),
        ).rejects.toThrow(
            `Chart "${composerFile.slug}" is a classic chart; a composer chart file cannot replace it.`,
        );
        expect(
            savedChartModel.createComposerChartVersion,
        ).not.toHaveBeenCalled();
    });

    it('refuses a classic file whose slug belongs to a composer chart', async () => {
        const { service } = buildUploadService({
            existing: variants[composerChart.uuid],
        });
        await expect(
            service.upsertChart(
                admin,
                projectUuid,
                classicFile.slug,
                classicFile,
                {
                    syncEnabled: false,
                },
            ),
        ).rejects.toThrow(
            `Chart "${classicFile.slug}" is a composer chart; a classic chart file cannot replace it.`,
        );
    });

    it('appends a composer version when the file differs from the stored chart', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: variants[composerChart.uuid],
        });
        const renamed = { ...composerFile, name: 'Revenue share (renamed)' };

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            renamed.slug,
            renamed,
            { syncEnabled: false },
        );

        expect(savedChartModel.createComposerChartVersion).toHaveBeenCalledWith(
            composerChart.uuid,
            admin.userUuid,
            {
                name: renamed.name,
                description: renamed.description,
                pipeline: renamed.pipeline,
                chartConfig: renamed.chartConfig,
                pivotConfig: undefined,
            },
        );
        expect(changes.composerCharts?.[0].action).toBe(PromotionAction.UPDATE);
        expect(changes.composerCharts?.[0].data.uuid).toBe(composerChart.uuid);
    });

    it('writes nothing when the file matches the stored chart', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: variants[composerChart.uuid],
        });

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            composerFile.slug,
            composerFile,
            { syncEnabled: false },
        );

        expect(
            savedChartModel.createComposerChartVersion,
        ).not.toHaveBeenCalled();
        expect(changes.composerCharts?.[0].action).toBe(
            PromotionAction.NO_CHANGES,
        );
    });

    it('treats a table file without config as matching a stored null config', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: {
                queryType: 'composer',
                chart: {
                    ...composerChart,
                    chartConfig: {
                        type: ChartType.TABLE,
                        config: null,
                    } as AnyType,
                },
            },
        });

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            composerFile.slug,
            { ...composerFile, chartConfig: { type: ChartType.TABLE } },
            { syncEnabled: false },
        );

        expect(
            savedChartModel.createComposerChartVersion,
        ).not.toHaveBeenCalled();
        expect(changes.composerCharts?.[0].action).toBe(
            PromotionAction.NO_CHANGES,
        );
    });

    it('clears the stored description when the file has none', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: variants[composerChart.uuid],
        });
        const { description, ...withoutDescription } = composerFile;

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            composerFile.slug,
            withoutDescription,
            { syncEnabled: false },
        );

        expect(savedChartModel.createComposerChartVersion).toHaveBeenCalledWith(
            composerChart.uuid,
            admin.userUuid,
            expect.objectContaining({
                name: composerFile.name,
                description: null,
            }),
        );
        expect(changes.composerCharts?.[0].action).toBe(PromotionAction.UPDATE);
    });

    it('writes a version anyway when the upload is forced', async () => {
        const { service, savedChartModel } = buildUploadService({
            existing: variants[composerChart.uuid],
        });

        const changes = await service.upsertChart(
            admin,
            projectUuid,
            composerFile.slug,
            composerFile,
            { syncEnabled: false, force: true },
        );

        expect(savedChartModel.createComposerChartVersion).toHaveBeenCalled();
        expect(changes.composerCharts?.[0].action).toBe(PromotionAction.UPDATE);
    });
});

describe('content-as-code dashboard download with a composer tile', () => {
    const tile = (
        uuid: string,
        chartSlug: string,
        queryType: 'semantic' | 'composer',
    ) => ({
        uuid,
        type: 'saved_chart',
        x: 0,
        y: 0,
        h: 3,
        w: 6,
        tabUuid: undefined,
        properties: {
            title: '',
            hideTitle: false,
            savedChartUuid: `${chartSlug}-uuid`,
            belongsToDashboard: true,
            chartName: chartSlug,
            chartSlug,
            lastVersionChartKind: 'table',
            queryType,
        },
    });
    const dashboardDao = {
        uuid: dashboard.uuid,
        slug: dashboard.slug,
        name: 'Revenue dashboard',
        description: undefined,
        projectUuid,
        organizationUuid: 'org-uuid',
        spaceUuid: space.uuid,
        updatedAt: new Date('2026-02-01T00:00:00Z'),
        tiles: [
            tile('tile-1', classicChart.slug, 'semantic'),
            tile('tile-2', composerChart.slug, 'composer'),
        ],
        filters: { dimensions: [], metrics: [], tableCalculations: [] },
        tabs: [],
        parameters: undefined,
        config: undefined,
    };

    it('marks the composer tile with its query type and leaves classic tiles as they were', async () => {
        const service = new CoderService({
            lightdashConfig: lightdashConfigMock,
            projectModel: {
                get: vi.fn(async () => ({
                    projectUuid,
                    organizationUuid: 'org-uuid',
                })),
            },
            dashboardModel: {
                find: vi.fn(async () => [
                    {
                        uuid: dashboard.uuid,
                        slug: dashboard.slug,
                        spaceUuid: space.uuid,
                    },
                ]),
                getByIdOrSlug: vi.fn(async () => dashboardDao),
                getSlugAliasesForUuids: vi.fn(async () => []),
            },
            savedChartModel: {
                getLatestVersionQueriesBySlugs: vi.fn(async () => ({})),
            },
            spaceModel: { find: vi.fn(async () => [space]) },
            contentVerificationModel: {
                getByContentUuids: vi.fn(async () => new Map()),
            },
            dashboardService: {
                areDashboardControlsEnabled: vi.fn(async () => false),
            },
        } as AnyType);

        const results = await service.getDashboardsForRead(admin, projectUuid, [
            dashboard.slug,
        ]);

        const tiles = results.dashboards[0].tiles.map((t) => t.properties);
        expect(tiles[0]).not.toHaveProperty('queryType');
        expect(tiles[1]).toMatchObject({
            chartSlug: composerChart.slug,
            queryType: 'composer',
        });
    });
});
