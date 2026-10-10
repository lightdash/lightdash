import { Ability, type RawRuleOf } from '@casl/ability';
import {
    AgentCapability,
    AnyType,
    ChartAsCode,
    ChartKind,
    ContentType,
    CustomDimensionType,
    DashboardAsCode,
    DashboardChartTile,
    DashboardDAO,
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    ForbiddenError,
    MergeJoinType,
    MetricType,
    OrganizationMemberRole,
    PossibleAbilities,
    PromotionAction,
    SavedMergeDefinition,
    SessionUser,
    SpaceMemberRole,
    SqlChartAsCode,
} from '@lightdash/common';
import { type Request } from 'express';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { toSessionUser } from '../../auth/account';
import { fromOauth } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectCoderController } from '../../controllers/ProjectCoderController';
import { dashboard as dashboardMock } from '../DashboardService/DashboardService.mock';
import { ProjectService } from '../ProjectService/ProjectService';
import { type ServiceRepository } from '../ServiceRepository';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const SPACE_UUID = 'space-uuid';
const OTHER_SPACE_UUID = 'other-space-uuid';
const PARENT_SPACE_UUID = 'parent-space-uuid';
const NEW_SPACE_UUID = 'new-space-uuid';

const makeSessionUser = (
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
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        directAccessService: {} as AnyType,
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
            getSlugAliasMappingsForUuids: vi.fn(async () => []),
            get: vi.fn(),
            create: vi.fn(),
        } as AnyType,
        savedSqlModel: {
            find: vi.fn(async () => []),
        } as AnyType,
        appModel: {} as AnyType,
        dashboardModel: {
            find: vi.fn(async () => []),
            create: vi.fn(),
            getByIdOrSlug: vi.fn(),
            renameSlug: vi.fn(),
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
            resolveAccessBatch: vi.fn(
                async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                    targets.map((target) => ({
                        target,
                        context: {
                            organizationUuid: ORG_UUID,
                            projectUuid: PROJECT_UUID,
                            inheritsFromOrgOrProject: true,
                            access: [],
                            admins: [],
                            directOnly: false,
                        },
                    })),
            ),
        } as AnyType,
        contentAsCodeSnapshotModel: { upsert: vi.fn() } as AnyType,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as AnyType,
        contentVerificationModel: {} as AnyType,
        groupsModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        userModel: {} as AnyType,
        warehouseConnectionModel: {} as never,
    });

