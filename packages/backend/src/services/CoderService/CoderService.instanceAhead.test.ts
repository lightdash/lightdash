import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ChartAsCode,
    ChartType,
    ContentAsCodeType,
    DashboardAsCode,
    DashboardDAO,
    OrganizationMemberRole,
    PossibleAbilities,
    ProjectType,
    PromotionAction,
    SavedChartDAO,
    SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock'; // pragma: allowlist secret
import { lightdashConfigMock } from '../../config/lightdashConfig.mock'; // pragma: allowlist secret
import { CoderService } from './CoderService';
import { hashContentAsCodeDocument } from './contentAsCodeHash';
import { getInstanceAheadSkipWarning } from './contentAsCodeSkip';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const USER_UUID = 'user-uuid';
const SPACE_UUID = 'space-uuid';
const CHART_UUID = 'chart-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

const project = {
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    upstreamProjectUuid: null,
    type: ProjectType.DEFAULT,
    createdByUserUuid: USER_UUID,
};

const space = {
    uuid: SPACE_UUID,
    name: 'Space',
    path: 'space',
};

const makeSessionUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[] = [
        {
            subject: 'ContentAsCode',
            action: ['view', 'create', 'manage'],
            conditions: { projectUuid: PROJECT_UUID },
        },
        {
            subject: 'Dashboard',
            action: ['promote', 'manage', 'update'],
        },
        {
            subject: 'SavedChart',
            action: ['promote', 'manage', 'update'],
        },
    ],
): SessionUser =>
    ({
        userUuid: USER_UUID,
        userId: 1,
        email: 'owner@example.com',
        firstName: 'Sync',
        lastName: 'Owner',
        organizationUuid: ORGANIZATION_UUID,
        role: OrganizationMemberRole.MEMBER,
        isActive: true,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const instanceChartDao = {
    uuid: CHART_UUID,
    name: 'Instance chart',
    description: null,
    tableName: 'orders',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        dimensionOverrides: {},
    },
    chartConfig: { type: ChartType.TABLE, config: {} },
    pivotConfig: undefined,
    dashboardUuid: null,
    slug: 'orders',
    tableConfig: { columnOrder: [] },
    spaceUuid: SPACE_UUID,
    parameters: undefined,
} as unknown as SavedChartDAO;

const incomingChartAsCode = {
    name: 'Git chart',
    description: null,
    tableName: 'orders',
    metricQuery: instanceChartDao.metricQuery,
    chartConfig: instanceChartDao.chartConfig,
    slug: 'orders',
    tableConfig: { columnOrder: [] },
    dashboardSlug: undefined,
    version: 1,
    spaceSlug: 'space',
} as unknown as ChartAsCode;

const instanceDashboardDao = {
    uuid: DASHBOARD_UUID,
    name: 'Instance dashboard',
    description: undefined,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
    slug: 'overview',
    spaceUuid: SPACE_UUID,
} as unknown as DashboardDAO;

const incomingDashboardAsCode = {
    name: 'Git dashboard',
    slug: 'overview',
    spaceSlug: 'space',
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
    version: 1,
} as unknown as DashboardAsCode;

const transformChart = (chart: SavedChartDAO) =>
    (
        CoderService as unknown as {
            transformChart: (...args: unknown[]) => ChartAsCode;
        }
    ).transformChart(chart, [space], {}, new Map());

const transformDashboard = (dashboard: DashboardDAO) =>
    (
        CoderService as unknown as {
            transformDashboard: (...args: unknown[]) => DashboardAsCode;
        }
    ).transformDashboard(dashboard, [space], new Map());

type AppliedRevisionModel = {
    upsertMany: ReturnType<typeof vi.fn>;
    listByProject: ReturnType<typeof vi.fn>;
    findBySlug: ReturnType<typeof vi.fn>;
};

const buildService = (appliedRevisionModel: AppliedRevisionModel) => {
    const savedChartModel = {
        find: vi.fn(async () => [
            {
                uuid: CHART_UUID,
                slug: 'orders',
                name: 'Instance chart',
                spaceUuid: SPACE_UUID,
            },
        ]),
        get: vi.fn(async () => instanceChartDao),
        create: vi.fn(async () => ({ uuid: CHART_UUID })),
        getSlugAliasesForUuids: vi.fn(async () => []),
    };
    const dashboardModel = {
        find: vi.fn(async () => [{ uuid: DASHBOARD_UUID }]),
        getByIdOrSlug: vi.fn(async () => instanceDashboardDao),
        create: vi.fn(),
        getSlugsForUuids: vi.fn(async () => ({})),
    };
    const promoteService = {
        getPromoteCharts: vi.fn(),
        getPromotedDashboard: vi.fn(),
        getPromotionDashboardChanges: vi.fn(),
        getOrCreateDashboard: vi.fn(async (_user, changes) => changes),
        updateDashboard: vi.fn(async (_user, changes) => changes),
        getChartChanges: vi.fn(async () => ({
            spaces: [],
            dashboards: [],
            charts: [
                {
                    action: PromotionAction.UPDATE,
                    data: { uuid: CHART_UUID },
                },
            ],
        })),
        upsertCharts: vi.fn(async (_user, changes) => changes),
    };

    const service = new CoderService({
        lightdashConfig: lightdashConfigMock, // pragma: allowlist secret
        analytics: analyticsMock, // pragma: allowlist secret
        projectModel: {
            get: vi.fn(async () => project),
            getSummary: vi.fn(async () => project),
        } as never,
        savedChartModel: savedChartModel as never,
        savedSqlModel: { find: vi.fn(async () => []) } as never,
        appModel: {} as never,
        dashboardModel: dashboardModel as never,
        spaceModel: {
            find: vi.fn(async () => [space]),
            createSpace: vi.fn(),
            findClosestAncestorByPath: vi.fn(async () => null),
            getSpaceSummary: vi.fn(),
        } as never,
        schedulerModel: {} as never,
        schedulerService: {} as never,
        savedChartService: {} as never,
        dashboardService: {} as never,
        schedulerClient: {} as never,
        promoteService: promoteService as never,
        spacePermissionService: {} as never,
        contentVerificationModel: {
            getByContentUuids: vi.fn(async () => new Map()),
        } as never,
        contentAsCodeAppliedRevisionModel: appliedRevisionModel as never,
        groupsModel: {} as never,
        organizationMemberProfileModel: {} as never,
        userModel: {} as never,
    });

    vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
        space: { uuid: SPACE_UUID, path: 'space' } as never,
        created: false,
    });

    return { service, savedChartModel, dashboardModel, promoteService };
};

