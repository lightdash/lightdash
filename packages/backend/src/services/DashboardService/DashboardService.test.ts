import { Ability } from '@casl/ability';
import {
    ContentType,
    DashboardTileTypes,
    defineUserAbility,
    FilterOperator,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    PossibleAbilities,
    ProjectMemberRole,
    SessionUser,
    type Dashboard,
    type DashboardChartTile,
    type DashboardFilterRule,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';
import {
    chart,
    createDashboard,
    createDashboardWithSlug,
    createDashboardWithTileIds,
    dashboard,
    dashboardsDetails,
    privateSpace,
    publicSpace,
    space,
    updateDashboard,
    updateDashboardDetailsAndTiles,
    updateDashboardTiles,
    updateDashboardTilesWithIds,
    user,
} from './DashboardService.mock';

const dashboardModel = {
    getAllByProject: jest.fn(async () => dashboardsDetails),

    getByIdOrSlug: jest.fn(async () => dashboard),

    create: jest.fn(async () => dashboard),

    update: jest.fn(async () => dashboard),

    permanentDelete: jest.fn(async () => dashboard),

    addVersion: jest.fn(async () => dashboard),

    getOrphanedCharts: jest.fn(async () => []),
};

const spaceModel = {
    getSpaceSummary: jest.fn(async () => publicSpace),
    get: jest.fn(async () => publicSpace),
};
const analyticsModel = {
    addDashboardViewEvent: jest.fn(async () => null),
};
const savedChartModel = {
    get: jest.fn(async () => chart),
    permanentDelete: jest.fn(async () => ({
        uuid: 'chart_uuid',
        projectUuid: 'project_uuid',
    })),
};

const schedulerModel = {
    getScheduler: jest.fn(),
    getProjectSchedulerRuns: jest.fn(),
};

const contentVerificationModel = {
    unverify: jest.fn(async () => undefined),
};

const spaceContexts = {
    [space.space_uuid]: {
        organizationUuid: space.organization_uuid,
        projectUuid: publicSpace.projectUuid,
        inheritsFromOrgOrProject: space.inherit_parent_permissions,
        access: [],
    },
    [privateSpace.uuid]: {
        organizationUuid: privateSpace.organizationUuid,
        projectUuid: privateSpace.projectUuid,
        inheritsFromOrgOrProject: privateSpace.inheritParentPermissions,
        access: [],
    },
    [publicSpace.uuid]: {
        organizationUuid: publicSpace.organizationUuid,
        projectUuid: publicSpace.projectUuid,
        inheritsFromOrgOrProject: publicSpace.inheritParentPermissions,
        access: publicSpace.access,
    },
};

const spacePermissionService = {
    getSpaceAccessContext: jest.fn(
        async (_userUuid: string, spaceUuid: string) => {
            if (spaceUuid === space.space_uuid) {
                return spaceContexts[space.space_uuid];
            }
            if (spaceUuid === privateSpace.uuid) {
                return spaceContexts[privateSpace.uuid];
            }
            return spaceContexts[publicSpace.uuid];
        },
    ),
    getSpacesAccessContext: jest.fn(
        async (_userUuid: string, spaceUuids: string[]) => spaceContexts,
    ),
    getFirstViewableSpaceUuid: jest.fn(async () => publicSpace.uuid),
};

jest.spyOn(analyticsMock, 'track');
describe('DashboardService', () => {
    const projectUuid = 'projectUuid';
    const { uuid: dashboardUuid } = dashboard;
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        spaceModel: spaceModel as unknown as SpaceModel,
        analyticsModel: analyticsModel as unknown as AnalyticsModel,
        pinnedListModel: {} as PinnedListModel,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        schedulerService: {} as SchedulerService,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedChartService: {} as SavedChartService, // Mock for test
        projectModel: {} as ProjectModel,
        slackClient: {} as SlackClient,
        schedulerClient: {} as SchedulerClient,
        catalogModel: {} as CatalogModel,
        organizationModel: {
            findColorPalette: jest.fn(async () => null),
        } as unknown as OrganizationModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should get dashboard by uuid', async () => {
        const result = await service.getByIdOrSlug(user, dashboard.uuid);

        expect(result).toEqual({
            ...dashboard,
            inheritsFromOrgOrProject: dashboard.inheritsFromOrgOrProject,
        });
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            dashboard.uuid,
            { projectUuid: undefined },
        );
    });
    test('should get all dashboard by project uuid', async () => {
        const result = await service.getAllByProject(
            user,
            projectUuid,
            undefined,
        );

        expect(result).toEqual(dashboardsDetails);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
        );
    });
    test('should create dashboard', async () => {
        const result = await service.create(user, projectUuid, createDashboard);

        expect(result).toEqual({
            ...dashboard,
            access: publicSpace.access,
        });
        expect(dashboardModel.create).toHaveBeenCalledTimes(1);
        expect(dashboardModel.create).toHaveBeenCalledWith(
            publicSpace.uuid,
            createDashboardWithSlug,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.created',
            }),
        );
    });
    test('should create dashboard with tile ids', async () => {
        const result = await service.create(
            user,
            projectUuid,
            createDashboardWithTileIds,
        );

        expect(result).toEqual({
            ...dashboard,
            access: publicSpace.access,
        });
        expect(dashboardModel.create).toHaveBeenCalledTimes(1);
        expect(dashboardModel.create).toHaveBeenCalledWith(
            publicSpace.uuid,
            createDashboardWithTileIds,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.created',
            }),
        );
    });
    test('should update dashboard details', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboard,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
    });
    test('should update dashboard version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard version with tile ids', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardTilesWithIds,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTilesWithIds,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should update dashboard details & version', async () => {
        const result = await service.update(
            user,
            dashboardUuid,
            updateDashboardDetailsAndTiles,
        );

        expect(result).toEqual(dashboard);
        expect(dashboardModel.update).toHaveBeenCalledTimes(1);
        expect(dashboardModel.update).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboard,
        );
        expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
        expect(dashboardModel.addVersion).toHaveBeenCalledWith(
            dashboardUuid,
            updateDashboardTiles,
            user,
            projectUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                event: 'dashboard.updated',
            }),
        );
        expect(analyticsMock.track).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                event: 'dashboard_version.created',
            }),
        );
    });
    test('should delete orphan charts when updating dashboard version', async () => {
        (dashboardModel.getOrphanedCharts as jest.Mock).mockImplementationOnce(
            async () => [{ uuid: 'chart_uuid' }],
        );

        await service.update(user, dashboardUuid, updateDashboardTiles);

        expect(savedChartModel.permanentDelete).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledTimes(2);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'saved_chart.deleted',
            }),
        );
    });
    test('should not fail save when an orphan chart is already gone', async () => {
        // Race with a retried save: getOrphanedCharts returns a chart that
        // permanentDelete then can't find. The save must still succeed.
        (dashboardModel.getOrphanedCharts as jest.Mock).mockImplementationOnce(
            async () => [{ uuid: 'missing_chart_uuid' }],
        );
        (savedChartModel.permanentDelete as jest.Mock).mockImplementationOnce(
            async () => {
                throw new NotFoundError('chart already deleted');
            },
        );

        await expect(
            service.update(user, dashboardUuid, updateDashboardTiles),
        ).resolves.toBeDefined();

        expect(savedChartModel.permanentDelete).toHaveBeenCalledTimes(1);
        // The dashboard.updated + dashboard_version.created events still fire,
        // but no saved_chart.deleted event for the already-missing chart.
        expect(analyticsMock.track).not.toHaveBeenCalledWith(
            expect.objectContaining({ event: 'saved_chart.deleted' }),
        );
    });
    test('should delete dashboard', async () => {
        await service.delete(user, dashboardUuid);

        expect(dashboardModel.permanentDelete).toHaveBeenCalledTimes(1);
        expect(dashboardModel.permanentDelete).toHaveBeenCalledWith(
            dashboardUuid,
        );
        expect(analyticsMock.track).toHaveBeenCalledTimes(1);
        expect(analyticsMock.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'dashboard.deleted',
            }),
        );
    });
    test('should not see dashboard from other organizations', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        await expect(
            service.getByIdOrSlug(anotherUser, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see empty list if getting all dashboard by project uuid from another organization', async () => {
        const anotherUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [],
            ),
        };
        const result = await service.getAllByProject(
            anotherUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getAllByProject).toHaveBeenCalledWith(
            projectUuid,
            undefined,
        );
    });

    test('should not see dashboard from private space if you are not admin', async () => {
        (dashboardModel.getByIdOrSlug as jest.Mock).mockImplementationOnce(
            async () => ({ ...dashboard, spaceUuid: privateSpace.uuid }),
        );

        const userViewer = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    organizationUuid: 'another-org-uuid',
                },
                [
                    {
                        projectUuid,
                        role: ProjectMemberRole.VIEWER,
                        userUuid: user.userUuid,
                        roleUuid: undefined,
                    },
                ],
            ),
        };
        await expect(
            service.getByIdOrSlug(userViewer, dashboard.uuid),
        ).rejects.toThrowError(ForbiddenError);
    });
    test('should see dashboard from private space if you are admin', async () => {
        const privateDashboard = {
            ...dashboard,
            uuid: 'private-dashboard-uuid',
            spaceUuid: privateSpace.uuid,
        };

        // Changing the mock to return a private dashboard (in private space)
        (dashboardModel.getByIdOrSlug as jest.Mock).mockImplementationOnce(
            async () => privateDashboard,
        );

        await expect(
            service.getByIdOrSlug(user, privateDashboard.uuid),
        ).resolves.not.toThrowError(ForbiddenError);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledTimes(1);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            privateDashboard.uuid,
            { projectUuid: undefined },
        );
    });

    test('should not see dashboards from private space if you are not an admin', async () => {
        (dashboardModel.getAllByProject as jest.Mock).mockImplementationOnce(
            async () =>
                dashboardsDetails.map((d) => ({
                    ...d,
                    spaceUuid: privateSpace.uuid,
                })),
        );

        const editorUser: SessionUser = {
            ...user,
            role: OrganizationMemberRole.EDITOR,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Dashboard',
                    action: ['view', 'update', 'delete', 'create'],
                },
            ]),
        };
        const result = await service.getAllByProject(
            editorUser,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
    });
    test('should auto-unverify dashboard when details are updated', async () => {
        await service.update(user, dashboardUuid, updateDashboard);

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            dashboardUuid,
        );
    });
    test('should auto-unverify dashboard when tiles are updated', async () => {
        await service.update(user, dashboardUuid, updateDashboardTiles);

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            dashboardUuid,
        );
    });

    describe('duplicate', () => {
        const dashboardScopedTileUuid = 'dashboard-chart-tile-uuid';
        const spaceTileUuid = 'space-chart-tile-uuid';

        const dashboardWithScopedCharts: Dashboard = {
            ...dashboard,
            tiles: [
                {
                    uuid: dashboardScopedTileUuid,
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        savedChartUuid: 'scoped-chart-uuid',
                        belongsToDashboard: true,
                        title: 'Dashboard Chart',
                    },
                    x: 0,
                    y: 0,
                    h: 2,
                    w: 2,
                    tabUuid: undefined,
                },
                {
                    uuid: spaceTileUuid,
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        savedChartUuid: 'space-chart-uuid',
                        title: 'Space Chart',
                    },
                    x: 2,
                    y: 0,
                    h: 2,
                    w: 2,
                    tabUuid: undefined,
                },
            ],
            filters: {
                dimensions: [
                    {
                        id: 'dim-filter',
                        target: {
                            fieldId: 'dim_field',
                            tableName: 'table',
                        },
                        operator: FilterOperator.EQUALS,
                        values: ['a'],
                        label: undefined,
                        tileTargets: {
                            [dashboardScopedTileUuid]: {
                                fieldId: 'dim_field',
                                tableName: 'table',
                            },
                            [spaceTileUuid]: {
                                fieldId: 'dim_field',
                                tableName: 'table',
                            },
                        },
                    },
                ],
                metrics: [
                    {
                        id: 'metric-filter',
                        target: {
                            fieldId: 'metric_field',
                            tableName: 'table',
                        },
                        operator: FilterOperator.EQUALS,
                        values: [1],
                        label: undefined,
                        tileTargets: {
                            [dashboardScopedTileUuid]: false,
                        },
                    },
                ],
                tableCalculations: [],
            },
            tabs: [],
        };

        beforeEach(() => {
            (dashboardModel.getByIdOrSlug as jest.Mock).mockResolvedValue(
                dashboardWithScopedCharts,
            );
            (dashboardModel.create as jest.Mock).mockResolvedValue(
                dashboardWithScopedCharts,
            );
            jest.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                service as any,
                'duplicateChartForDashboard',
            ).mockResolvedValue('new-duplicated-chart-uuid');
        });

        test('should remap filter tileTargets when duplicating dashboard-scoped charts', async () => {
            await service.duplicate(user, projectUuid, dashboard.uuid, {
                dashboardName: 'Duplicated',
                dashboardDesc: 'desc',
            });

            expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
            const versionData = (dashboardModel.addVersion as jest.Mock).mock
                .calls[0][1];

            const dashboardScopedTile = versionData.tiles.find(
                (t: DashboardChartTile) =>
                    t.properties.savedChartUuid === 'new-duplicated-chart-uuid',
            );
            const spaceTile = versionData.tiles.find(
                (t: DashboardChartTile) =>
                    t.properties.savedChartUuid === 'space-chart-uuid',
            );

            expect(dashboardScopedTile.uuid).not.toBe(dashboardScopedTileUuid);
            expect(spaceTile.uuid).toBe(spaceTileUuid);

            const newTileUuid = dashboardScopedTile.uuid;

            const dimFilter: DashboardFilterRule =
                versionData.filters.dimensions[0];
            expect(dimFilter.tileTargets).toHaveProperty(newTileUuid);
            expect(dimFilter.tileTargets).toHaveProperty(spaceTileUuid);
            expect(dimFilter.tileTargets).not.toHaveProperty(
                dashboardScopedTileUuid,
            );

            const metricFilter: DashboardFilterRule =
                versionData.filters.metrics[0];
            expect(metricFilter.tileTargets).toHaveProperty(newTileUuid);
            expect(metricFilter.tileTargets![newTileUuid]).toBe(false);
            expect(metricFilter.tileTargets).not.toHaveProperty(
                dashboardScopedTileUuid,
            );
        });

        test('should preserve undefined tileTargets on filters', async () => {
            const dashboardWithUntargetedFilters: Dashboard = {
                ...dashboardWithScopedCharts,
                filters: {
                    dimensions: [
                        {
                            id: 'untargeted',
                            target: {
                                fieldId: 'f',
                                tableName: 't',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [],
                            label: undefined,
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            };
            (dashboardModel.getByIdOrSlug as jest.Mock).mockResolvedValue(
                dashboardWithUntargetedFilters,
            );
            (dashboardModel.create as jest.Mock).mockResolvedValue(
                dashboardWithUntargetedFilters,
            );

            await service.duplicate(user, projectUuid, dashboard.uuid, {
                dashboardName: 'Dup',
                dashboardDesc: '',
            });

            const versionData = (dashboardModel.addVersion as jest.Mock).mock
                .calls[0][1];
            expect(
                versionData.filters.dimensions[0].tileTargets,
            ).toBeUndefined();
        });
    });

    describe('getSchedulerRuns', () => {
        const schedulerUuid = 'scheduler-uuid';
        const runsPayload = { data: [], pagination: undefined };
        const editorOwnUser: SessionUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    role: OrganizationMemberRole.MEMBER,
                },
                [
                    {
                        projectUuid: dashboard.projectUuid,
                        role: ProjectMemberRole.EDITOR,
                        userUuid: user.userUuid,
                        roleUuid: undefined,
                    },
                ],
            ),
        };
        const viewerUser: SessionUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    role: OrganizationMemberRole.MEMBER,
                },
                [
                    {
                        projectUuid: dashboard.projectUuid,
                        role: ProjectMemberRole.VIEWER,
                        userUuid: user.userUuid,
                        roleUuid: undefined,
                    },
                ],
            ),
        };

        beforeEach(() => {
            schedulerModel.getScheduler.mockResolvedValue({
                schedulerUuid,
                dashboardUuid: dashboard.uuid,
                savedChartUuid: null,
                savedSqlUuid: null,
                createdBy: user.userUuid,
            });
            schedulerModel.getProjectSchedulerRuns.mockResolvedValue(
                runsPayload,
            );
        });

        test('returns runs when the user can manage the scheduler', async () => {
            const result = await service.getSchedulerRuns(
                editorOwnUser,
                dashboard.uuid,
                schedulerUuid,
            );

            expect(result).toBe(runsPayload);
            expect(schedulerModel.getProjectSchedulerRuns).toHaveBeenCalledWith(
                {
                    projectUuid: dashboard.projectUuid,
                    paginateArgs: undefined,
                    filters: { schedulerUuids: [schedulerUuid] },
                },
            );
        });

        test('throws 403 when the user cannot manage scheduled deliveries', async () => {
            await expect(
                service.getSchedulerRuns(
                    viewerUser,
                    dashboard.uuid,
                    schedulerUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                schedulerModel.getProjectSchedulerRuns,
            ).not.toHaveBeenCalled();
        });

        test("throws 403 when an editor tries to view another user's scheduler", async () => {
            schedulerModel.getScheduler.mockResolvedValueOnce({
                schedulerUuid,
                dashboardUuid: dashboard.uuid,
                savedChartUuid: null,
                savedSqlUuid: null,
                createdBy: 'someone-else',
            });

            await expect(
                service.getSchedulerRuns(
                    editorOwnUser,
                    dashboard.uuid,
                    schedulerUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                schedulerModel.getProjectSchedulerRuns,
            ).not.toHaveBeenCalled();
        });

        test('throws NotFoundError when the scheduler belongs to a different dashboard', async () => {
            schedulerModel.getScheduler.mockResolvedValueOnce({
                schedulerUuid,
                dashboardUuid: 'other-dashboard-uuid',
                savedChartUuid: null,
                savedSqlUuid: null,
                createdBy: user.userUuid,
            });

            await expect(
                service.getSchedulerRuns(
                    editorOwnUser,
                    dashboard.uuid,
                    schedulerUuid,
                ),
            ).rejects.toThrowError(NotFoundError);
            expect(
                schedulerModel.getProjectSchedulerRuns,
            ).not.toHaveBeenCalled();
        });
    });
});
