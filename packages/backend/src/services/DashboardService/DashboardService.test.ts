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
    SCHEDULER_TASKS,
    SchedulerFormat,
    SessionUser,
    SpaceMemberRole,
    type Account,
    type ContentVerificationInfo,
    type Dashboard,
    type DashboardChartTile,
    type DashboardFilterRule,
    type UpdateDashboard,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account/account';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import {
    SpacePermissionService,
    type AccessTarget,
} from '../SpaceService/SpacePermissionService';
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
    getAllByProject: vi.fn(async () => dashboardsDetails),

    getByIdOrSlug: vi.fn(async () => dashboard),

    create: vi.fn(async () => dashboard),

    update: vi.fn(async () => dashboard),

    permanentDelete: vi.fn(async () => dashboard),

    addVersion: vi.fn(async () => dashboard),

    getOrphanedCharts: vi.fn(async () => []),

    getDashboardOwnedChartUuidsUsingMetric: vi.fn(
        async (): Promise<string[]> => [],
    ),

    updateLatestVersionConfig: vi.fn(async () => undefined),

    getDashboardsSummaryByOwner: vi.fn(async () => ({
        totalCount: 2,
        byProject: [
            {
                projectUuid: 'projectUuid',
                projectName: 'Jaffle shop',
                count: 2,
            },
        ],
    })),

    updateOwnerByUser: vi.fn(async () => 2),
};

const spaceModel = {
    getSpaceSummary: vi.fn(async () => publicSpace),
    get: vi.fn(async () => publicSpace),
};
const analyticsModel = {
    addDashboardViewEvent: vi.fn(async () => null),
};
const savedChartModel = {
    get: vi.fn(async () => chart),
    transaction: vi.fn(async (cb: (tx: never) => Promise<void>) =>
        cb(undefined as never),
    ),
    createVersion: vi.fn(async () => chart),
    create: vi.fn(async () => ({ ...chart, uuid: 'duplicated-chart-uuid' })),
    permanentDelete: vi.fn(async () => ({
        uuid: 'chart_uuid',
        projectUuid: 'project_uuid',
    })),
    getInfoForAvailableFilters: vi.fn(async () => []),
};
const savedSqlModel = {
    getByUuid: vi.fn(async () => ({
        space: {
            uuid: publicSpace.uuid,
        },
    })),
};

const projectModel = {
    getCachedExploreNames: vi.fn(async () => []),
    get: vi.fn(async () => ({ schedulerTimezone: 'UTC' })),
};

const schedulerModel = {
    getScheduler: vi.fn(),
    getProjectSchedulerRuns: vi.fn(),
    getSchedulers: vi.fn(),
    createScheduler: vi.fn(),
};

const slackClient = {
    joinChannels: vi.fn(async () => undefined),
};

const schedulerClient = {
    generateDailyJobsForScheduler: vi.fn(async () => undefined),
    scheduleTask: vi.fn(async () => ({ jobId: 'jobId' })),
};

const dashboardChartsResult = {
    dashboardName: dashboard.name,
    charts: [],
    pagination: {
        page: 1,
        pageSize: 20,
        totalResults: 0,
        totalPageCount: 0,
    },
};

const searchModel = {
    getDashboardCharts: vi.fn(async () => dashboardChartsResult),
};

const contentAsCodeProjectSettingsModel = { get: vi.fn() };
const contentAsCodeSnapshotModel = { get: vi.fn() };

