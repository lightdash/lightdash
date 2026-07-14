import { Ability, type RawRuleOf } from '@casl/ability';
import {
    AnyType,
    ChartAsCode,
    CustomDimensionType,
    DashboardAsCode,
    DashboardTileTypes,
    DimensionType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    PromotionAction,
    SessionUser,
    SpaceMemberRole,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const SPACE_UUID = 'space-uuid';
const OTHER_SPACE_UUID = 'other-space-uuid';
const PARENT_SPACE_UUID = 'parent-space-uuid';
const NEW_SPACE_UUID = 'new-space-uuid';

const makeUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[],
): SessionUser =>
    ({
        userUuid: 'user-uuid',
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORG_UUID,
        role: OrganizationMemberRole.MEMBER,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const chartAsCode = {
    name: 'Chart',
    slug: 'chart',
    spaceSlug: 'space',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    tableConfig: { columnOrder: [] },
    chartConfig: { type: 'table', config: {} },
} as unknown as ChartAsCode;

const dashboardAsCode = {
    name: 'Dashboard',
    slug: 'dashboard',
    spaceSlug: 'space',
    tiles: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tabs: [],
} as unknown as DashboardAsCode;

const buildService = () =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid: PROJECT_UUID,
                organizationUuid: ORG_UUID,
            })),
        } as AnyType,
        savedChartModel: {
            find: vi.fn(async () => []),
            get: vi.fn(),
            create: vi.fn(),
        } as AnyType,
        savedSqlModel: {
            find: vi.fn(async () => []),
        } as AnyType,
        dashboardModel: {
            find: vi.fn(async () => []),
            create: vi.fn(),
            getByIdOrSlug: vi.fn(),
        } as AnyType,
        spaceModel: {
            find: vi.fn(async () => [
                {
                    uuid: SPACE_UUID,
                    path: 'space',
                },
            ]),
            createSpace: vi.fn(),
            findClosestAncestorByPath: vi.fn(async () => null),
            getSpaceSummary: vi.fn(),
        } as AnyType,
        schedulerModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        schedulerClient: {} as AnyType,
        promoteService: {
            getPromoteCharts: vi.fn(),
            getPromotedDashboard: vi.fn(),
            getPromotionDashboardChanges: vi.fn(),
            getOrCreateDashboard: vi.fn(async (user, changes) => changes),
            updateDashboard: vi.fn(async (user, changes) => changes),
            getChartChanges: vi.fn(async () => ({
                spaces: [],
                dashboards: [],
                charts: [
                    {
                        action: PromotionAction.NO_CHANGES,
                        data: { uuid: 'chart-uuid' },
                    },
                ],
            })),
            upsertCharts: vi.fn(async (user, changes) => changes),
        } as AnyType,
        spacePermissionService: {
            can: vi.fn(async () => true),
            getSpacesAccessContext: vi.fn(async () => ({
                [SPACE_UUID]: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: true,
                    access: [],
                },
                [OTHER_SPACE_UUID]: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: true,
                    access: [],
                },
            })),
        } as AnyType,
        contentVerificationModel: {} as AnyType,
    });