const registerContentAccessTests = (
    contentAsCodeAction: 'create' | 'manage',
) => {
    const makeUser = (rules: RawRuleOf<Ability<PossibleAbilities>>[]) =>
        makeSessionUser(
            rules.map((rule) =>
                rule.subject === 'ContentAsCode' && rule.action === 'create'
                    ? { ...rule, action: contentAsCodeAction }
                    : rule,
            ),
        );
    describe('CoderService dashboard slug rename permissions', () => {
        const request = {
            resourceType: ContentType.DASHBOARD,
            from: 'old-dashboard',
            to: 'dashboard',
        };

        it('requires project write access before looking up a dashboard', async () => {
            const service = buildService();
            await expect(
                service.renameContentSlug(makeUser([]), PROJECT_UUID, request),
            ).rejects.toThrow(ForbiddenError);
            expect(service.dashboardModel.getByIdOrSlug).not.toHaveBeenCalled();
            expect(service.dashboardModel.renameSlug).not.toHaveBeenCalled();
        });

        it('requires dashboard update access for write-only callers', async () => {
            const service = buildService();
            vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
                uuid: 'dashboard-uuid',
                slug: request.from,
                spaceUuid: SPACE_UUID,
            } as AnyType);
            await expect(
                service.renameContentSlug(
                    makeUser([{ subject: 'ContentAsCode', action: 'create' }]),
                    PROJECT_UUID,
                    request,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(service.dashboardModel.renameSlug).not.toHaveBeenCalled();
        });

        it('renames an authorized project-scoped dashboard', async () => {
            const service = buildService();
            vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
                uuid: 'dashboard-uuid',
                slug: request.from,
                spaceUuid: SPACE_UUID,
            } as AnyType);
            await service.renameContentSlug(
                makeUser([
                    { subject: 'ContentAsCode', action: 'create' },
                    {
                        subject: 'Dashboard',
                        action: 'update',
                        conditions: { projectUuid: PROJECT_UUID },
                    },
                ]),
                PROJECT_UUID,
                request,
            );
            expect(service.dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
                request.from,
                { projectUuid: PROJECT_UUID },
            );
            expect(service.dashboardModel.renameSlug).toHaveBeenCalledWith({
                projectUuid: PROJECT_UUID,
                dashboardUuid: 'dashboard-uuid',
                from: request.from,
                to: request.to,
            });
        });

        it.each(['../dashboard', 'UPPERCASE', '', 'a'.repeat(256)])(
            'rejects malformed target %s before looking up a dashboard',
            async (to) => {
                const service = buildService();
                await expect(
                    service.renameContentSlug(makeUser([]), PROJECT_UUID, {
                        ...request,
                        to,
                    }),
                ).rejects.toThrow('target slug');
                expect(
                    service.dashboardModel.getByIdOrSlug,
                ).not.toHaveBeenCalled();
                expect(
                    service.dashboardModel.renameSlug,
                ).not.toHaveBeenCalled();
            },
        );
    });

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

    it('identifies content denied at the project upload gate', async () => {
        const service = buildService();

        await expect(
            service.upsertChart(
                makeUser([]),
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(
            'You don\'t have permission to upload content as code to this project (content slug "chart")',
        );
    });

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
                makeSessionUser(chartCreateRules),
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
        ).rejects.toThrow(
            'User cannot upload content with new or modified custom SQL dimensions: sql_dim (chart slug "chart")',
        );
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('rejects SQL table calculations without CustomSqlTableCalculations manage', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeSessionUser(chartCreateRules),
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
        ).rejects.toThrow(
            'User cannot upload content with new or modified SQL table calculations: sql_calc (chart slug "chart")',
        );
        expect(service.savedChartModel.create).not.toHaveBeenCalled();
    });

    it('reports all missing SQL permissions together', async () => {
        const service = buildService();
        prepareChartCreate(service);

        await expect(
            service.upsertChart(
                makeSessionUser(chartCreateRules),
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
        ).rejects.toThrow(
            'User cannot upload content with new or modified custom SQL dimensions: sql_dim (chart slug "chart"); User cannot upload content with new or modified SQL table calculations: sql_calc (chart slug "chart")',
        );
    });

    it('lets manage upload SQL content but still checks space access', async () => {
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
                makeUser([
                    { subject: 'ContentAsCode', action: 'manage' },
                    {
                        subject: 'SavedChart',
                        action: 'create',
                        conditions: { projectUuid: PROJECT_UUID },
                    },
                ]),
                PROJECT_UUID,
                chartWithSql.slug,
                chartWithSql,
            ),
        ).resolves.toMatchObject({ charts: [{ action: 'create' }] });
        expect(
            service.spacePermissionService.resolveAccessBatch,
        ).toHaveBeenCalled();
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
        ).rejects.toThrow(
            'You don\'t have access to create charts in space "space"',
        );
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
        ).rejects.toThrow('You don\'t have access to create space "space"');
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('rejects creating a chart below a restricted parent without creating an orphan space', async () => {
        const service = buildService();
        vi.mocked(service.spaceModel.find).mockResolvedValue([]);
        vi.mocked(
            service.spaceModel.findClosestAncestorByPath,
        ).mockResolvedValue(PARENT_SPACE_UUID);
        vi.mocked(
            service.spacePermissionService.resolveAccessBatch,
        ).mockResolvedValue([
            {
                target: { type: 'space', spaceUuid: PARENT_SPACE_UUID },
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: false,
                    access: [],
                    admins: [],
                    directOnly: false,
                },
            },
        ]);
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
        ).rejects.toThrow(
            'You don\'t have access to create charts in space "restricted/new-space"',
        );
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('rejects moving a chart below a restricted parent before creating spaces', async () => {
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
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: false,
                    access:
                        target.spaceUuid === SPACE_UUID
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
                    directOnly: false,
                },
            })),
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
        ).rejects.toThrow('You don\'t have access to update chart "chart"');
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
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
        ).rejects.toThrow(
            'You don\'t have access to create dashboards in space "space"',
        );
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

    it('lets chart create attach to a dashboard with chart create access but no dashboard ability (UI parity)', async () => {
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
        ]);

        await expect(
            service.upsertChart(user, PROJECT_UUID, chartAsCode.slug, {
                ...chartAsCode,
                dashboardSlug: 'dashboard',
            }),
        ).resolves.toMatchObject({ charts: [{ action: 'create' }] });
        expect(service.savedChartModel.create).toHaveBeenCalled();
    });

    it('does not let ContentAsCode alone update dashboards into target spaces', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            slug: 'dashboard',
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
            slug: 'dashboard',
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
            slug: 'dashboard',
            name: 'Dashboard',
            spaceUuid: OTHER_SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.mocked(
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid:
                        target.spaceUuid === OTHER_SPACE_UUID
                            ? 'restricted-project'
                            : PROJECT_UUID,
                    inheritsFromOrgOrProject: true,
                    access: [],
                    admins: [],
                    directOnly: false,
                },
            })),
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
        ).rejects.toThrow(
            'You don\'t have access to update dashboard "dashboard"',
        );
        expect(
            service.promoteService.getPromotedDashboard,
        ).not.toHaveBeenCalled();
        expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
    });

    it('identifies a restricted dashboard destination space', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            slug: 'dashboard',
            name: 'Dashboard',
            spaceUuid: OTHER_SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        } as AnyType);
        vi.mocked(
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid:
                        target.spaceUuid === SPACE_UUID
                            ? 'restricted-project'
                            : PROJECT_UUID,
                    inheritsFromOrgOrProject: true,
                    access: [],
                    admins: [],
                    directOnly: false,
                },
            })),
        );
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Dashboard',
                action: 'update',
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
        ).rejects.toThrow(
            'You don\'t have access to update dashboard "dashboard"',
        );
        expect(
            service.promoteService.getPromotedDashboard,
        ).not.toHaveBeenCalled();
    });

    it('identifies inaccessible private spaces', async () => {
        const service = buildService();
        vi.mocked(service.spacePermissionService.can).mockResolvedValue(false);

        await expect(
            service.getOrCreateSpace(
                PROJECT_UUID,
                'private/space',
                makeUser([{ subject: 'ContentAsCode', action: 'create' }]),
            ),
        ).rejects.toThrow(
            'You don\'t have access to the private space "private/space"',
        );
    });

    it('gates dashboard-contained chart update on SavedChart update in the dashboard space', async () => {
        const service = buildService();
        // Model coalesces spaceUuid to the dashboard's space
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                spaceUuid: OTHER_SPACE_UUID,
                dashboardUuid: 'dashboard-uuid',
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
        const user = makeUser([
            { subject: 'ContentAsCode', action: 'create' },
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
            service.upsertChart(
                user,
                PROJECT_UUID,
                chartAsCode.slug,
                chartAsCode,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(service.promoteService.getPromoteCharts).not.toHaveBeenCalled();
        expect(service.dashboardModel.getByIdOrSlug).not.toHaveBeenCalled();
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
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: false,
                    access:
                        target.spaceUuid === SPACE_UUID
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
                    directOnly: false,
                },
            })),
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
        if (contentAsCodeAction === 'create') {
            expect(service.savedChartModel.get).toHaveBeenCalledWith(
                'chart-uuid',
            );
        } else {
            expect(service.savedChartModel.get).not.toHaveBeenCalled();
        }
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
        vi.mocked(service.savedSqlModel.find).mockResolvedValue([
            {
                saved_sql_uuid: 'private-sql-chart-uuid',
                slug: 'private-sql-chart',
                space_uuid: OTHER_SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: false,
                    access:
                        target.spaceUuid === SPACE_UUID
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
                    directOnly: false,
                },
            })),
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
                    {
                        type: DashboardTileTypes.SQL_CHART,
                        x: 3,
                        y: 0,
                        h: 3,
                        w: 3,
                        properties: { chartSlug: 'private-sql-chart' },
                    },
                ],
            } as DashboardAsCode),
        ).rejects.toThrow(
            "You don't have access to chart(s) referenced by this dashboard: private-chart, private-sql-chart",
        );
        expect(service.dashboardModel.create).not.toHaveBeenCalled();
    });

    it('does not let dashboard update reference tile charts from inaccessible spaces', async () => {
        const service = buildService();
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            slug: 'dashboard',
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
            service.spacePermissionService.resolveAccessBatch,
        ).mockImplementation(async (_userUuid, targets) =>
            targets.map((target) => ({
                target,
                context: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    inheritsFromOrgOrProject: false,
                    access:
                        target.spaceUuid === SPACE_UUID
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
                    directOnly: false,
                },
            })),
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
            tiles: [],
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
            tiles: [],
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
            service.spacePermissionService.resolveAccessBatch,
        ).toHaveBeenCalledTimes(1);
    });
};