const contentVerificationModel = {
    getByContent: vi.fn(
        async (): Promise<ContentVerificationInfo | null> => null,
    ),
    unverify: vi.fn(async () => undefined),
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

const lookupSpaceContext = (spaceUuid: string) => {
    if (spaceUuid === space.space_uuid) {
        return spaceContexts[space.space_uuid];
    }
    if (spaceUuid === privateSpace.uuid) {
        return spaceContexts[privateSpace.uuid];
    }
    return spaceContexts[publicSpace.uuid];
};

const spacePermissionService = {
    resolveAccess: vi.fn(async (_userUuid: string, target: AccessTarget) => ({
        ...lookupSpaceContext(target.spaceUuid ?? ''),
        directOnly: false,
    })),
    resolveAccessBatch: vi.fn(
        async (_userUuid: string, targets: { spaceUuid: string }[]) =>
            targets.map((target) => ({
                target,
                context: {
                    ...lookupSpaceContext(target.spaceUuid),
                    directOnly: false,
                },
            })),
    ),
    getFirstViewableSpaceUuid: vi.fn(async () => publicSpace.uuid),
};

vi.spyOn(analyticsMock, 'track');
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
        searchModel: searchModel as unknown as SearchModel,
        schedulerService: {} as SchedulerService,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        savedChartService: {} as SavedChartService, // Mock for test
        projectModel: projectModel as unknown as ProjectModel,
        slackClient: slackClient as unknown as SlackClient,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        contentAsCodeProjectSettingsModel:
            contentAsCodeProjectSettingsModel as never,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as never,
        contentDraftModel: {
            findOpenDraft: vi.fn(),
            listOpenForContent: vi.fn(async () => []),
        } as never,
        catalogModel: {} as CatalogModel,
        organizationModel: {
            findColorPalette: vi.fn(async () => null),
        } as unknown as OrganizationModel,
        organizationMemberProfileModel: {
            getOrganizationMemberByUuid: vi.fn(async () => ({
                organizationUuid: user.organizationUuid,
                userUuid: 'target-user-uuid',
            })),
        } as unknown as OrganizationMemberProfileModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    test('duplicates dashboard charts from the original slug base', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (service as any).duplicateChartForDashboard({
            chartUuid: chart.uuid,
            projectUuid,
            dashboardUuid,
            user,
        });

        expect(savedChartModel.get).toHaveBeenCalledWith(
            chart.uuid,
            undefined,
            { projectUuid },
        );
        expect(savedChartModel.create).toHaveBeenCalledWith(
            projectUuid,
            user.userUuid,
            expect.objectContaining({
                slug: chart.slug,
                dashboardUuid,
            }),
        );
    });

    test('refuses to duplicate a source chart the user cannot view', async () => {
        const userWithoutChartAccess = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'Dashboard', action: ['view', 'update'] },
            ]),
        };

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).duplicateChartForDashboard({
                chartUuid: chart.uuid,
                projectUuid,
                dashboardUuid,
                user: userWithoutChartAccess,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });

    test('a dashboard grant does not authorize copying the chart into a different dashboard', async () => {
        const grantOnlyUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'SavedChart',
                    action: ['view'],
                    conditions: {
                        access: { $elemMatch: { userUuid: user.userUuid } },
                    },
                },
            ]),
        };
        savedChartModel.get.mockResolvedValueOnce({
            ...chart,
            dashboardUuid: 'other-dashboard-uuid',
            spaceUuid: privateSpace.uuid,
        });
        // The user holds a viewer grant on the chart's owning dashboard; the
        // grant must still not authorize copying it into another dashboard.
        spacePermissionService.resolveAccess.mockImplementationOnce(
            async (_userUuid: string, target: AccessTarget) => {
                const targetDashboardUuid =
                    target.type === 'dashboard'
                        ? target.dashboardUuid
                        : undefined;
                return {
                    ...spaceContexts[privateSpace.uuid],
                    access:
                        targetDashboardUuid === 'other-dashboard-uuid'
                            ? [
                                  {
                                      userUuid: user.userUuid,
                                      role: SpaceMemberRole.VIEWER,
                                      hasDirectAccess: true,
                                      grantedVia: 'dashboard',
                                  },
                              ]
                            : [],
                    directOnly: targetDashboardUuid === 'other-dashboard-uuid',
                } as never;
            },
        );

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).duplicateChartForDashboard({
                chartUuid: chart.uuid,
                projectUuid,
                dashboardUuid,
                user: grantOnlyUser,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            user.userUuid,
            {
                type: 'space',
                spaceUuid: privateSpace.uuid,
            },
        );
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });

    test('a dashboard grant authorizes duplication within the owning dashboard', async () => {
        const grantOnlyUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'SavedChart',
                    action: ['view'],
                    conditions: {
                        access: { $elemMatch: { userUuid: user.userUuid } },
                    },
                },
            ]),
        };
        savedChartModel.get.mockResolvedValueOnce({
            ...chart,
            spaceUuid: privateSpace.uuid,
        });
        spacePermissionService.resolveAccess.mockResolvedValueOnce({
            ...spaceContexts[privateSpace.uuid],
            access: [
                {
                    userUuid: user.userUuid,
                    role: SpaceMemberRole.VIEWER,
                    hasDirectAccess: true,
                    grantedVia: 'dashboard',
                },
            ],
            directOnly: true,
        } as never);

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (service as any).duplicateChartForDashboard({
                chartUuid: chart.uuid,
                projectUuid,
                dashboardUuid,
                user: grantOnlyUser,
            }),
        ).resolves.toBe('duplicated-chart-uuid');
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid,
                spaceUuid: privateSpace.uuid,
            },
        );
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

    test('loads a private dashboard through a direct grant without exposing its space name', async () => {
        const directViewer = {
            ...user,
            ability: defineUserAbility(
                { ...user, organizationUuid: 'another-org-uuid' },
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
        const privateDashboard = {
            ...dashboard,
            spaceUuid: privateSpace.uuid,
            spaceName: 'Private finance',
        };
        dashboardModel.getByIdOrSlug.mockResolvedValueOnce(privateDashboard);
        spacePermissionService.resolveAccess.mockResolvedValueOnce({
            ...spaceContexts[privateSpace.uuid],
            access: [
                {
                    userUuid: user.userUuid,
                    role: SpaceMemberRole.VIEWER,
                    hasDirectAccess: true,
                    projectRole: undefined,
                    inheritedRole: undefined,
                    inheritedFrom: undefined,
                },
            ],
            directOnly: true,
        } as never);

        const result = await service.getByIdOrSlug(
            directViewer,
            privateDashboard.uuid,
        );

        expect(result).toMatchObject({
            uuid: privateDashboard.uuid,
            spaceUuid: privateSpace.uuid,
            spaceName: 'Private finance',
            access: [
                expect.objectContaining({
                    userUuid: user.userUuid,
                    role: SpaceMemberRole.VIEWER,
                    hasDirectAccess: true,
                }),
            ],
        });
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: privateDashboard.uuid,
                spaceUuid: privateSpace.uuid,
            },
        );
    });

    test('denies the same private dashboard without a direct grant', async () => {
        const outsider = {
            ...user,
            ability: defineUserAbility(
                { ...user, organizationUuid: 'another-org-uuid' },
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
        dashboardModel.getByIdOrSlug.mockResolvedValueOnce({
            ...dashboard,
            spaceUuid: privateSpace.uuid,
        });
        spacePermissionService.resolveAccess.mockResolvedValueOnce({
            ...spaceContexts[privateSpace.uuid],
            directOnly: false,
        });

        await expect(
            service.getByIdOrSlug(outsider, dashboard.uuid),
        ).rejects.toThrow(ForbiddenError);
    });

    test('should forward the applied parameter values when exporting content', async () => {
        await service.scheduleExportContent(fromSession(user), dashboard.uuid, {
            format: SchedulerFormat.IMAGE,
            parameters: { region: 'APAC' },
        });

        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            SCHEDULER_TASKS.EXPORT_CONTENT,
            expect.objectContaining({ parameters: { region: 'APAC' } }),
        );
    });

    const embedExportAccount = () => {
        const sessionAccount = fromSession(user);
        return {
            ...sessionAccount,
            isJwtUser: () => true,
            authentication: { type: 'jwt', source: 'encoded-jwt' },
            user: {
                ...sessionAccount.user,
                type: 'anonymous',
                id: 'external::user-1',
                // Mirrors the grant embed JWTs get from canExportDashboardCsv:
                // manage ExportCsv scoped to the token's dashboard.
                ability: new Ability<PossibleAbilities>([
                    {
                        subject: 'ExportCsv',
                        action: 'manage',
                        conditions: {
                            'metadata.dashboardUuid': dashboard.uuid,
                        },
                    },
                ]),
            },
        } as unknown as Account;
    };

    test('should carry the encoded JWT when an embed token exports content', async () => {
        await service.scheduleExportContent(
            embedExportAccount(),
            dashboard.uuid,
            {
                format: SchedulerFormat.CSV,
            },
        );

        expect(schedulerClient.scheduleTask).toHaveBeenCalledWith(
            SCHEDULER_TASKS.EXPORT_CONTENT,
            expect.objectContaining({
                encodedJwt: 'encoded-jwt',
                userUuid: 'external::user-1',
            }),
        );
    });

    test('should reject an embed token exporting content as an image', async () => {
        await expect(
            service.scheduleExportContent(
                embedExportAccount(),
                dashboard.uuid,
                {
                    format: SchedulerFormat.IMAGE,
                },
            ),
        ).rejects.toThrowError(ForbiddenError);
    });

    test('throws when an embed write token saves a SQL chart from outside the write space', async () => {
        const embedWriteAccount = {
            isJwtUser: () => true,
            embedWriteUser: user,
            authentication: {
                type: 'jwt',
                data: {
                    writeActions: {
                        spaceUuid: publicSpace.uuid,
                    },
                },
            },
        } as unknown as Account;
        const updateDashboardWithSqlTile: UpdateDashboard = {
            tiles: [
                {
                    uuid: 'sql-tile-uuid',
                    type: DashboardTileTypes.SQL_CHART,
                    x: 0,
                    y: 0,
                    h: 10,
                    w: 10,
                    tabUuid: undefined,
                    properties: {
                        savedSqlUuid: 'saved-sql-uuid',
                        title: 'SQL chart',
                        chartName: 'SQL chart',
                    },
                },
            ],
            filters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            tabs: [],
        };

        savedSqlModel.getByUuid.mockResolvedValueOnce({
            space: {
                uuid: privateSpace.uuid,
            },
        });

        await expect(
            service.updateFromAccount(
                embedWriteAccount,
                dashboard.uuid,
                updateDashboardWithSqlTile,
                { projectUuid: dashboard.projectUuid },
            ),
        ).rejects.toThrowError(ForbiddenError);

        expect(dashboardModel.update).not.toHaveBeenCalled();
    });

    test('keeps the space name in the update response for a grant-only editor', async () => {
        spacePermissionService.resolveAccess
            .mockResolvedValueOnce({
                ...lookupSpaceContext(dashboard.spaceUuid),
                directOnly: true,
            })
            .mockResolvedValueOnce({
                ...lookupSpaceContext(dashboard.spaceUuid),
                directOnly: true,
            });

        const result = await service.update(user, dashboard.uuid, {
            name: 'renamed',
        });

        expect(result.spaceName).toBe(dashboard.spaceName);
    });

    test('should get dashboard charts after dashboard access check', async () => {
        const result = await service.getDashboardCharts(
            user,
            projectUuid,
            dashboard.uuid,
            1,
            20,
        );

        expect(result).toEqual(dashboardChartsResult);
        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            dashboard.uuid,
            { projectUuid },
        );
        expect(searchModel.getDashboardCharts).toHaveBeenCalledWith(
            projectUuid,
            dashboard.uuid,
            1,
            20,
        );
    });
    test('should not get dashboard charts without dashboard access', async () => {
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
            service.getDashboardCharts(
                anotherUser,
                projectUuid,
                dashboard.uuid,
                1,
                20,
            ),
        ).rejects.toThrowError(ForbiddenError);
        expect(searchModel.getDashboardCharts).not.toHaveBeenCalled();
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
    test('should include dashboard filter counts in create analytics', () => {
        expect(
            DashboardService.getCreateEventProperties({
                ...dashboard,
                filters: {
                    dimensions: [{} as DashboardFilterRule],
                    metrics: [{} as DashboardFilterRule],
                    tableCalculations: [],
                },
            }),
        ).toMatchObject({
            filtersCount: 2,
            dimensionFilterCount: 1,
            metricFilterCount: 1,
        });
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
        (dashboardModel.update as import('vitest').Mock).mockResolvedValueOnce({
            ...dashboard,
            filters: {
                dimensions: [
                    { lockedTabUuids: ['tab-uuid'] } as DashboardFilterRule,
                ],
                metrics: [{} as DashboardFilterRule],
                tableCalculations: [],
            },
        });

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
                properties: expect.objectContaining({
                    filtersCount: 2,
                    dimensionFilterCount: 1,
                    metricFilterCount: 1,
                    lockedFilterCount: 1,
                }),
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
        (
            dashboardModel.getOrphanedCharts as import('vitest').Mock
        ).mockImplementationOnce(async () => [{ uuid: 'chart_uuid' }]);

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
        (
            dashboardModel.getOrphanedCharts as import('vitest').Mock
        ).mockImplementationOnce(async () => [{ uuid: 'missing_chart_uuid' }]);
        (
            savedChartModel.permanentDelete as import('vitest').Mock
        ).mockImplementationOnce(async () => {
            throw new NotFoundError('chart already deleted');
        });

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
        (
            dashboardModel.getByIdOrSlug as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            ...dashboard,
            spaceUuid: privateSpace.uuid,
        }));

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
        (
            dashboardModel.getByIdOrSlug as import('vitest').Mock
        ).mockImplementationOnce(async () => privateDashboard);

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
        (
            dashboardModel.getAllByProject as import('vitest').Mock
        ).mockImplementationOnce(async () =>
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
    test('correlates access by target, not position: reversed batch results change nothing', async () => {
        (
            spacePermissionService.resolveAccessBatch as import('vitest').Mock
        ).mockImplementationOnce(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets
                    .map((target) => ({
                        target,
                        context: {
                            ...lookupSpaceContext(target.spaceUuid),
                            directOnly: false,
                        },
                    }))
                    .reverse(),
        );

        const result = await service.getAllByProject(
            user,
            projectUuid,
            undefined,
        );

        expect(result).toEqual(dashboardsDetails);
    });
    test('fails closed when a batch context is undefined (unresolvable space)', async () => {
        (
            spacePermissionService.resolveAccessBatch as import('vitest').Mock
        ).mockImplementationOnce(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets.map((target) => ({ target, context: undefined })),
        );

        const result = await service.getAllByProject(
            user,
            projectUuid,
            undefined,
        );

        expect(result).toEqual([]);
    });
    test('should preserve dashboard verification when verifier updates details', async () => {
        contentVerificationModel.getByContent.mockResolvedValue({
            verifiedBy: {
                userUuid: user.userUuid,
                firstName: user.firstName,
                lastName: user.lastName,
            },
            verifiedAt: new Date(),
        });

        await service.update(user, dashboardUuid, updateDashboard);

        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();

        contentVerificationModel.getByContent.mockResolvedValue(null);
    });
    test('should auto-unverify dashboard when details are updated without preserving', async () => {
        await service.update(user, dashboardUuid, updateDashboard);

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            dashboardUuid,
        );
    });
    test('should block editors without manage:VerifiedContent from updating verified dashboards', async () => {
        contentVerificationModel.getByContent.mockResolvedValue({
            verifiedBy: {
                userUuid: 'other-verifier',
                firstName: 'Other',
                lastName: 'Verifier',
            },
            verifiedAt: new Date(),
        });
        const editorUser = {
            ...user,
            userUuid: 'editor-uuid',
            role: OrganizationMemberRole.EDITOR,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Dashboard',
                    action: ['view', 'update', 'delete', 'create'],
                },
            ]),
        };

        await expect(
            service.update(editorUser, dashboardUuid, updateDashboard),
        ).rejects.toThrow(ForbiddenError);

        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();

        contentVerificationModel.getByContent.mockResolvedValue(null);
    });
    test('should auto-unverify dashboard when tiles are updated without preserving', async () => {
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
            (
                dashboardModel.getByIdOrSlug as import('vitest').Mock
            ).mockResolvedValue(dashboardWithScopedCharts);
            (dashboardModel.create as import('vitest').Mock).mockResolvedValue(
                dashboardWithScopedCharts,
            );
            vi.spyOn(
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

            expect(dashboardModel.create).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ slug: dashboard.slug }),
                expect.anything(),
                projectUuid,
            );
            expect(dashboardModel.addVersion).toHaveBeenCalledTimes(1);
            const versionData = (
                dashboardModel.addVersion as import('vitest').Mock
            ).mock.calls[0][1];

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
            (
                dashboardModel.getByIdOrSlug as import('vitest').Mock
            ).mockResolvedValue(dashboardWithUntargetedFilters);
            (dashboardModel.create as import('vitest').Mock).mockResolvedValue(
                dashboardWithUntargetedFilters,
            );

            await service.duplicate(user, projectUuid, dashboard.uuid, {
                dashboardName: 'Dup',
                dashboardDesc: '',
            });

            const versionData = (
                dashboardModel.addVersion as import('vitest').Mock
            ).mock.calls[0][1];
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

        test('returns runs when the dashboard is addressed by slug', async () => {
            const result = await service.getSchedulerRuns(
                editorOwnUser,
                dashboard.slug,
                schedulerUuid,
            );

            expect(result).toBe(runsPayload);
            expect(schedulerModel.getProjectSchedulerRuns).toHaveBeenCalled();
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

    describe('getSchedulers', () => {
        const adminUser: SessionUser = {
            ...user,
            ability: defineUserAbility(
                {
                    ...user,
                    role: OrganizationMemberRole.MEMBER,
                },
                [
                    {
                        projectUuid: dashboard.projectUuid,
                        role: ProjectMemberRole.ADMIN,
                        userUuid: user.userUuid,
                        roleUuid: undefined,
                    },
                ],
            ),
        };
        const editorUser: SessionUser = {
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

        beforeEach(() => {
            schedulerModel.getSchedulers.mockResolvedValue({
                data: [],
                pagination: undefined,
            });
        });

        test('admin lists all schedulers for the dashboard', async () => {
            await service.getSchedulers(adminUser, dashboard.uuid);

            expect(schedulerModel.getSchedulers).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: {
                        resourceType: 'dashboard',
                        resourceUuids: [dashboard.uuid],
                    },
                }),
            );
        });

        test('editor lists only their own schedulers for the dashboard', async () => {
            await service.getSchedulers(editorUser, dashboard.uuid);

            expect(schedulerModel.getSchedulers).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: {
                        resourceType: 'dashboard',
                        resourceUuids: [dashboard.uuid],
                        createdByUserUuids: [user.userUuid],
                    },
                }),
            );
        });

        test('resolves slug to uuid when filtering schedulers', async () => {
            await service.getSchedulers(adminUser, dashboard.slug);

            expect(schedulerModel.getSchedulers).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: {
                        resourceType: 'dashboard',
                        resourceUuids: [dashboard.uuid],
                    },
                }),
            );
        });
    });

    describe('createScheduler', () => {
        const editorUser: SessionUser = {
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
        const newScheduler = {
            name: 'My delivery',
            format: SchedulerFormat.CSV,
            cron: '0 9 * * *',
            timezone: 'UTC',
            includeLinks: true,
            targets: [],
            options: { formatted: true, limit: 'table' },
        } as unknown as Parameters<typeof service.createScheduler>[2];

        beforeEach(() => {
            schedulerModel.createScheduler.mockImplementation(
                async (input) => ({
                    ...input,
                    schedulerUuid: 'new-scheduler-uuid',
                }),
            );
        });

        test('creates the scheduler with the resolved uuid when addressed by slug', async () => {
            await service.createScheduler(
                editorUser,
                dashboard.slug,
                newScheduler,
            );

            expect(schedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({ dashboardUuid: dashboard.uuid }),
            );
        });
    });

    describe('offboarding dashboard ownership', () => {
        const managerUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Dashboard',
                    action: ['manage'],
                },
            ]),
        };

        test('summarizes owned dashboards when the caller can manage every project', async () => {
            const summary = await service.getUserDashboardsSummary(
                managerUser,
                'target-user-uuid',
            );

            expect(
                dashboardModel.getDashboardsSummaryByOwner,
            ).toHaveBeenCalledWith('target-user-uuid');
            expect(summary).toEqual({
                totalCount: 2,
                byProject: [
                    {
                        projectUuid: 'projectUuid',
                        projectName: 'Jaffle shop',
                        count: 2,
                    },
                ],
            });
        });

        test('refuses the summary when the caller cannot manage a project', async () => {
            const viewerUser: SessionUser = {
                ...user,
                ability: new Ability<PossibleAbilities>([
                    {
                        subject: 'Dashboard',
                        action: ['view'],
                    },
                ]),
            };

            await expect(
                service.getUserDashboardsSummary(
                    viewerUser,
                    'target-user-uuid',
                ),
            ).rejects.toThrow(ForbiddenError);
        });

        test('reassigns owned dashboards to another org member', async () => {
            const result = await service.reassignUserDashboards(
                managerUser,
                'target-user-uuid',
                'new-owner-uuid',
            );

            expect(dashboardModel.updateOwnerByUser).toHaveBeenCalledWith(
                'target-user-uuid',
                'new-owner-uuid',
                ['projectUuid'],
            );
            expect(result).toEqual({ reassignedCount: 2 });
        });
    });

    describe('updateCustomMetric', () => {
        const registryMetric = {
            name: 'amount_avg',
            table: 'orders',
            label: 'Avg amount',
            sql: '${TABLE}.amount',
            type: 'average',
        };
        const dashboardWithRegistry = {
            ...dashboard,
            config: {
                isDateZoomDisabled: false,
                customMetrics: [registryMetric],
            },
        };
        const affectedChart = {
            ...chart,
            uuid: 'affected_chart_uuid',
            name: 'Affected chart',
            metricQuery: {
                ...chart.metricQuery,
                additionalMetrics: [registryMetric],
            },
        };
        const updatedMetric = { ...registryMetric, label: 'Avg amount (net)' };

        beforeEach(() => {
            dashboardModel.getByIdOrSlug.mockResolvedValue(
                dashboardWithRegistry as never,
            );
            dashboardModel.getDashboardOwnedChartUuidsUsingMetric.mockResolvedValue(
                [affectedChart.uuid],
            );
            savedChartModel.get.mockResolvedValue(affectedChart as never);
        });

        test('swaps the registry entry and re-versions the affected charts', async () => {
            const result = await service.updateCustomMetric(
                user,
                dashboardUuid,
                { metric: updatedMetric as never },
            );

            expect(result.dryRun).toBe(false);
            expect(result.customMetrics).toEqual([updatedMetric]);
            expect(result.affectedCharts).toEqual([
                { uuid: affectedChart.uuid, name: affectedChart.name },
            ]);
            expect(
                dashboardModel.updateLatestVersionConfig,
            ).toHaveBeenCalledWith(
                dashboardUuid,
                expect.objectContaining({ customMetrics: [updatedMetric] }),
                undefined,
            );
            expect(savedChartModel.createVersion).toHaveBeenCalledTimes(1);
            expect(savedChartModel.createVersion).toHaveBeenCalledWith(
                affectedChart.uuid,
                expect.objectContaining({
                    metricQuery: expect.objectContaining({
                        additionalMetrics: [updatedMetric],
                    }),
                }),
                user,
                undefined,
            );
        });

        test('dryRun reports affected charts without writing', async () => {
            const result = await service.updateCustomMetric(
                user,
                dashboardUuid,
                { metric: updatedMetric as never, dryRun: true },
            );

            expect(result.dryRun).toBe(true);
            expect(result.affectedCharts).toEqual([
                { uuid: affectedChart.uuid, name: affectedChart.name },
            ]);
            expect(
                dashboardModel.updateLatestVersionConfig,
            ).not.toHaveBeenCalled();
            expect(savedChartModel.createVersion).not.toHaveBeenCalled();
        });

        test('blocks dashboards managed as code', async () => {
            contentAsCodeProjectSettingsModel.get.mockResolvedValueOnce({
                syncEnabled: true,
            });
            contentAsCodeSnapshotModel.get.mockResolvedValueOnce({
                snapshot: {},
                snapshotHash: 'hash',
            });

            await expect(
                service.updateCustomMetric(user, dashboardUuid, {
                    metric: updatedMetric as never,
                }),
            ).rejects.toThrowError(
                'Shared metrics cannot be edited on a dashboard managed as code',
            );
            expect(
                dashboardModel.updateLatestVersionConfig,
            ).not.toHaveBeenCalled();
        });

        test('rejects identity changes and unknown metrics as not-in-registry', async () => {
            // Identity is the lookup key, so a rename can never match an entry
            await expect(
                service.updateCustomMetric(user, dashboardUuid, {
                    metric: {
                        ...updatedMetric,
                        name: 'renamed_metric',
                    } as never,
                }),
            ).rejects.toThrowError(NotFoundError);
        });
    });
});