describe('CoderService content-as-code space permissions', () => {
    const chartCreateRules: RawRuleOf<Ability<PossibleAbilities>>[] = [
        { subject: 'ContentAsCode', action: 'create' },
        {
            subject: 'SavedChart',
            action: 'create',
            conditions: { projectUuid: PROJECT_UUID },
        },
    ];

    const prepareChartCreate = (service: CoderService) => {
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.savedChartModel.create).mockResolvedValue({
            uuid: 'chart-uuid',
        } as AnyType);
    };

    it('allows write-only callers to create basic charts', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeUser(chartCreateRules),
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).resolves.toMatchObject({ charts: [{ action: 'create' }] });
    });

    it('allows write-only callers to create formula table calculations', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeUser(chartCreateRules),
                PROJECT_UUID,
                chartAsCode.slug,
                {
                    ...chartAsCode,
                    metricQuery: {
                        ...chartAsCode.metricQuery,
                        tableCalculations: [
                            {
                                name: 'formula',
                                displayName: 'Formula',
                                formula: '=A1',
                            },
                        ],
                    },
                },
            ),
        ).resolves.toMatchObject({ charts: [{ action: 'create' }] });
    });

    it('rejects custom SQL dimensions without CustomFields manage', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeUser(chartCreateRules),
                PROJECT_UUID,
                chartAsCode.slug,
                {
                    ...chartAsCode,
                    metricQuery: {
                        ...chartAsCode.metricQuery,
                        customDimensions: [
                            {
                                id: 'sql_dim',
                                name: 'sql_dim',
                                table: 'orders',
                                type: CustomDimensionType.SQL,
                                sql: '${TABLE}.status',
                                dimensionType: DimensionType.STRING,
                            },
                        ],
                    },
                },
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('rejects SQL table calculations without CustomSqlTableCalculations manage', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeUser(chartCreateRules),
                PROJECT_UUID,
                chartAsCode.slug,
                {
                    ...chartAsCode,
                    metricQuery: {
                        ...chartAsCode.metricQuery,
                        tableCalculations: [
                            {
                                name: 'sql_calc',
                                displayName: 'SQL calc',
                                sql: '${orders.count} + 1',
                            },
                        ],
                    },
                },
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('lets manage upload any content without SQL and space checks', async () => {
        const service = buildService();
        prepareChartCreate(service);
        const chartWithSql = {
            ...chartAsCode,
            metricQuery: {
                ...chartAsCode.metricQuery,
                customDimensions: [
                    {
                        id: 'sql_dim',
                        name: 'sql_dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.status',
                        dimensionType: DimensionType.STRING,
                    },
                ],
            },
        } as ChartAsCode;

        await expect(
            service.upsertChart(
                makeUser([{ subject: 'ContentAsCode', action: 'manage' }]),
                PROJECT_UUID,
                chartWithSql.slug,
                chartWithSql,
            ),
        ).resolves.toMatchObject({ charts: [{ action: 'create' }] });
        expect(
            service.spacePermissionService.getSpacesAccessContext,
        ).not.toHaveBeenCalled();
    });

    it('does not let ContentAsCode alone create charts in a space', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([{ subject: 'ContentAsCode', action: 'create' }]);

        await expect(
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('requires create Space before write-only callers create a new space', async () => {
        const service = buildService();
        vi.mocked(service.spaceModel.find).mockResolvedValue([]);
        const user = makeUser(chartCreateRules);

        await expect(
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('rejects creating a chart below a restricted parent without creating an orphan space', async () => {
        const service = buildService();
        vi.mocked(service.spaceModel.find).mockResolvedValue([]);
        vi.mocked(
            service.spaceModel.findClosestAncestorByPath,
        ).mockResolvedValue(PARENT_SPACE_UUID);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockResolvedValue({
            [PARENT_SPACE_UUID]: {
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
            },
        });
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Space',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'create',
                conditions: {
                    access: {
                        $elemMatch: {
                            userUuid: 'user-uuid',
                            role: SpaceMemberRole.EDITOR,
                        },
                    },
                },
            },
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                spaceSlug: 'restricted/new-space',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('rechecks a newly created chart target space before moving content', async () => {
        const service = buildService();
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: SPACE_UUID,
                metricQuery: {
                    tableCalculations: [],
                    customDimensions: [],
                },
            } as AnyType,
        ]);
        vi.mocked(service.savedChartModel.get).mockResolvedValue({
            uuid: 'chart-uuid',
            spaceUuid: SPACE_UUID,
            metricQuery: {
                tableCalculations: [],
                customDimensions: [],
            },
        } as AnyType);
        vi.mocked(service.spaceModel.find).mockResolvedValue([]);
        vi.mocked(
            service.spaceModel.findClosestAncestorByPath,
        ).mockResolvedValue(PARENT_SPACE_UUID);
        vi.mocked(service.spaceModel.getSpaceSummary).mockResolvedValue({
            uuid: PARENT_SPACE_UUID,
            path: 'restricted',
            inheritParentPermissions: true,
        } as AnyType);
        vi.mocked(service.spaceModel.createSpace).mockResolvedValue({
            uuid: NEW_SPACE_UUID,
            path: 'restricted.new_space',
            inheritParentPermissions: true,
        } as AnyType);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockImplementation(async (_userUuid, spaceUuids) =>
            Object.fromEntries(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    {
                        organizationUuid: ORG_UUID,
                        projectUuid: PROJECT_UUID,
                        inheritsFromOrgOrProject: false,
                        access:
                            spaceUuid === SPACE_UUID
                                ? [
                                      {
                                          userUuid: 'user-uuid',
                                          role: SpaceMemberRole.EDITOR,
                                          hasDirectAccess: true,
                                          projectRole: undefined,
                                          inheritedRole: undefined,
                                          inheritedFrom: undefined,
                                      },
                                  ]
                                : [],
                        admins: [],
                    },
                ]),
            ),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Space',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'update',
                conditions: {
                    access: {
                        $elemMatch: {
                            userUuid: 'user-uuid',
                            role: SpaceMemberRole.EDITOR,
                        },
                    },
                },
            },
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                spaceSlug: 'restricted/new-space',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(service.spaceModel.createSpace).toHaveBeenCalledOnce();
        expect(service.promoteService.getPromoteCharts).not.toHaveBeenCalled();
    });

    it('does not let ContentAsCode alone create dashboards in a space', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([{ subject: 'ContentAsCode', action: 'create' }]);

        await expect(
            service.upsertDashboard(
                user,
                PROJECT_UUID,
                dashboardAsCode.slug,
                dashboardAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.dashboardModel.create).not.toHaveBeenCalled();
    });

    it('does not let ContentAsCode alone update or move charts across spaces', async () => {
        const service = buildService();
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: OTHER_SPACE_UUID,
                metricQuery: {
                    tableCalculations: [],
                    customDimensions: [],
                },
            } as AnyType,
        ]);
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([{ subject: 'ContentAsCode', action: 'create' }]);

        await expect(
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.promoteService.getPromoteCharts).not.toHaveBeenCalled();
    });

    it('checks chart update access before loading existing SQL details', async () => {
        const service = buildService();
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([{ subject: 'ContentAsCode', action: 'create' }]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                metricQuery: {
                    ...chartAsCode.metricQuery,
                    customDimensions: [
                        {
                            id: 'sql_dim',
                            name: 'sql_dim',
                            table: 'orders',
                            type: CustomDimensionType.SQL,
                            sql: '${TABLE}.status',
                            dimensionType: DimensionType.STRING,
                        },
                    ],
                },
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.get).not.toHaveBeenCalled();
        expect(service.promoteService.getPromoteCharts).not.toHaveBeenCalled();
        expect(service.getOrCreateSpace).not.toHaveBeenCalled();
    });

    it('does not let chart create attach to a dashboard without dashboard update access', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            {
                uuid: 'dashboard-uuid',
                spaceUuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'SavedChart',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                dashboardSlug: 'dashboard',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('does not let ContentAsCode alone update dashboards into target spaces', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            name: 'Dashboard',
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([{ subject: 'ContentAsCode', action: 'create' }]);

        await expect(
            service.upsertDashboard(
                user,
                PROJECT_UUID,
                dashboardAsCode.slug,
                dashboardAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(
            service.promoteService.getPromotedDashboard,
        ).not.toHaveBeenCalled();
    });

    it('allows write-only callers to update dashboards in accessible spaces', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            name: 'Dashboard',
            spaceUuid: SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.mocked(
            service.promoteService.getPromotedDashboard,
        ).mockResolvedValue({
            promotedDashboard: {
                dashboard: { uuid: 'dashboard-uuid', name: 'Dashboard' },
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
            upstreamDashboard: {
                dashboard: { uuid: 'dashboard-uuid', name: 'Dashboard' },
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            },
        } as AnyType);
        vi.mocked(
            service.promoteService.getPromotionDashboardChanges,
        ).mockResolvedValue([
            {
                dashboards: [
                    {
                        action: PromotionAction.UPDATE,
                        data: { uuid: 'dashboard-uuid' },
                    },
                ],
                charts: [],
                spaces: [],
            },
            [],
        ] as AnyType);
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'Dashboard',
                action: 'promote',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertDashboard(
                user,
                PROJECT_UUID,
                dashboardAsCode.slug,
                dashboardAsCode,
            ),
        ).resolves.toMatchObject({
            dashboards: [{ action: PromotionAction.UPDATE }],
        });
    });

    it('rejects moving a dashboard out of a restricted current space before promotion', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            name: 'Dashboard',
            spaceUuid: OTHER_SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockImplementation(async (_userUuid, spaceUuids) =>
            Object.fromEntries(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    {
                        organizationUuid: ORG_UUID,
                        projectUuid:
                            spaceUuid === OTHER_SPACE_UUID
                                ? 'restricted-project'
                                : PROJECT_UUID,
                        inheritsFromOrgOrProject: true,
                        access: [],
                        admins: [],
                    },
                ]),
            ),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'Dashboard',
                action: 'promote',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertDashboard(
                user,
                PROJECT_UUID,
                dashboardAsCode.slug,
                dashboardAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(
            service.promoteService.getPromotedDashboard,
        ).not.toHaveBeenCalled();
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('does not let chart update bypass dashboard access for dashboard-contained charts', async () => {
        const service = buildService();
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: null,
                dashboardUuid: 'dashboard-uuid',
                metricQuery: {
                    tableCalculations: [],
                    customDimensions: [],
                },
            } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            spaceUuid: OTHER_SPACE_UUID,
        } as AnyType);
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'SavedChart',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.promoteService.getPromoteCharts).not.toHaveBeenCalled();
    });

    it('does not let chart create attach to a dashboard without SavedChart create access in the dashboard space', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            {
                uuid: 'dashboard-uuid',
                spaceUuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockImplementation(async (_userUuid, spaceUuids) =>
            Object.fromEntries(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    {
                        organizationUuid: ORG_UUID,
                        projectUuid: PROJECT_UUID,
                        inheritsFromOrgOrProject: false,
                        access:
                            spaceUuid === SPACE_UUID
                                ? [
                                      {
                                          userUuid: 'user-uuid',
                                          role: SpaceMemberRole.EDITOR,
                                          hasDirectAccess: true,
                                          projectRole: undefined,
                                          inheritedRole: undefined,
                                          inheritedFrom: undefined,
                                      },
                                  ]
                                : [],
                        admins: [],
                    },
                ]),
            ),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'SavedChart',
                action: 'create',
                conditions: {
                    access: {
                        $elemMatch: {
                            userUuid: 'user-uuid',
                            role: SpaceMemberRole.EDITOR,
                        },
                    },
                },
            },
            {
                subject: 'Dashboard',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                dashboardSlug: 'dashboard',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('allows unchanged SQL-bearing chart items when current chart has full details', async () => {
        const service = buildService();
        const chartWithSql = {
            ...chartAsCode,
            metricQuery: {
                ...chartAsCode.metricQuery,
                customDimensions: [
                    {
                        id: 'sql_dim',
                        name: 'sql_dim',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: '${TABLE}.status',
                        dimensionType: DimensionType.STRING,
                    },
                ],
                tableCalculations: [
                    {
                        name: 'sql_calc',
                        displayName: 'SQL calc',
                        sql: '${orders.count} + 1',
                    },
                ],
            },
        } as ChartAsCode;
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(service.savedChartModel.get).mockResolvedValue({
            uuid: 'chart-uuid',
            spaceUuid: SPACE_UUID,
            metricQuery: chartWithSql.metricQuery,
        } as AnyType);
        vi.mocked(service.promoteService.getPromoteCharts).mockResolvedValue({
            promotedChart: { chart: { uuid: 'chart-uuid' } },
            upstreamChart: { chart: { uuid: 'chart-uuid' } },
        } as AnyType);
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'SavedChart',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartWithSql.slug,
                chartWithSql,
            ),
        ).resolves.toMatchObject({
            charts: [{ action: PromotionAction.NO_CHANGES }],
        });
        expect(service.savedChartModel.get).toHaveBeenCalledWith('chart-uuid');
        expect(service.promoteService.getPromoteCharts).toHaveBeenCalled();
    });

    it('does not let dashboard create reference tile charts from inaccessible spaces', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'private-chart-uuid',
                slug: 'private-chart',
                spaceUuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockImplementation(async (_userUuid, spaceUuids) =>
            Object.fromEntries(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    {
                        organizationUuid: ORG_UUID,
                        projectUuid: PROJECT_UUID,
                        inheritsFromOrgOrProject: false,
                        access:
                            spaceUuid === SPACE_UUID
                                ? [
                                      {
                                          userUuid: 'user-uuid',
                                          role: SpaceMemberRole.EDITOR,
                                          hasDirectAccess: true,
                                          projectRole: undefined,
                                          inheritedRole: undefined,
                                          inheritedFrom: undefined,
                                      },
                                  ]
                                : [],
                        admins: [],
                    },
                ]),
            ),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'view',
                conditions: {
                    access: {
                        $elemMatch: {
                            userUuid: 'user-uuid',
                            role: SpaceMemberRole.EDITOR,
                        },
                    },
                },
            },
        ]);

        await expect(
            service.upsertDashboard(user, PROJECT_UUID, dashboardAsCode.slug, {
                ...dashboardAsCode,
                tiles: [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 3,
                        w: 3,
                        properties: { chartSlug: 'private-chart' },
                    },
                ],
            } as DashboardAsCode),
        ).rejects.toThrow(ForbiddenError);
        expect(service.dashboardModel.create).not.toHaveBeenCalled();
    });

    it('does not let dashboard update reference tile charts from inaccessible spaces', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            name: 'Dashboard',
            spaceUuid: SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'private-chart-uuid',
                slug: 'private-chart',
                spaceUuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(
            service.spacePermissionService.getSpacesAccessContext,
        ).mockImplementation(async (_userUuid, spaceUuids) =>
            Object.fromEntries(
                spaceUuids.map((spaceUuid) => [
                    spaceUuid,
                    {
                        organizationUuid: ORG_UUID,
                        projectUuid: PROJECT_UUID,
                        inheritsFromOrgOrProject: false,
                        access:
                            spaceUuid === SPACE_UUID
                                ? [
                                      {
                                          userUuid: 'user-uuid',
                                          role: SpaceMemberRole.EDITOR,
                                          hasDirectAccess: true,
                                          projectRole: undefined,
                                          inheritedRole: undefined,
                                          inheritedFrom: undefined,
                                      },
                                  ]
                                : [],
                        admins: [],
                    },
                ]),
            ),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'Dashboard',
                action: 'promote',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'view',
                conditions: {
                    access: {
                        $elemMatch: {
                            userUuid: 'user-uuid',
                            role: SpaceMemberRole.EDITOR,
                        },
                    },
                },
            },
        ]);

        await expect(
            service.upsertDashboard(user, PROJECT_UUID, dashboardAsCode.slug, {
                ...dashboardAsCode,
                tiles: [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 3,
                        w: 3,
                        properties: { chartSlug: 'private-chart' },
                    },
                ],
            } as DashboardAsCode),
        ).rejects.toThrow(ForbiddenError);
        expect(
            service.promoteService.getPromotedDashboard,
        ).not.toHaveBeenCalled();
    });

    it('allows dashboard create with tile charts the caller can view', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'accessible-chart-uuid',
                slug: 'accessible-chart',
                spaceUuid: SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.create).mockResolvedValue({
            uuid: 'dashboard-uuid',
        } as AnyType);
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'view',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertDashboard(user, PROJECT_UUID, dashboardAsCode.slug, {
                ...dashboardAsCode,
                tiles: [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 3,
                        w: 3,
                        properties: { chartSlug: 'accessible-chart' },
                    },
                ],
            } as DashboardAsCode),
        ).resolves.toMatchObject({
            dashboards: [{ action: PromotionAction.CREATE }],
        });
        expect(service.dashboardModel.create).toHaveBeenCalled();
    });

    it('allows chart create to create a placeholder dashboard in the same allowed space', async () => {
        const service = buildService();
        vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        vi.mocked(service.dashboardModel.find).mockResolvedValue([]);
        vi.mocked(service.dashboardModel.create).mockResolvedValue({
            uuid: 'dashboard-uuid',
        } as AnyType);
        vi.mocked(service.savedChartModel.create).mockResolvedValue({
            uuid: 'chart-uuid',
        } as AnyType);
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'SavedChart',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'Dashboard',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                dashboardSlug: 'new-dashboard',
            }),
        ).resolves.toMatchObject({
            charts: [{ action: 'create' }],
            dashboards: [],
        });
        expect(service.dashboardModel.create).toHaveBeenCalled();
        expect(service.savedChartModel.create).toHaveBeenCalled();
        expect(
            service.spacePermissionService.getSpacesAccessContext,
        ).toHaveBeenCalledTimes(1);
    });
});