const lastAppliedRevision = (contentHash: string) => ({
    contentType: ContentAsCodeType.CHART,
    slug: 'orders',
    contentHash,
    snapshot: {},
    appliedAt: new Date('2026-08-01T00:00:00.000Z'),
    appliedByUserUuid: USER_UUID,
});

describe('CoderService instance-ahead upload skip', () => {
    it('applies a chart when no last-applied marker exists', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => undefined),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                incomingChartAsCode.slug,
                incomingChartAsCode,
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.UPDATE }],
        });
        expect(promoteService.upsertCharts).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('applies git when the instance still matches last-applied', async () => {
        const instanceHash = hashContentAsCodeDocument(
            transformChart(instanceChartDao),
        );
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => lastAppliedRevision(instanceHash)),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                incomingChartAsCode.slug,
                incomingChartAsCode,
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.UPDATE }],
        });
        expect(promoteService.upsertCharts).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('uses the existing path when instance already matches incoming', async () => {
        const instanceDocument = transformChart(instanceChartDao);
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () =>
                lastAppliedRevision('stale-last-applied'),
            ),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                instanceDocument.slug,
                instanceDocument,
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.UPDATE }],
        });
        expect(promoteService.upsertCharts).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('skips a chart when the instance is ahead and incoming also differs', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () =>
                lastAppliedRevision('old-snapshot-hash'),
            ),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                incomingChartAsCode.slug,
                incomingChartAsCode,
            ),
        ).resolves.toEqual(
            expect.objectContaining({
                charts: [
                    expect.objectContaining({
                        action: PromotionAction.NO_CHANGES,
                    }),
                ],
                warnings: [
                    getInstanceAheadSkipWarning(
                        ContentAsCodeType.CHART,
                        incomingChartAsCode.slug,
                    ),
                ],
            }),
        );
        expect(promoteService.upsertCharts).not.toHaveBeenCalled();
        expect(promoteService.getPromoteCharts).not.toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
        expect(service.getOrCreateSpace).not.toHaveBeenCalled();
    });

    it('skips a chart when the instance drifted and git still matches last-applied', async () => {
        const incomingHash = hashContentAsCodeDocument(incomingChartAsCode);
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => lastAppliedRevision(incomingHash)),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        const result = await service.upsertChart(
            makeSessionUser(),
            PROJECT_UUID,
            incomingChartAsCode.slug,
            incomingChartAsCode,
        );

        expect(result.warnings).toEqual([
            getInstanceAheadSkipWarning(
                ContentAsCodeType.CHART,
                incomingChartAsCode.slug,
            ),
        ]);
        expect(result.charts[0]?.action).toBe(PromotionAction.NO_CHANGES);
        expect(promoteService.upsertCharts).not.toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
    });

    it('overwrites instance-ahead charts when force is set', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () =>
                lastAppliedRevision('old-snapshot-hash'),
            ),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                incomingChartAsCode.slug,
                incomingChartAsCode,
                { force: true },
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.UPDATE }],
        });
        expect(appliedRevisionModel.findBySlug).not.toHaveBeenCalled();
        expect(promoteService.upsertCharts).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('creates a chart even when a stale last-applied row exists', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () =>
                lastAppliedRevision('old-snapshot-hash'),
            ),
        };
        const { service, savedChartModel, promoteService } = buildService(
            appliedRevisionModel,
        );
        savedChartModel.find.mockResolvedValue([]);

        await expect(
            service.upsertChart(
                makeSessionUser(),
                PROJECT_UUID,
                incomingChartAsCode.slug,
                incomingChartAsCode,
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.CREATE }],
        });
        expect(appliedRevisionModel.findBySlug).not.toHaveBeenCalled();
        expect(savedChartModel.create).toHaveBeenCalled();
        expect(promoteService.upsertCharts).not.toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('skips a dashboard when the instance is ahead', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => ({
                ...lastAppliedRevision('old-snapshot-hash'),
                contentType: ContentAsCodeType.DASHBOARD,
                slug: 'overview',
            })),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);

        await expect(
            service.upsertDashboard(
                makeSessionUser(),
                PROJECT_UUID,
                incomingDashboardAsCode.slug,
                incomingDashboardAsCode,
            ),
        ).resolves.toEqual(
            expect.objectContaining({
                dashboards: [
                    expect.objectContaining({
                        action: PromotionAction.NO_CHANGES,
                    }),
                ],
                warnings: [
                    getInstanceAheadSkipWarning(
                        ContentAsCodeType.DASHBOARD,
                        incomingDashboardAsCode.slug,
                    ),
                ],
            }),
        );
        expect(promoteService.getPromotedDashboard).not.toHaveBeenCalled();
        expect(promoteService.updateDashboard).not.toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).not.toHaveBeenCalled();
        expect(service.getOrCreateSpace).not.toHaveBeenCalled();
    });

    it('applies a dashboard when the instance still matches last-applied', async () => {
        const instanceHash = hashContentAsCodeDocument(
            transformDashboard(instanceDashboardDao),
        );
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => ({
                ...lastAppliedRevision(instanceHash),
                contentType: ContentAsCodeType.DASHBOARD,
                slug: 'overview',
            })),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);
        vi.mocked(promoteService.getPromotedDashboard).mockResolvedValue({
            promotedDashboard: {
                dashboard: instanceDashboardDao,
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORGANIZATION_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
            upstreamDashboard: {
                dashboard: instanceDashboardDao,
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORGANIZATION_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
        } as never);
        vi.mocked(
            promoteService.getPromotionDashboardChanges,
        ).mockResolvedValue([
            {
                dashboards: [
                    {
                        action: PromotionAction.UPDATE,
                        data: { uuid: DASHBOARD_UUID },
                    },
                ],
                charts: [],
                spaces: [],
            },
            [],
        ] as never);

        await expect(
            service.upsertDashboard(
                makeSessionUser(),
                PROJECT_UUID,
                incomingDashboardAsCode.slug,
                incomingDashboardAsCode,
            ),
        ).resolves.toMatchObject({
            dashboards: [{ action: PromotionAction.UPDATE }],
        });
        expect(promoteService.updateDashboard).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });

    it('overwrites instance-ahead dashboards when force is set', async () => {
        const appliedRevisionModel = {
            upsertMany: vi.fn(async () => undefined),
            listByProject: vi.fn(),
            findBySlug: vi.fn(async () => ({
                ...lastAppliedRevision('old-snapshot-hash'),
                contentType: ContentAsCodeType.DASHBOARD,
                slug: 'overview',
            })),
        };
        const { service, promoteService } = buildService(appliedRevisionModel);
        vi.mocked(promoteService.getPromotedDashboard).mockResolvedValue({
            promotedDashboard: {
                dashboard: instanceDashboardDao,
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORGANIZATION_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
            upstreamDashboard: {
                dashboard: instanceDashboardDao,
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORGANIZATION_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
        } as never);
        vi.mocked(
            promoteService.getPromotionDashboardChanges,
        ).mockResolvedValue([
            {
                dashboards: [
                    {
                        action: PromotionAction.UPDATE,
                        data: { uuid: DASHBOARD_UUID },
                    },
                ],
                charts: [],
                spaces: [],
            },
            [],
        ] as never);

        await expect(
            service.upsertDashboard(
                makeSessionUser(),
                PROJECT_UUID,
                incomingDashboardAsCode.slug,
                incomingDashboardAsCode,
                { force: true },
            ),
        ).resolves.toMatchObject({
            dashboards: [{ action: PromotionAction.UPDATE }],
        });
        expect(appliedRevisionModel.findBySlug).not.toHaveBeenCalled();
        expect(promoteService.updateDashboard).toHaveBeenCalled();
        expect(appliedRevisionModel.upsertMany).toHaveBeenCalled();
    });
});