describe.each(['create', 'manage'] as const)(
    'CoderService content-as-code space permissions (%s)',
    (action) => {
        registerContentAccessTests(action);
    },
);

describe('CoderService upsertDashboard tile chart versions', () => {
    it('preserves tile identities and references without re-versioning charts on a forced upload', async () => {
        const service = buildService();
        const existingTile: DashboardChartTile = {
            uuid: 'commented-tile',
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            w: 6,
            h: 5,
            tabUuid: null,
            properties: { savedChartUuid: 'chart-uuid', chartSlug: 'chart' },
        };
        vi.mocked(service.savedChartModel.find).mockResolvedValue([
            {
                uuid: 'chart-uuid',
                slug: 'chart',
                spaceUuid: SPACE_UUID,
            } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.find).mockResolvedValue([
            { uuid: 'dashboard-uuid' } as AnyType,
        ]);
        vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
            uuid: 'dashboard-uuid',
            slug: 'dashboard',
            name: 'Dashboard',
            spaceUuid: SPACE_UUID,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            tiles: [existingTile],
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
                charts: [
                    {
                        action: PromotionAction.NO_CHANGES,
                        data: { uuid: 'chart-uuid' },
                    },
                ],
                spaces: [],
            },
            [],
        ] as AnyType);
        const user = makeSessionUser([
            { subject: 'ContentAsCode', action: 'create' },
            { subject: 'SavedChart', action: 'view' },
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
                {
                    ...dashboardAsCode,
                    tiles: [
                        {
                            ...existingTile,
                            uuid: undefined,
                            tileSlug: 'chart',
                            properties: { chartSlug: 'chart' },
                        },
                    ],
                    filters: {
                        dimensions: [
                            {
                                label: 'Order status',
                                target: {
                                    fieldId: 'orders_status',
                                    tableName: 'orders',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                                tileTargets: { chart: false },
                            },
                        ],
                    },
                    config: {
                        isDateZoomDisabled: false,
                        dateZoomConfig: {
                            controls: [],
                            tileTargets: {
                                chart: {
                                    controlUuid: 'zoom-control',
                                    fieldId: 'orders_order_date',
                                    tableName: 'orders',
                                },
                            },
                        },
                    },
                },
                { force: true },
            ),
        ).resolves.toMatchObject({
            dashboards: [{ action: PromotionAction.UPDATE }],
        });

        expect(
            service.promoteService.getPromotedDashboard,
        ).toHaveBeenCalledWith(
            user,
            expect.objectContaining({
                tiles: [expect.objectContaining({ uuid: 'commented-tile' })],
                filters: expect.objectContaining({
                    dimensions: [
                        expect.objectContaining({
                            tileTargets: { 'commented-tile': false },
                        }),
                    ],
                }),
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: {
                        controls: [],
                        tileTargets: {
                            'commented-tile': {
                                controlUuid: 'zoom-control',
                                fieldId: 'orders_order_date',
                                tableName: 'orders',
                            },
                        },
                    },
                },
            }),
            PROJECT_UUID,
        );

        // The forced upload updates the dashboard but must not write a second
        // version of tile charts already handled by the chart upload path.
        expect(service.promoteService.upsertCharts).toHaveBeenCalledTimes(1);
        const upsertChartsChanges = vi.mocked(
            service.promoteService.upsertCharts,
        ).mock.calls[0][1] as AnyType;
        expect(upsertChartsChanges.charts).toEqual([
            expect.objectContaining({
                action: PromotionAction.NO_CHANGES,
            }),
        ]);
    });
});

describe.each(['create', 'upsert'] as const)(
    'CoderService new dashboard chart ownership (%s)',
    (mode) => {
        it('copies dashboard-owned charts while preserving shared charts and tile settings', async () => {
            const service = buildService();
            const user = makeSessionUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'Dashboard', action: 'create' },
                { subject: 'SavedChart', action: 'view' },
            ]);
            const tiles: DashboardChartTile[] = [true, false].map(
                (belongsToDashboard, index) => ({
                    uuid: `tile-${index}`,
                    type: DashboardTileTypes.SAVED_CHART,
                    x: index * 6,
                    y: 0,
                    h: 5,
                    w: 6,
                    tabUuid: null,
                    properties: {
                        savedChartUuid: `chart-${index}`,
                        belongsToDashboard,
                        hideTitle: true,
                    },
                }),
            );
            const createdDashboard: DashboardDAO = {
                ...dashboardMock,
                uuid: 'copy-dashboard',
                slug: 'copy',
                projectUuid: PROJECT_UUID,
                tiles,
                tabs: [],
                filters: { dimensions: [], metrics: [], tableCalculations: [] },
            };
            vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
                space: { uuid: SPACE_UUID } as AnyType,
                created: false,
            });
            vi.mocked(service.savedChartModel.find).mockResolvedValue(
                [0, 1].map((index) => ({
                    uuid: `chart-${index}`,
                    slug: `chart-${index}`,
                    spaceUuid: SPACE_UUID,
                    dashboardUuid: index === 0 ? 'original-dashboard' : null,
                })) as AnyType,
            );
            vi.mocked(service.dashboardModel.create).mockResolvedValue(
                createdDashboard,
            );
            const duplicateChartForDashboard = vi.fn(
                async () => 'copied-chart',
            );
            Object.assign(service.dashboardService, {
                duplicateChartForDashboard,
            });
            const updatedTiles = tiles.map((tile, index) =>
                index === 0
                    ? {
                          ...tile,
                          properties: {
                              ...tile.properties,
                              savedChartUuid: 'copied-chart',
                          },
                      }
                    : tile,
            );
            const addVersion = vi.fn(async () => ({
                ...createdDashboard,
                tiles: updatedTiles,
            }));
            Object.assign(service.dashboardModel, { addVersion });
            vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
                ...createdDashboard,
                tiles: updatedTiles,
            });

            const result = await service.upsertDashboard(
                user,
                PROJECT_UUID,
                'copy',
                {
                    ...dashboardAsCode,
                    slug: 'copy',
                    tiles: tiles.map((tile, index) => ({
                        ...tile,
                        tileSlug: `tile-${index}`,
                        properties: { chartSlug: `chart-${index}` },
                    })),
                },
                { mode },
            );

            expect(duplicateChartForDashboard).toHaveBeenCalledExactlyOnceWith({
                user,
                projectUuid: PROJECT_UUID,
                dashboardUuid: 'copy-dashboard',
                chartUuid: 'chart-0',
            });
            expect(addVersion).toHaveBeenCalledWith(
                'copy-dashboard',
                expect.objectContaining({ tiles: updatedTiles }),
                user,
                PROJECT_UUID,
                undefined,
                null,
                expect.any(Function),
            );
            expect(result.dashboards[0].data.tiles).toEqual(updatedTiles);
            expect(tiles[0].properties).toMatchObject({
                savedChartUuid: 'chart-0',
            });
        });
    },
);

