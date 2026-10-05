import { Ability } from '@casl/ability';
import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    FilterOperator,
    MetricType,
    NotFoundError,
    OrganizationMemberRole,
    RenameType,
    RequestMethod,
    SchedulerFormat,
    ThresholdOperator,
    type DashboardDAO,
    type PossibleAbilities,
    type SavedChartDAO,
    type SchedulerAndTargets,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { expectedDashboard } from '../../models/DashboardModel/DashboardModel.mock';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { chartMocked } from './rename.mock';
import { RenameService } from './RenameService';

const chart = {
    ...chartMocked,
    tableName: 'orders',
    metricQuery: {
        ...chartMocked.metricQuery,
        exploreName: 'orders',
        dimensions: [],
        metrics: ['orders_amount'],
        sorts: [],
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
    },
    tableConfig: {
        ...chartMocked.tableConfig,
        columnOrder: ['orders_amount'],
    },
};

const savedChartModel = {
    get: vi.fn(async () => chart),
    createVersion: vi.fn<SavedChartModel['createVersion']>(async () => chart),
};
const projectModel = {
    getExploreFromCache: vi.fn(async () => ({})),
};
const spacePermissionService = {
    resolveAccess: vi.fn(async () => ({
        inheritsFromOrgOrProject: true,
        access: [],
    })),
};

const user: SessionUser = {
    userUuid: 'user-uuid',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: chart.organizationUuid,
    organizationName: 'Test organization',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: 'update' },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const service = new RenameService({
    lightdashConfig: lightdashConfigMock,
    analytics: analyticsMock,
    projectModel: projectModel as unknown as ProjectModel,
    savedChartModel: savedChartModel as unknown as SavedChartModel,
    dashboardModel: {} as unknown as DashboardModel,
    schedulerClient: {} as unknown as SchedulerClient,
    schedulerModel: {} as unknown as SchedulerModel,
    spacePermissionService:
        spacePermissionService as unknown as SpacePermissionService,
});

describe('RenameService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    test('persists a chart repointed to a qualified explore', async () => {
        await service.renameChart({
            user,
            projectUuid: chart.projectUuid,
            chartUuid: chart.uuid,
            from: 'orders',
            to: 'sourceA__orders',
            type: RenameType.MODEL,
            context: RequestMethod.WEB_APP,
        });

        expect(savedChartModel.createVersion).toHaveBeenCalledOnce();
        const persistedChart = vi.mocked(savedChartModel.createVersion).mock
            .calls[0]![1];
        expect(persistedChart.tableName).toBe('sourceA__orders');
        expect(persistedChart.metricQuery.exploreName).toBe('sourceA__orders');
        expect(persistedChart.metricQuery.metrics).toEqual([
            'sourceA__orders_amount',
        ]);
        expect(persistedChart.tableConfig.columnOrder).toEqual([
            'sourceA__orders_amount',
        ]);
    });
});

