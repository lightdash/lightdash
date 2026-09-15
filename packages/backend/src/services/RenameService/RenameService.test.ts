import { Ability } from '@casl/ability';
import {
    ChartType,
    FilterOperator,
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
    ): SavedChartDAO => ({
        ...chart,
        uuid,
        name: uuid,
        tableName,
        metricQuery: {
            ...chart.metricQuery,
            exploreName: tableName,
            metrics: [metric],
            filters: {},
        },
        chartConfig: { type: ChartType.TABLE },
        tableConfig: { columnOrder: [metric] },
        pivotConfig: undefined,
    });
    const charts = [
        makeChart('base-with-joined-only-fields', from, 'customers_count'),
        makeChart('joined-reference', 'payments', 'orders_amount'),
        makeChart('stale-reference-on-destination', to, 'orders_amount'),
        makeChart('already-renamed', to, 'orders_restricted_amount'),
        makeChart('unrelated', 'customers', 'customers_count'),
        {
            ...makeChart(
                'substring-model',
                'archived_orders',
                'archived_orders_amount',
            ),
            chartConfig: {
                type: ChartType.CUSTOM,
                config: {
                    spec: {
                        mark: 'bar',
                        encoding: { x: { field: 'archived_orders_amount' } },
                    },
                },
            },
        } satisfies SavedChartDAO,
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
                    charts.filter(
                        (c) =>
                            c.projectUuid === filters.projectUuid &&
                            (!filters.exploreNames ||
                                filters.exploreNames.includes(c.tableName)),
                    ),
            ),
            get: vi.fn(
                async (uuid: string) => charts.find((c) => c.uuid === uuid)!,
            ),
            createVersion: vi.fn(),
        };
        const bulkDashboardModel = {
            find: vi.fn(async () => [dashboard]),
            getByIdOrSlug: vi.fn(async () => dashboard),
            addVersion: vi.fn(),
        };
        const bulkSchedulerModel = {
            getChartSchedulers: vi.fn(async (uuid: string) =>
                uuid === alert.savedChartUuid ? [alert] : [],
            ),
            getDashboardSchedulers: vi.fn(async () => [dashboardScheduler]),
            updateScheduler: vi.fn(),
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