describe('bound grant upload effects', () => {
    const setupBound = (publish = true, bound = true) => {
        const service = buildService();
        const projectService: ProjectService = Object.create(
            ProjectService.prototype,
        );
        service.projectService = projectService;
        vi.spyOn(projectService, 'getExplore').mockResolvedValue({
            tables: {
                orders: {
                    name: 'orders',
                    dimensions: { amount: { name: 'amount', sql: 'amount' } },
                    metrics: {},
                },
            },
        } as AnyType);
        Object.assign(service.projectModel, {
            getConnectionRoute: vi.fn().mockResolvedValue('original'),
        });
        const grant = grantFixture();
        const account = fromOauth(
            {
                ...defaultSessionUser,
                organizationUuid: ORG_UUID,
                ability: new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'all' },
                ]),
            },
            { accessToken: 'token', client: { id: grant.clientId } },
            null,
            {
                ...grant,
                revision: 1,
                approvedProjectUuids: [PROJECT_UUID],
                approvedCapabilities: Object.values(AgentCapability).filter(
                    (capability) =>
                        publish || capability !== AgentCapability.Publish,
                ),
            },
        );
        if (!bound) account.authentication.agentConnectionGrant = null;
        const user = toSessionUser(account);
        const prepare = vi
            .spyOn(service, 'prepareDirectAccessReplace')
            .mockResolvedValue(null);
        const apply = vi
            .spyOn(service, 'applyDirectAccessPolicy')
            .mockResolvedValue(undefined);
        const space = vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
            space: { uuid: SPACE_UUID } as AnyType,
            created: false,
        });
        const call = (
            kind: 'chart' | 'dashboard' | 'sql',
            payload: Record<string, unknown>,
            publicSpaceCreate = false,
        ) => {
            const options = { account, syncEnabled: false, publicSpaceCreate };
            if (kind === 'chart')
                return service.upsertChart(
                    user,
                    PROJECT_UUID,
                    'chart',
                    { ...chartAsCode, ...payload },
                    options,
                );
            if (kind === 'dashboard')
                return service.upsertDashboard(
                    user,
                    PROJECT_UUID,
                    'dashboard',
                    { ...dashboardAsCode, ...payload },
                    options,
                );
            return service.upsertSqlChart(
                user,
                PROJECT_UUID,
                'sql',
                {
                    name: 'SQL',
                    slug: 'sql',
                    spaceSlug: 'space',
                    sql: 'select 1',
                    ...payload,
                } as SqlChartAsCode,
                options,
            );
        };
        return { service, account, call, prepare, apply, space };
    };
    const prepareVerificationUpload = (
        service: CoderService,
        kind: 'chart' | 'dashboard',
        mode: 'create' | 'update',
        verified: boolean | undefined,
    ) => {
        Object.assign(service.contentVerificationModel, {
            getByContent: vi.fn().mockResolvedValue(
                verified === false
                    ? {
                          verifiedBy: { userUuid: 'user' },
                          verifiedAt: new Date(),
                      }
                    : null,
            ),
            verify: vi.fn().mockResolvedValue(undefined),
            unverify: vi.fn().mockResolvedValue(undefined),
        });
        vi.mocked(service.savedChartModel.create).mockResolvedValue({
            uuid: 'chart-uuid',
        } as AnyType);
        vi.mocked(service.dashboardModel.create).mockResolvedValue({
            ...dashboardAsCode,
            uuid: 'dashboard-uuid',
        } as AnyType);
        if (mode === 'create') return;
        if (kind === 'chart') {
            const chart = {
                ...chartAsCode,
                uuid: 'chart-uuid',
                spaceUuid: SPACE_UUID,
            };
            vi.mocked(service.savedChartModel.get).mockResolvedValue(
                chart as AnyType,
            );
            vi.mocked(service.savedChartModel.find).mockResolvedValue([
                chart,
            ] as AnyType);
            vi.mocked(
                service.promoteService.getPromoteCharts,
            ).mockResolvedValue({
                promotedChart: { chart },
                upstreamChart: { chart: { ...chart } },
            } as AnyType);
            vi.mocked(service.promoteService.getChartChanges).mockResolvedValue(
                {
                    charts: [
                        {
                            action: PromotionAction.UPDATE,
                            data: { uuid: chart.uuid },
                        },
                    ],
                    spaces: [],
                    dashboards: [],
                } as AnyType,
            );
        } else {
            const dashboard = {
                ...dashboardAsCode,
                uuid: 'dashboard-uuid',
                spaceUuid: SPACE_UUID,
            };
            vi.mocked(service.dashboardModel.find).mockResolvedValue([
                dashboard,
            ] as AnyType);
            vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue(
                dashboard as AnyType,
            );
            const promotion = {
                dashboard,
                projectUuid: PROJECT_UUID,
                space: { name: 'Space' },
                spaceAccessContext: {
                    organizationUuid: ORG_UUID,
                    projectUuid: PROJECT_UUID,
                    access: [],
                },
            };
            vi.mocked(
                service.promoteService.getPromotedDashboard,
            ).mockResolvedValue({
                promotedDashboard: promotion,
                upstreamDashboard: {
                    ...promotion,
                    dashboard: { ...dashboard },
                },
            } as AnyType);
            vi.mocked(
                service.promoteService.getPromotionDashboardChanges,
            ).mockResolvedValue([
                {
                    dashboards: [
                        {
                            action: PromotionAction.UPDATE,
                            data: { uuid: dashboard.uuid },
                        },
                    ],
                    charts: [],
                    spaces: [],
                },
                [],
            ] as AnyType);
        }
    };
    const sqlQuery = (
        kind: 'calculation' | 'dimension' | 'metric',
        sql: string,
    ): ChartAsCode['metricQuery'] => ({
        ...chartAsCode.metricQuery,
        ...(kind === 'calculation'
            ? {
                  tableCalculations: [
                      { name: 'custom', displayName: 'Custom', sql },
                  ],
              }
            : {}),
        ...(kind === 'dimension'
            ? {
                  customDimensions: [
                      {
                          id: 'custom',
                          name: 'Custom',
                          table: 'orders',
                          type: CustomDimensionType.SQL,
                          dimensionType: DimensionType.NUMBER,
                          sql,
                      },
                  ],
              }
            : {}),
        ...(kind === 'metric'
            ? {
                  additionalMetrics: [
                      {
                          name: 'custom',
                          table: 'orders',
                          type: MetricType.SUM,
                          sql,
                      },
                  ],
              }
            : {}),
    });
    const sqlCases = (['calculation', 'dimension', 'metric'] as const).flatMap(
        (kind) =>
            (['create', 'add', 'change', 'unchanged'] as const).flatMap(
                (mode) =>
                    (['denied', 'approved', 'unbound'] as const).map(
                        (approval) => ({ kind, mode, approval }),
                    ),
            ),
    );
    it.each(sqlCases)(
        '$approval grant chart $mode with SQL $kind respects Raw SQL before writes',
        async ({ kind, mode, approval }) => {
            const { service, account, call, space, apply } = setupBound(
                true,
                approval !== 'unbound',
            );
            if (
                approval === 'denied' &&
                account.authentication.agentConnectionGrant
            ) {
                account.authentication.agentConnectionGrant.approvedCapabilities =
                    account.authentication.agentConnectionGrant.approvedCapabilities.filter(
                        (capability) => capability !== AgentCapability.RawSql,
                    );
            }
            prepareVerificationUpload(
                service,
                'chart',
                mode === 'create' ? 'create' : 'update',
                undefined,
            );
            if (mode !== 'create') {
                vi.mocked(service.savedChartModel.get).mockResolvedValue({
                    ...chartAsCode,
                    metricQuery:
                        mode === 'add'
                            ? chartAsCode.metricQuery
                            : sqlQuery(
                                  kind,
                                  mode === 'unchanged'
                                      ? 'select 2'
                                      : 'select 1',
                              ),
                } as AnyType);
            }
            const upload = call('chart', {
                metricQuery: sqlQuery(kind, 'select 2'),
            });
            if (approval === 'denied' && mode !== 'unchanged') {
                await expect(upload).rejects.toThrow(
                    'not approved for Raw SQL',
                );
                expect(space).not.toHaveBeenCalled();
                expect(apply).not.toHaveBeenCalled();
                expect(service.savedChartModel.create).not.toHaveBeenCalled();
                expect(
                    service.promoteService.upsertCharts,
                ).not.toHaveBeenCalled();
                expect(service.dashboardModel.create).not.toHaveBeenCalled();
                expect(
                    service.contentAsCodeSnapshotModel.upsert,
                ).not.toHaveBeenCalled();
            } else {
                await expect(upload).resolves.toBeDefined();
                expect(
                    mode === 'create'
                        ? service.savedChartModel.create
                        : service.promoteService.upsertCharts,
                ).toHaveBeenCalledOnce();
            }
        },
    );
    const configureSqlApproval = (
        approval: 'denied' | 'approved' | 'unbound',
    ) => {
        const context = setupBound(true, approval !== 'unbound');
        if (approval === 'denied') {
            context.account.authentication.agentConnectionGrant!.approvedCapabilities =
                [AgentCapability.ContentWrite, AgentCapability.DeployUpload];
        }
        return context;
    };
    const expectNoChartWrites = (context: ReturnType<typeof setupBound>) => {
        expect(context.space).not.toHaveBeenCalled();
        expect(context.apply).not.toHaveBeenCalled();
        expect(context.service.savedChartModel.create).not.toHaveBeenCalled();
        expect(
            context.service.promoteService.upsertCharts,
        ).not.toHaveBeenCalled();
        expect(
            context.service.promoteService.getChartChanges,
        ).not.toHaveBeenCalled();
        expect(context.service.dashboardModel.create).not.toHaveBeenCalled();
        expect(
            context.service.contentAsCodeSnapshotModel.upsert,
        ).not.toHaveBeenCalled();
    };
    const mergeWithQuery = (
        query: ChartAsCode['metricQuery'],
    ): SavedMergeDefinition => ({
        queries: {
            extra: {
                explore: query.exploreName,
                dimensions: query.dimensions,
                metrics: query.metrics,
                tableCalculations: query.tableCalculations,
                customDimensions: query.customDimensions,
                additionalMetrics: query.additionalMetrics,
            },
        },
        join: MergeJoinType.FULL,
        keys: { orders_amount: ['extra.orders_amount'] },
        limit: 500,
    });
    const sqlMerge = (
        kind: 'calculation' | 'dimension' | 'metric' | 'outer calculation',
        sql: string,
    ): SavedMergeDefinition =>
        kind === 'outer calculation'
            ? {
                  ...mergeWithQuery(chartAsCode.metricQuery),
                  tableCalculations: [
                      { name: 'custom', displayName: 'Custom', sql },
                  ],
              }
            : mergeWithQuery(sqlQuery(kind, sql));
    it.each(
        (['calculation', 'dimension', 'metric'] as const).flatMap((kind) =>
            (['item fields', 'tableName', 'exploreName'] as const).flatMap(
                (change) =>
                    (['denied', 'approved', 'unbound'] as const).map(
                        (approval) => ({ kind, change, approval }),
                    ),
            ),
        ),
    )(
        '$approval chart $kind with changed $change checks the whole item and explore',
        async ({ kind, change, approval }) => {
            const context = configureSqlApproval(approval);
            const { service, call } = context;
            prepareVerificationUpload(service, 'chart', 'update', undefined);
            const metricQuery = sqlQuery(kind, '${amount}');
            vi.mocked(service.savedChartModel.get).mockResolvedValue({
                ...chartAsCode,
                metricQuery,
            } as AnyType);
            const changedQuery = {
                ...metricQuery,
                ...(change === 'exploreName'
                    ? { exploreName: 'payments' }
                    : {}),
                ...(change === 'item fields' && kind === 'calculation'
                    ? {
                          tableCalculations: metricQuery.tableCalculations.map(
                              (item) => ({ ...item, displayName: 'Changed' }),
                          ),
                      }
                    : {}),
                ...(change === 'item fields' && kind === 'dimension'
                    ? {
                          customDimensions: metricQuery.customDimensions?.map(
                              (item) => ({ ...item, table: 'payments' }),
                          ),
                      }
                    : {}),
                ...(change === 'item fields' && kind === 'metric'
                    ? {
                          additionalMetrics: metricQuery.additionalMetrics?.map(
                              (item) => ({ ...item, type: MetricType.AVERAGE }),
                          ),
                      }
                    : {}),
            };
            const upload = call('chart', {
                metricQuery: changedQuery,
                ...(change === 'tableName' ? { tableName: 'payments' } : {}),
            });
            if (approval === 'denied') {
                await expect(upload).rejects.toThrow(
                    'not approved for Raw SQL',
                );
                expectNoChartWrites(context);
            } else {
                await expect(upload).resolves.toBeDefined();
                expect(
                    service.promoteService.upsertCharts,
                ).toHaveBeenCalledOnce();
            }
        },
    );
    it.each(
        (
            ['calculation', 'dimension', 'metric', 'outer calculation'] as const
        ).flatMap((kind) =>
            (['create', 'add', 'change', 'unchanged'] as const).flatMap(
                (mode) =>
                    (['denied', 'approved', 'unbound'] as const).map(
                        (approval) => ({ kind, mode, approval }),
                    ),
            ),
        ),
    )(
        '$approval merge $mode with SQL $kind checks Raw SQL before writes',
        async ({ kind, mode, approval }) => {
            const context = configureSqlApproval(approval);
            const { service, call } = context;
            prepareVerificationUpload(
                service,
                'chart',
                mode === 'create' ? 'create' : 'update',
                undefined,
            );
            if (mode !== 'create') {
                vi.mocked(service.savedChartModel.get).mockResolvedValue({
                    ...chartAsCode,
                    merge:
                        mode === 'add'
                            ? undefined
                            : sqlMerge(
                                  kind,
                                  mode === 'unchanged'
                                      ? 'select 2'
                                      : 'select 1',
                              ),
                } as AnyType);
            }
            const upload = call('chart', { merge: sqlMerge(kind, 'select 2') });
            if (approval === 'denied' && mode !== 'unchanged') {
                await expect(upload).rejects.toThrow(
                    'not approved for Raw SQL',
                );
                expectNoChartWrites(context);
            } else {
                await expect(upload).resolves.toBeDefined();
                expect(
                    mode === 'create'
                        ? service.savedChartModel.create
                        : service.promoteService.upsertCharts,
                ).toHaveBeenCalledOnce();
            }
        },
    );
    it.each(['item table', 'query explore', 'chart explore'] as const)(
        'refuses unchanged merge SQL with changed %s without Raw SQL',
        async (change) => {
            const context = configureSqlApproval('denied');
            const { service, call } = context;
            prepareVerificationUpload(service, 'chart', 'update', undefined);
            const merge = sqlMerge('dimension', '${amount}');
            vi.mocked(service.savedChartModel.get).mockResolvedValue({
                ...chartAsCode,
                merge,
            } as AnyType);
            const incomingMerge = {
                ...merge,
                queries: {
                    extra: {
                        ...merge.queries.extra,
                        ...(change === 'query explore'
                            ? { explore: 'payments' }
                            : {}),
                        ...(change === 'item table'
                            ? {
                                  customDimensions:
                                      merge.queries.extra.customDimensions?.map(
                                          (item) => ({
                                              ...item,
                                              table: 'payments',
                                          }),
                                      ),
                              }
                            : {}),
                    },
                },
            };
            await expect(
                call('chart', {
                    merge: incomingMerge,
                    ...(change === 'chart explore'
                        ? {
                              tableName: 'payments',
                              metricQuery: {
                                  ...chartAsCode.metricQuery,
                                  exploreName: 'payments',
                              },
                          }
                        : {}),
                }),
            ).rejects.toThrow('not approved for Raw SQL');
            expectNoChartWrites(context);
        },
    );
    it('compares persisted merge metric UUIDs as part of the whole item', async () => {
        const context = configureSqlApproval('denied');
        const { service, call } = context;
        prepareVerificationUpload(service, 'chart', 'update', undefined);
        const query = sqlQuery('metric', 'select 1');
        const storedMerge = mergeWithQuery({
            ...query,
            additionalMetrics: query.additionalMetrics?.map((metric) => ({
                ...metric,
                uuid: 'stored-uuid',
            })),
        });
        vi.mocked(service.savedChartModel.get).mockResolvedValue({
            ...chartAsCode,
            merge: storedMerge,
        } as AnyType);
        await expect(
            call('chart', { merge: mergeWithQuery(query) }),
        ).rejects.toThrow('not approved for Raw SQL');
        expectNoChartWrites(context);
    });
    it.each([
        'calculation',
        'dimension',
        'metric',
        'outer calculation',
    ] as const)(
        'checks legacy merge SQL %s after normalization',
        async (kind) => {
            const context = configureSqlApproval('denied');
            const { service, call } = context;
            prepareVerificationUpload(service, 'chart', 'create', undefined);
            await expect(
                call('chart', {
                    merge: {
                        primarySourceId: 'orders',
                        sources: [
                            { id: 'orders', kind: 'chart' },
                            {
                                id: 'extra',
                                kind: 'query',
                                metricQuery:
                                    kind === 'outer calculation'
                                        ? chartAsCode.metricQuery
                                        : sqlQuery(kind, 'select 1'),
                            },
                        ],
                        joinType: MergeJoinType.FULL,
                        joinKey: [
                            {
                                name: 'orders_amount',
                                fieldIdBySourceId: {
                                    orders: 'orders_amount',
                                    extra: 'orders_amount',
                                },
                            },
                        ],
                        tableCalculations:
                            kind === 'outer calculation'
                                ? [
                                      {
                                          name: 'outer',
                                          displayName: 'Outer',
                                          sql: 'select 1',
                                      },
                                  ]
                                : [],
                    },
                }),
            ).rejects.toThrow('not approved for Raw SQL');
            expectNoChartWrites(context);
        },
    );
    it('allows a downloaded chart with unchanged SQL in every component without Raw SQL', async () => {
        const { service, call } = configureSqlApproval('denied');
        prepareVerificationUpload(service, 'chart', 'update', undefined);
        const metricQuery = {
            ...sqlQuery('dimension', '${amount}'),
            tableCalculations: [
                {
                    name: 'custom',
                    displayName: 'Custom',
                    sql: 'select 1',
                    format: undefined,
                    type: undefined,
                    template: undefined,
                    formula: undefined,
                    totalMode: undefined,
                },
            ],
            additionalMetrics: sqlQuery(
                'metric',
                'select 1',
            ).additionalMetrics?.map((item) => ({
                ...item,
                uuid: 'stored-metric-uuid',
                label: undefined,
                description: undefined,
            })),
        };
        const storedChart = {
            ...chartAsCode,
            uuid: 'chart-uuid',
            spaceUuid: SPACE_UUID,
            metricQuery,
            merge: {
                ...mergeWithQuery(metricQuery),
                tableCalculations: [
                    { name: 'outer', displayName: 'Outer', sql: 'select 1' },
                ],
            },
        };
        vi.mocked(service.savedChartModel.get).mockResolvedValue(
            storedChart as AnyType,
        );
        Object.assign(service.contentVerificationModel, {
            getByContentUuids: vi.fn().mockResolvedValue(new Map()),
        });
        const downloaded = await service.getCurrentChartAsCode('chart-uuid');
        expect(
            downloaded.metricQuery.additionalMetrics?.[0],
        ).not.toHaveProperty('uuid');
        let payload: ChartAsCode;
        try {
            payload = JSON.parse(JSON.stringify(downloaded));
        } catch (error) {
            throw new Error('Could not serialize chart download', {
                cause: error,
            });
        }
        await expect(call('chart', payload)).resolves.toBeDefined();
        expect(service.promoteService.upsertCharts).toHaveBeenCalledOnce();
    });
    it.each(['formula', 'template', 'modelled metric'] as const)(
        'allows merge %s without Raw SQL using the source explore',
        async (kind) => {
            const { service, call } = configureSqlApproval('denied');
            prepareVerificationUpload(service, 'chart', 'create', undefined);
            const query =
                kind === 'modelled metric'
                    ? sqlQuery('metric', '${orders.amount}')
                    : {
                          ...chartAsCode.metricQuery,
                          tableCalculations: [
                              {
                                  name: 'custom',
                                  displayName: 'Custom',
                                  ...(kind === 'formula'
                                      ? { formula: 'SUM(A:A)' }
                                      : {
                                            template: {
                                                type: 'percent_of_column_total',
                                                fieldId: 'orders_amount',
                                            },
                                        }),
                              },
                          ],
                      };
            const merge = {
                ...mergeWithQuery({
                    ...query,
                    exploreName: 'payments',
                } as ChartAsCode['metricQuery']),
                tableCalculations: [
                    {
                        name: 'outer',
                        displayName: 'Outer',
                        sql: '',
                        formula: 'SUM(A:A)',
                    },
                ],
            };
            await expect(call('chart', { merge })).resolves.toBeDefined();
            expect(service.savedChartModel.create).toHaveBeenCalledOnce();
            if (kind === 'modelled metric') {
                expect(service.projectService!.getExplore).toHaveBeenCalledWith(
                    expect.anything(),
                    PROJECT_UUID,
                    'payments',
                );
            }
        },
    );
    it.each(['formula', 'template', 'modelled metric'] as const)(
        'allows %s without Raw SQL',
        async (kind) => {
            const { service, account, call } = setupBound();
            account.authentication.agentConnectionGrant!.approvedCapabilities =
                [AgentCapability.ContentWrite, AgentCapability.DeployUpload];
            prepareVerificationUpload(service, 'chart', 'create', undefined);
            const metricQuery =
                kind === 'modelled metric'
                    ? sqlQuery('metric', '${orders.amount}')
                    : {
                          ...chartAsCode.metricQuery,
                          tableCalculations: [
                              {
                                  name: 'custom',
                                  displayName: 'Custom',
                                  ...(kind === 'formula'
                                      ? { formula: 'SUM(A:A)' }
                                      : {
                                            template: {
                                                type: 'percent_of_column_total',
                                                fieldId: 'orders_amount',
                                            },
                                        }),
                              },
                          ],
                      };
            await expect(call('chart', { metricQuery })).resolves.toBeDefined();
            expect(service.savedChartModel.create).toHaveBeenCalledOnce();
        },
    );
    it.each(
        (['create', 'change', 'unchanged'] as const).flatMap((mode) =>
            (['denied', 'approved', 'unbound'] as const).map((approval) => ({
                mode,
                approval,
            })),
        ),
    )(
        '$approval grant SQL chart $mode checks Raw SQL before writes',
        async ({ mode, approval }) => {
            const { service, account, call, space, apply } = setupBound(
                true,
                approval !== 'unbound',
            );
            if (
                approval === 'denied' &&
                account.authentication.agentConnectionGrant
            ) {
                account.authentication.agentConnectionGrant.approvedCapabilities =
                    [
                        AgentCapability.ContentWrite,
                        AgentCapability.DeployUpload,
                    ];
            }
            Object.assign(service.savedSqlModel, {
                create: vi.fn().mockResolvedValue({
                    savedSqlUuid: 'sql-uuid',
                    slug: 'sql',
                }),
                update: vi.fn().mockResolvedValue(undefined),
            });
            if (mode !== 'create')
                vi.mocked(service.savedSqlModel.find).mockResolvedValue([
                    {
                        saved_sql_uuid: 'sql-uuid',
                        space_uuid: SPACE_UUID,
                        sql: mode === 'unchanged' ? 'select 2' : 'select 1',
                    },
                ] as AnyType);
            const upload = call('sql', { sql: 'select 2' });
            if (approval === 'denied' && mode !== 'unchanged') {
                await expect(upload).rejects.toThrow(
                    'not approved for Raw SQL',
                );
                expect(space).not.toHaveBeenCalled();
                expect(apply).not.toHaveBeenCalled();
                expect(service.savedSqlModel.create).not.toHaveBeenCalled();
                expect(service.savedSqlModel.update).not.toHaveBeenCalled();
            } else {
                await expect(upload).resolves.toBeDefined();
                expect(
                    mode === 'create'
                        ? service.savedSqlModel.create
                        : service.savedSqlModel.update,
                ).toHaveBeenCalledOnce();
            }
        },
    );
    const verificationCases = (['chart', 'dashboard'] as const).flatMap(
        (kind) =>
            (['create', 'update'] as const).flatMap((mode) =>
                [true, false].map((verified) => ({ kind, mode, verified })),
            ),
    );
    it.each(verificationCases)(
        'refuses $kind $mode with verified=$verified without Publish before any write',
        async ({ kind, mode, verified }) => {
            const { service, call, space, prepare, apply } = setupBound(false);
            prepareVerificationUpload(service, kind, mode, verified);
            const result = await call(kind, { verified }).catch(
                (error) => error,
            );
            expect(service.savedChartModel.create).not.toHaveBeenCalled();
            expect(service.dashboardModel.create).not.toHaveBeenCalled();
            expect(service.promoteService.upsertCharts).not.toHaveBeenCalled();
            expect(
                service.promoteService.getOrCreateDashboard,
            ).not.toHaveBeenCalled();
            expect(
                service.promoteService.updateDashboard,
            ).not.toHaveBeenCalled();
            expect(
                service.contentVerificationModel.verify,
            ).not.toHaveBeenCalled();
            expect(
                service.contentVerificationModel.unverify,
            ).not.toHaveBeenCalled();
            expect(
                service.contentAsCodeSnapshotModel.upsert,
            ).not.toHaveBeenCalled();
            expect(space).not.toHaveBeenCalled();
            expect(prepare).not.toHaveBeenCalled();
            expect(apply).not.toHaveBeenCalled();
            expect(result).toBeInstanceOf(ForbiddenError);
            expect(result.message).toContain('Publish');
        },
    );
    it.each(
        verificationCases.flatMap((entry) =>
            ['approved', 'unbound'].map((authorization) => ({
                ...entry,
                authorization,
            })),
        ),
    )(
        'allows $authorization $kind $mode with verified=$verified',
        async ({ kind, mode, verified, authorization }) => {
            const { service, call } = setupBound(
                authorization === 'approved',
                authorization !== 'unbound',
            );
            prepareVerificationUpload(service, kind, mode, verified);
            await expect(call(kind, { verified })).resolves.toBeDefined();
            if (mode === 'create') {
                expect(
                    kind === 'chart'
                        ? service.savedChartModel.create
                        : service.dashboardModel.create,
                ).toHaveBeenCalledOnce();
            } else {
                expect(
                    kind === 'chart'
                        ? service.promoteService.upsertCharts
                        : service.promoteService.updateDashboard,
                ).toHaveBeenCalledOnce();
            }
            const verificationWrite = verified
                ? service.contentVerificationModel.verify
                : service.contentVerificationModel.unverify;
            expect(verificationWrite).toHaveBeenCalledOnce();
        },
    );
    it.each(
        (['chart', 'dashboard'] as const).flatMap((kind) =>
            (['create', 'update'] as const).map((mode) => ({ kind, mode })),
        ),
    )(
        'allows $kind $mode without a verified field or Publish',
        async ({ kind, mode }) => {
            const { service, call } = setupBound(false);
            prepareVerificationUpload(service, kind, mode, undefined);
            await expect(call(kind, {})).resolves.toBeDefined();
            expect(
                service.contentVerificationModel.verify,
            ).not.toHaveBeenCalled();
            expect(
                service.contentVerificationModel.unverify,
            ).not.toHaveBeenCalled();
        },
    );
    it.each(['chart', 'dashboard', 'sql'] as const)(
        'refuses assigning and clearing access before any %s write',
        async (kind) => {
            await Promise.all(
                [
                    { users: [], groups: [] },
                    {
                        users: [
                            {
                                email: 'reader@example.com',
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                        groups: [],
                    },
                ].map(async (access) => {
                    const { service, call, prepare, apply, space } =
                        setupBound();
                    const result = await call(kind, { access }).catch(
                        (error) => error,
                    );
                    expect(prepare).not.toHaveBeenCalled();
                    expect(result).toBeInstanceOf(ForbiddenError);
                    expect(result.message).toContain('access');
                    expect(apply).not.toHaveBeenCalled();
                    expect(space).not.toHaveBeenCalled();
                    expect(
                        service.spaceModel.createSpace,
                    ).not.toHaveBeenCalled();
                    expect(
                        service.savedChartModel.create,
                    ).not.toHaveBeenCalled();
                    expect(
                        service.dashboardModel.create,
                    ).not.toHaveBeenCalled();
                }),
            );
        },
    );
    it.each(['chart', 'dashboard', 'sql'] as const)(
        'refuses private and public destination space creation before any %s write',
        async (kind) => {
            await Promise.all(
                [false, true].map(async (publicSpaceCreate) => {
                    const { service, call, prepare, apply, space } =
                        setupBound();
                    vi.mocked(service.spaceModel.find).mockResolvedValue([]);
                    const result = await call(
                        kind,
                        { spaceSlug: 'missing' },
                        publicSpaceCreate,
                    ).catch((error) => error);
                    expect(space).not.toHaveBeenCalled();
                    expect(result).toBeInstanceOf(ForbiddenError);
                    expect(result.message).toContain('space');
                    expect(prepare).not.toHaveBeenCalled();
                    expect(apply).not.toHaveBeenCalled();
                    expect(space).not.toHaveBeenCalled();
                    expect(
                        service.spaceModel.createSpace,
                    ).not.toHaveBeenCalled();
                    expect(
                        service.savedChartModel.create,
                    ).not.toHaveBeenCalled();
                    expect(
                        service.dashboardModel.create,
                    ).not.toHaveBeenCalled();
                }),
            );
        },
    );
    it.each(['chart', 'dashboard', 'sql'] as const)(
        'retains the bound account through the %s upload controller',
        async (kind) => {
            const { service, account, prepare, space } = setupBound();
            const controller = new ProjectCoderController({
                getCoderService: () => service,
            } as unknown as ServiceRepository);
            const req = { account } as unknown as Request;
            const access = { users: [], groups: [] };
            const uploaders = {
                chart: () =>
                    controller.upsertChartAsCode(
                        PROJECT_UUID,
                        'chart',
                        { ...chartAsCode, access },
                        req,
                    ),
                dashboard: () =>
                    controller.upsertDashboardAsCode(
                        PROJECT_UUID,
                        'dashboard',
                        { ...dashboardAsCode, access },
                        req,
                    ),
                sql: () =>
                    controller.upsertSqlChartAsCode(
                        PROJECT_UUID,
                        'sql',
                        {
                            name: 'SQL',
                            slug: 'sql',
                            spaceSlug: 'space',
                            sql: 'select 1',
                            description: null,
                            limit: 500,
                            config: {
                                type: ChartKind.TABLE,
                                metadata: { version: 1 },
                                columns: {},
                                display: undefined,
                            },
                            chartKind: ChartKind.TABLE,
                            version: 1,
                            access,
                        },
                        req,
                    ),
            };
            const result = uploaders[kind]();
            await expect(result).rejects.toThrow('access');
            expect(prepare).not.toHaveBeenCalled();
            expect(space).not.toHaveBeenCalled();
        },
    );
    it.each(['chart', 'dashboard', 'sql'] as const)(
        'keeps a simple %s upload into an existing space',
        async (kind) => {
            const { service, call } = setupBound();
            vi.mocked(service.savedChartModel.create).mockResolvedValue({
                uuid: 'created-chart',
                spaceUuid: SPACE_UUID,
            } as AnyType);
            vi.mocked(service.dashboardModel.create).mockResolvedValue({
                ...dashboardMock,
                projectUuid: PROJECT_UUID,
                tiles: [],
                tabs: [],
            });
            vi.mocked(service.dashboardModel.getByIdOrSlug).mockResolvedValue({
                ...dashboardMock,
                projectUuid: PROJECT_UUID,
                tiles: [],
                tabs: [],
            });
            const createSql = vi.fn().mockResolvedValue({
                savedSqlUuid: 'created-sql',
                slug: 'sql',
            });
            Object.assign(service.savedSqlModel, { create: createSql });
            await expect(call(kind, {})).resolves.toBeDefined();
            const creators = {
                chart: service.savedChartModel.create,
                dashboard: service.dashboardModel.create,
                sql: createSql,
            };
            expect(creators[kind]).toHaveBeenCalledOnce();
            expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
        },
    );
});