describe('bulk model rename discovery', () => {
    const from = 'orders';
    const to = 'orders_restricted';
    const payload = {
        userUuid: user.userUuid,
        organizationUuid: chart.organizationUuid,
        projectUuid: chart.projectUuid,
        schedulerUuid: undefined,
        context: RequestMethod.CLI,
        type: RenameType.MODEL,
        from,
        to,
        dryRun: true,
    };
    const makeChart = (
        uuid: string,
        tableName: string,
        metric: string,
        filters: SavedChartDAO['metricQuery']['filters'] = {},
        additionalMetrics: SavedChartDAO['metricQuery']['additionalMetrics'] = [],
    ): SavedChartDAO => ({
        ...chart,
        uuid,
        name: uuid,
        tableName,
        metricQuery: {
            ...chart.metricQuery,
            exploreName: tableName,
            metrics: [metric],
            filters,
            additionalMetrics,
        },
        chartConfig: { type: ChartType.TABLE },
        tableConfig: { columnOrder: [metric] },
        pivotConfig: undefined,
    });
    const sqlDimensionChart = makeChart(
        'sql-dimension-owner',
        'customers',
        'orders_archive_amount',
    );
    sqlDimensionChart.metricQuery.customDimensions = [
        {
            id: 'archive-dimension',
            name: 'Archive dimension',
            table: 'orders_archive',
            type: CustomDimensionType.SQL,
            sql: '${orders_archive.amount}',
            dimensionType: DimensionType.NUMBER,
        },
    ];
    const charts = [
        sqlDimensionChart,
        makeChart('base-with-joined-only-fields', from, 'customers_count'),
        makeChart('joined-reference', 'payments', 'orders_amount'),
        makeChart('stale-reference-on-destination', to, 'orders_amount'),
        makeChart('already-renamed', to, 'orders_restricted_amount', {
            metrics: {
                id: 'metric-filters',
                and: [
                    {
                        id: 'metric-filter',
                        target: { fieldId: 'orders_restricted_amount' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [10],
                    },
                ],
            },
            dimensions: {
                id: 'dimension-filters',
                and: [
                    {
                        id: 'dimension-filter',
                        target: { fieldId: 'orders_restricted_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            },
        }),
        makeChart('unrelated', 'customers', 'customers_count'),
        ...['orders_archive', from].map((tableName) =>
            makeChart(
                `${tableName}-custom-metric`,
                'customers',
                `${tableName}_amount_sum`,
                {},
                [
                    {
                        table: tableName,
                        name: 'amount_sum',
                        type: MetricType.SUM,
                        sql: '${TABLE}.amount',
                    },
                ],
            ),
        ),
        makeChart(
            'prefixed-base-joined-reference',
            'orders_archive',
            'orders_amount',
        ),
        ...['archived_orders', 'orders_archive'].map(
            (tableName): SavedChartDAO => ({
                ...makeChart(
                    `${tableName}-chart`,
                    tableName,
                    `${tableName}_amount`,
                ),
                chartConfig: {
                    type: ChartType.CUSTOM,
                    config: {
                        spec: {
                            mark: 'bar',
                            encoding: { x: { field: `${tableName}_amount` } },
                        },
                    },
                },
            }),
        ),
    ];

    const dashboard: DashboardDAO = {
        ...expectedDashboard,
        projectUuid: chart.projectUuid,
        filters: {
            dimensions: [
                {
                    id: 'filter',
                    label: undefined,
                    target: { tableName: from, fieldId: 'orders_status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        },
    };
    const alert: SchedulerAndTargets = {
        pausedReason: null,
        pausedAt: null,
        pausedWarehouseType: null,
        missedRunAt: null,
        runsOnPersonalSignIn: false,
        schedulerUuid: 'alert',
        slug: 'alert',
        name: 'Alert on an unchanged chart',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: user.userUuid,
        createdByName: null,
        format: SchedulerFormat.CSV,
        cron: '0 9 * * *',
        savedChartUuid: 'unrelated',
        savedChartName: 'unrelated',
        dashboardUuid: null,
        dashboardName: null,
        savedSqlUuid: null,
        savedSqlName: null,
        appUuid: null,
        appName: null,
        options: {},
        enabled: true,
        includeLinks: true,
        plainTextEmail: false,
        targets: [],
        thresholds: [
            {
                fieldId: 'orders_amount',
                operator: ThresholdOperator.GREATER_THAN,
                value: 10,
            },
        ],
    };
    const unchangedAlerts: SchedulerAndTargets[] = [
        {
            ...alert,
            schedulerUuid: 'name-only-alert',
            name: 'orders_weekly',
            thresholds: [
                {
                    fieldId: 'customers_count',
                    operator: ThresholdOperator.GREATER_THAN,
                    value: 10,
                },
            ],
        },
        {
            ...alert,
            schedulerUuid: 'already-renamed-alert',
            thresholds: [
                {
                    ...alert.thresholds![0],
                    fieldId: 'orders_restricted_amount',
                },
            ],
        },
        {
            ...alert,
            schedulerUuid: 'prefixed-model-alert',
            savedChartUuid: 'orders_archive-chart',
            thresholds: [
                {
                    ...alert.thresholds![0],
                    fieldId: 'orders_archive_amount',
                },
            ],
        },
        {
            ...alert,
            schedulerUuid: 'prefixed-custom-metric-alert',
            savedChartUuid: 'orders_archive-custom-metric',
            thresholds: [
                {
                    ...alert.thresholds![0],
                    fieldId: 'orders_archive_amount_sum',
                },
            ],
        },
        {
            ...alert,
            schedulerUuid: 'sql-dimension-owner-alert',
            savedChartUuid: sqlDimensionChart.uuid,
            thresholds: [
                {
                    ...alert.thresholds![0],
                    fieldId: 'orders_archive_amount',
                },
            ],
        },
    ];
    const dashboardScheduler: SchedulerAndTargets = {
        ...alert,
        schedulerUuid: 'dashboard-scheduler',
        name: 'Dashboard delivery',
        savedChartUuid: null,
        savedChartName: null,
        dashboardUuid: dashboard.uuid,
        dashboardName: dashboard.name,
        thresholds: undefined,
        filters: dashboard.filters.dimensions,
        selectedTabs: null,
    };

    const setup = (cachedNames: string[]) => {
        let persistedCharts = charts;
        let persistedDashboard = dashboard;
        let persistedSchedulers = [
            alert,
            ...unchangedAlerts,
            dashboardScheduler,
        ];
        const bulkProjectModel = {
            getSummary: vi.fn(async () => ({
                organizationUuid: chart.organizationUuid,
            })),
            getExploreFromCache: vi.fn(
                async (_projectUuid: string, name: string) => {
                    if (!cachedNames.includes(name)) {
                        throw new NotFoundError('Explore not cached');
                    }
                    return { name };
                },
            ),
            getAllExploresFromCache: vi.fn(async () =>
                Object.fromEntries(
                    cachedNames.map((name) => [
                        name,
                        {
                            name,
                            joinedTables:
                                name === 'payments' ? [{ table: from }] : [],
                        },
                    ]),
                ),
            ),
        };
        const bulkSavedChartModel = {
            find: vi.fn(
                async (filters: Parameters<SavedChartModel['find']>[0]) =>
                    persistedCharts.filter(
                        (c) =>
                            c.projectUuid === filters.projectUuid &&
                            (!filters.exploreNames ||
                                filters.exploreNames.includes(c.tableName)),
                    ),
            ),
            get: vi.fn(
                async (uuid: string) =>
                    persistedCharts.find((c) => c.uuid === uuid)!,
            ),
            createVersion: vi.fn(
                async (uuid: string, updated: SavedChartDAO) => {
                    persistedCharts = persistedCharts.map((c) =>
                        c.uuid === uuid ? updated : c,
                    );
                    return updated;
                },
            ),
        };
        const bulkDashboardModel = {
            find: vi.fn(async () => [persistedDashboard]),
            getByIdOrSlug: vi.fn(async () => persistedDashboard),
            addVersion: vi.fn(async (_uuid: string, updated: DashboardDAO) => {
                persistedDashboard = updated;
                return updated;
            }),
        };
        const bulkSchedulerModel = {
            getChartSchedulers: vi.fn(async (uuid: string) =>
                persistedSchedulers.filter((s) => s.savedChartUuid === uuid),
            ),
            getDashboardSchedulers: vi.fn(async (uuid: string) =>
                persistedSchedulers.filter((s) => s.dashboardUuid === uuid),
            ),
            updateScheduler: vi.fn(async (updated: SchedulerAndTargets) => {
                persistedSchedulers = persistedSchedulers.map((s) =>
                    s.schedulerUuid === updated.schedulerUuid ? updated : s,
                );
                return updated;
            }),
        };
        return {
            bulkProjectModel,
            bulkSavedChartModel,
            bulkDashboardModel,
            bulkSchedulerModel,
            bulkService: new RenameService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                projectModel: bulkProjectModel as unknown as ProjectModel,
                savedChartModel:
                    bulkSavedChartModel as unknown as SavedChartModel,
                dashboardModel: bulkDashboardModel as unknown as DashboardModel,
                schedulerModel: bulkSchedulerModel as unknown as SchedulerModel,
                schedulerClient: {} as SchedulerClient,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            }),
        };
    };

    test('repeating a completed model rename reports no changes and performs no writes', async () => {
        const {
            bulkService,
            bulkSavedChartModel,
            bulkDashboardModel,
            bulkSchedulerModel,
        } = setup([]);
        await bulkService.runScheduledRenameResources({
            ...payload,
            dryRun: false,
        });
        vi.clearAllMocks();

        const noChanges = {
            charts: [],
            dashboards: [],
            alerts: [],
            dashboardSchedulers: [],
        };
        expect(
            await bulkService.previewRenameResources({
                ...payload,
                user: {
                    ...user,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: 'update' },
                    ]),
                },
            }),
        ).toEqual(noChanges);
        expect(await bulkService.runScheduledRenameResources(payload)).toEqual(
            noChanges,
        );
        expect(
            await bulkService.runScheduledRenameResources({
                ...payload,
                dryRun: false,
            }),
        ).toEqual(noChanges);
        expect(bulkSavedChartModel.createVersion).not.toHaveBeenCalled();
        expect(bulkDashboardModel.addVersion).not.toHaveBeenCalled();
        expect(bulkSchedulerModel.updateScheduler).not.toHaveBeenCalled();
    });

    test('keeps field renames scoped to their explore and cached joins', async () => {
        const { bulkService } = setup([from, to, 'payments']);
        const result = await bulkService.runScheduledRenameResources({
            ...payload,
            type: RenameType.FIELD,
            model: from,
            from: 'orders_amount',
            to: 'orders_total',
            fromReference: 'orders.amount',
            toReference: 'orders.total',
            fromFieldName: 'amount',
            toFieldName: 'total',
        });
        expect(result).toEqual({
            charts: [{ uuid: 'joined-reference', name: 'joined-reference' }],
            dashboards: [],
            alerts: [],
            dashboardSchedulers: [],
        });
    });

    test.each([
        { cache: 'source only', names: [from] },
        { cache: 'destination only', names: [to] },
        { cache: 'both', names: [from, to] },
        { cache: 'neither', names: [] },
    ])(
        'previews the same persisted changes with $cache cached as apply after recompilation',
        async ({ names }) => {
            const {
                bulkService,
                bulkProjectModel,
                bulkSavedChartModel,
                bulkDashboardModel,
                bulkSchedulerModel,
            } = setup(names);
            const expected = {
                charts: [
                    {
                        uuid: 'base-with-joined-only-fields',
                        name: 'base-with-joined-only-fields',
                    },
                    { uuid: 'joined-reference', name: 'joined-reference' },
                    {
                        uuid: 'stale-reference-on-destination',
                        name: 'stale-reference-on-destination',
                    },
                    {
                        uuid: 'orders-custom-metric',
                        name: 'orders-custom-metric',
                    },
                    {
                        uuid: 'prefixed-base-joined-reference',
                        name: 'prefixed-base-joined-reference',
                    },
                ],
                dashboards: [{ uuid: dashboard.uuid, name: dashboard.name }],
                alerts: [{ uuid: 'alert', name: alert.name }],
                dashboardSchedulers: [
                    {
                        uuid: 'dashboard-scheduler',
                        name: dashboardScheduler.name,
                    },
                ],
            };
            const preview = await bulkService.previewRenameResources({
                ...payload,
                user: {
                    ...user,
                    ability: new Ability<PossibleAbilities>([
                        { subject: 'Project', action: 'update' },
                    ]),
                },
            });
            expect(preview).toEqual(expected);
            expect(
                await bulkService.runScheduledRenameResources(payload),
            ).toEqual(expected);
            expect(bulkSavedChartModel.createVersion).not.toHaveBeenCalled();
            expect(bulkDashboardModel.addVersion).not.toHaveBeenCalled();
            expect(bulkSchedulerModel.updateScheduler).not.toHaveBeenCalled();

            bulkProjectModel.getExploreFromCache.mockRejectedValue(
                new NotFoundError('Recompiling'),
            );
            bulkProjectModel.getAllExploresFromCache.mockResolvedValue({});
            const applied = await bulkService.runScheduledRenameResources({
                ...payload,
                dryRun: false,
                // UI fix-all jobs carry references and model as well as from/to.
                model: from,
                fromReference: from,
                toReference: to,
            });
            expect(applied).toEqual(expected);
            expect(
                bulkSavedChartModel.createVersion.mock.calls.map(
                    ([uuid]) => uuid,
                ),
            ).toEqual(expected.charts.map(({ uuid }) => uuid));
            expect(bulkSavedChartModel.createVersion).toHaveBeenCalledWith(
                'orders-custom-metric',
                expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        metrics: ['orders_restricted_amount_sum'],
                        additionalMetrics: [
                            expect.objectContaining({ table: to }),
                        ],
                    }),
                }),
                undefined,
            );
            expect(
                bulkDashboardModel.addVersion,
            ).toHaveBeenCalledExactlyOnceWith(
                dashboard.uuid,
                expect.objectContaining({
                    filters: expect.objectContaining({
                        dimensions: [
                            expect.objectContaining({
                                target: {
                                    tableName: to,
                                    fieldId: 'orders_restricted_status',
                                },
                            }),
                        ],
                    }),
                }),
                { userUuid: user.userUuid },
                chart.projectUuid,
            );
            expect(
                bulkSchedulerModel.updateScheduler.mock.calls.map(
                    ([scheduler]) => scheduler,
                ),
            ).toEqual([
                {
                    ...alert,
                    thresholds: [
                        {
                            ...alert.thresholds![0],
                            fieldId: 'orders_restricted_amount',
                        },
                    ],
                },
                {
                    ...dashboardScheduler,
                    filters: [
                        expect.objectContaining({
                            target: {
                                tableName: to,
                                fieldId: 'orders_restricted_status',
                            },
                        }),
                    ],
                },
            ]);
        },
    );
});
