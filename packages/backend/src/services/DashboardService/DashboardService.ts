import { subject } from '@casl/ability';
import {
    AlreadyExistsError,
    CreateDashboard,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardBasicDetails,
    DashboardDAO,
    DashboardTileTypes,
    ForbiddenError,
    generateSlug,
    hasChartsInDashboard,
    isChartScheduler,
    isChartTile,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    SpaceSummary,
    UpdateDashboard,
    UpdatedByUser,
    UpdateMultipleDashboards,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { v4 as uuidv4 } from 'uuid';
import {
    CreateDashboardOrVersionEvent,
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';

type DashboardServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    savedChartModel: SavedChartModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
};

export class DashboardService extends BaseService {
    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    savedChartModel: SavedChartModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    constructor({
        analytics,
        projectModel,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        savedChartModel,
        schedulerClient,
        slackClient,
    }: DashboardServiceArguments) {
        super();
        this.analytics = analytics;
        this.projectModel = projectModel;

        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.savedChartModel = savedChartModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
    }

    static getCreateEventProperties(
        dashboard: DashboardDAO,
    ): CreateDashboardOrVersionEvent['properties'] {
        return {
            projectId: dashboard.projectUuid,
            dashboardId: dashboard.uuid,
            filtersCount: dashboard.filters
                ? dashboard.filters.metrics.length +
                  dashboard.filters.dimensions.length
                : 0,
            tilesCount: dashboard.tiles.length,
            chartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SAVED_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
        };
    }

    private async deleteOrphanedChartsInDashboards(
        user: SessionUser,
        dashboardUuid: string,
    ) {
        const orphanedCharts = await this.dashboardModel.getOrphanedCharts(
            dashboardUuid,
        );
        await Promise.all(
            orphanedCharts.map(async (chart) => {
                const deletedChart = await this.savedChartModel.delete(
                    chart.uuid,
                );
                this.analytics.track({
                    event: 'saved_chart.deleted',
                    userId: user.userUuid,
                    properties: {
                        savedQueryId: deletedChart.uuid,
                        projectId: deletedChart.projectUuid,
                    },
                });
            }),
        );
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: string,
        chartUuid?: string,
        includePrivate?: boolean,
    ): Promise<DashboardBasicDetails[]> {
        const dashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
        );
        const spaceUuids = [
            ...new Set(dashboards.map((dashboard) => dashboard.spaceUuid)),
        ];
        const spaces = await Promise.all(
            spaceUuids.map((spaceUuid) =>
                this.spaceModel.getSpaceSummary(spaceUuid),
            ),
        );
        const dashboardAccesses = await Promise.all(
            dashboards.map(async (dashboard) => {
                const spaceAccess = await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    dashboard.spaceUuid,
                );
                return {
                    uuid: dashboard.uuid,
                    access: spaceAccess,
                };
            }),
        );
        return dashboards.filter((dashboard) => {
            const dashboardSpace = spaces.find(
                (space) => space.uuid === dashboard.spaceUuid,
            );
            const spaceAccess = dashboardAccesses.find(
                (access) => access.uuid === dashboard.uuid,
            );
            const hasAbility = user.ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboardSpace?.organizationUuid,
                    projectUuid: dashboardSpace?.projectUuid,
                    isPrivate: dashboardSpace?.isPrivate,
                    access: spaceAccess?.access,
                }),
            );
            return (
                dashboardSpace &&
                (includePrivate
                    ? hasAbility
                    : hasAbility &&
                      hasDirectAccessToSpace(user, dashboardSpace))
            );
        });
    }

    async getById(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getById(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        if (user.ability.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.analyticsModel.addDashboardViewEvent(
            dashboard.uuid,
            user.userUuid,
        );
        this.analytics.track({
            event: 'dashboard.view',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboard.uuid,
                organizationId: dashboard.organizationUuid,
                projectId: dashboard.projectUuid,
            },
        });

        return dashboard;
    }

    static findChartsThatBelongToDashboard(
        dashboard: Pick<Dashboard, 'tiles'>,
    ): string[] {
        return dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (
                isChartTile(tile) &&
                !!tile.properties.belongsToDashboard &&
                !!tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const getFirstSpace = async () => {
            const space = await this.spaceModel.getFirstAccessibleSpace(
                projectUuid,
                user.userUuid,
            );
            return {
                organizationUuid: space.organization_uuid,
                uuid: space.space_uuid,
                isPrivate: space.is_private,
                name: space.name,
            };
        };
        const space = dashboard.spaceUuid
            ? await this.spaceModel.get(dashboard.spaceUuid)
            : await getFirstSpace();

        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        const createDashboard = {
            ...dashboard,
            slug: generateSlug(dashboard.name),
        };
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            createDashboard,
            user,
            projectUuid,
        );
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });

        const dashboardDao = await this.dashboardModel.getById(
            newDashboard.uuid,
        );

        return {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
        data: { dashboardName: string; dashboardDesc: string },
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getById(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        if (user.ability.cannot('create', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const duplicatedDashboard = {
            ...dashboard,
            description: data.dashboardDesc,
            name: data.dashboardName,
            slug: generateSlug(dashboard.name),
        };

        const newDashboard = await this.dashboardModel.create(
            dashboard.spaceUuid,
            duplicatedDashboard,
            user,
            projectUuid,
        );

        if (hasChartsInDashboard(newDashboard)) {
            const updatedTiles = await Promise.all(
                newDashboard.tiles.map(async (tile) => {
                    if (
                        isChartTile(tile) &&
                        tile.properties.belongsToDashboard &&
                        tile.properties.savedChartUuid
                    ) {
                        const chartInDashboard = await this.savedChartModel.get(
                            tile.properties.savedChartUuid,
                        );
                        const duplicatedChart =
                            await this.savedChartModel.create(
                                newDashboard.projectUuid,
                                user.userUuid,
                                {
                                    ...chartInDashboard,
                                    spaceUuid: null,
                                    dashboardUuid: newDashboard.uuid,
                                    updatedByUser: {
                                        userUuid: user.userUuid,
                                        firstName: user.firstName,
                                        lastName: user.lastName,
                                    },
                                    slug: generateSlug(chartInDashboard.name),
                                },
                            );
                        this.analytics.track({
                            event: 'saved_chart.created',
                            userId: user.userUuid,
                            properties: {
                                ...SavedChartService.getCreateEventProperties(
                                    duplicatedChart,
                                ),
                                dashboardId:
                                    duplicatedChart.dashboardUuid ?? undefined,
                                duplicated: true,
                            },
                        });
                        return {
                            ...tile,
                            uuid: uuidv4(),
                            properties: {
                                ...tile.properties,
                                savedChartUuid: duplicatedChart.uuid,
                            },
                        };
                    }
                    return tile;
                }),
            );

            await this.dashboardModel.addVersion(
                newDashboard.uuid,
                {
                    tiles: [...updatedTiles],
                    filters: newDashboard.filters,
                    tabs: newDashboard.tabs,
                },
                user,
                projectUuid,
            );
        }

        const dashboardProperties =
            DashboardService.getCreateEventProperties(newDashboard);
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: { ...dashboardProperties, duplicated: true },
        });

        this.analytics.track({
            event: 'duplicated_dashboard_created',
            userId: user.userUuid,
            properties: {
                ...dashboardProperties,
                newDashboardId: newDashboard.uuid,
                duplicateOfDashboardId: dashboard.uuid,
            },
        });

        const updatedNewDashboard = await this.dashboardModel.getById(
            newDashboard.uuid,
        );

        return {
            ...updatedNewDashboard,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    async update(
        user: SessionUser,
        dashboardUuid: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        const existingDashboardDao = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const canUpdateDashboardInCurrentSpace = user.ability.can(
            'update',
            subject('Dashboard', {
                ...(await this.spaceModel.getSpaceSummary(
                    existingDashboardDao.spaceUuid,
                )),
                access: await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    existingDashboardDao.spaceUuid,
                ),
            }),
        );
        if (!canUpdateDashboardInCurrentSpace) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (isDashboardUnversionedFields(dashboard)) {
            if (dashboard.spaceUuid) {
                const canUpdateDashboardInNewSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboard.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboard.spaceUuid,
                        ),
                    }),
                );
                if (!canUpdateDashboardInNewSpace) {
                    throw new ForbiddenError(
                        "You don't have access to the space this dashboard is being moved to",
                    );
                }
            }

            const updatedDashboard = await this.dashboardModel.update(
                dashboardUuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
                },
            );

            this.analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedDashboard.uuid,
                    projectId: updatedDashboard.projectUuid,
                    tilesCount: updatedDashboard.tiles.length,
                    chartTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                    ).length,
                    markdownTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.MARKDOWN,
                    ).length,
                    loomTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.LOOM,
                    ).length,
                    filtersCount:
                        updatedDashboard.filters.dimensions.length +
                        updatedDashboard.filters.metrics.length,
                },
            });
        }
        if (isDashboardVersionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.addVersion(
                dashboardUuid,
                {
                    tiles: dashboard.tiles,
                    filters: dashboard.filters,
                    tabs: dashboard.tabs || [],
                },
                user,
                existingDashboardDao.projectUuid,
            );
            this.analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
            await this.deleteOrphanedChartsInDashboards(user, dashboardUuid);
        }

        const updatedNewDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            updatedNewDashboard.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            updatedNewDashboard.spaceUuid,
        );

        return {
            ...updatedNewDashboard,
            isPrivate: space.isPrivate,
            access,
        };
    }

    async togglePinning(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const existingDashboardDao = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            existingDashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            existingDashboardDao.spaceUuid,
        );
        const existingDashboard = {
            ...existingDashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };

        const { projectUuid, organizationUuid, pinnedListUuid, spaceUuid } =
            existingDashboard;
        if (
            user.ability.cannot(
                'manage',
                subject('PinnedItems', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            user.ability.cannot('view', subject('Dashboard', existingDashboard))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                dashboardUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                dashboardUuid,
            });
        }

        const pinnedList = await this.pinnedListModel.getPinnedListAndItems(
            existingDashboard.projectUuid,
        );

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: existingDashboard.projectUuid,
                organizationId: existingDashboard.organizationUuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return this.getById(user, dashboardUuid);
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<Dashboard[]> {
        const userHasAccessToDashboards = await Promise.all(
            dashboards.map(async (dashboardToUpdate) => {
                const dashboard = await this.dashboardModel.getById(
                    dashboardToUpdate.uuid,
                );
                const canUpdateDashboardInCurrentSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboard.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboard.spaceUuid,
                        ),
                    }),
                );
                const canUpdateDashboardInNewSpace = user.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...(await this.spaceModel.getSpaceSummary(
                            dashboardToUpdate.spaceUuid,
                        )),
                        access: await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            dashboardToUpdate.spaceUuid,
                        ),
                    }),
                );
                return (
                    canUpdateDashboardInCurrentSpace &&
                    canUpdateDashboardInNewSpace
                );
            }),
        );

        if (userHasAccessToDashboards.some((hasAccess) => !hasAccess)) {
            throw new ForbiddenError(
                "You don't have access to some of the dashboards you are trying to update.",
            );
        }

        this.analytics.track({
            event: 'dashboard.updated_multiple',
            userId: user.userUuid,
            properties: {
                dashboardIds: dashboards.map((dashboard) => dashboard.uuid),
                projectId: projectUuid,
            },
        });

        const updatedDashboards = await this.dashboardModel.updateMultiple(
            projectUuid,
            dashboards,
        );

        const updatedDashboardsWithSpacesAccess = updatedDashboards.map(
            async (dashboard) => {
                const dashboardSpace = await this.spaceModel.getSpaceSummary(
                    dashboard.spaceUuid,
                );
                const dashboardSpaceAccess =
                    await this.spaceModel.getUserSpaceAccess(
                        user.userUuid,
                        dashboard.spaceUuid,
                    );
                return {
                    ...dashboard,
                    isPrivate: dashboardSpace.isPrivate,
                    access: dashboardSpaceAccess,
                };
            },
        );

        return Promise.all(updatedDashboardsWithSpacesAccess);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        const { organizationUuid, projectUuid, spaceUuid } =
            await this.dashboardModel.getById(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        if (
            user.ability.cannot(
                'delete',
                subject('Dashboard', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const deletedDashboard = await this.dashboardModel.delete(
            dashboardUuid,
        );
        this.analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            properties: {
                dashboardId: deletedDashboard.uuid,
                projectId: deletedDashboard.projectUuid,
            },
        });
    }

    async getSchedulers(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        await this.checkCreateScheduledDeliveryAccess(user, dashboardUuid);
        return this.schedulerModel.getDashboardSchedulers(dashboardUuid);
    }

    async createScheduler(
        user: SessionUser,
        dashboardUuid: string,
        newScheduler: CreateSchedulerAndTargetsWithoutIds,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { projectUuid, organizationUuid } =
            await this.checkCreateScheduledDeliveryAccess(user, dashboardUuid);
        const scheduler = await this.schedulerModel.createScheduler({
            ...newScheduler,
            createdBy: user.userUuid,
            dashboardUuid,
            savedChartUuid: null,
        });
        const createSchedulerData: SchedulerDashboardUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                resourceType: isChartScheduler(scheduler)
                    ? 'chart'
                    : 'dashboard',
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                resourceId: isChartScheduler(scheduler)
                    ? scheduler.savedChartUuid
                    : scheduler.dashboardUuid,
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                filtersUpdatedNum:
                    isDashboardScheduler(scheduler) && scheduler.filters
                        ? scheduler.filters.length
                        : 0,
            },
        };
        this.analytics.track(createSchedulerData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );
        await this.schedulerClient.generateDailyJobsForScheduler(scheduler);
        return scheduler;
    }

    private async checkCreateScheduledDeliveryAccess(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getById(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
        );
        const dashboard = {
            ...dashboardDao,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
        const { organizationUuid, projectUuid } = dashboard;
        if (
            user.ability.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (user.ability.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return {
            ...dashboard,
            isPrivate: space.isPrivate,
            access: spaceAccess,
        };
    }

    async promoteDashboard(user: SessionUser, dashboardUuid: string) {
        const checkPermissions = async (
            organizationUuid: string,
            projectUuid: string,
            spaceSummary: Omit<SpaceSummary, 'userAccess'> | undefined,
            context: string,
            fromProjectUuid: string, // for analytics
            toProjectUuid?: string, // for analytics
        ) => {
            // If space is undefined, we only check the org/project access, we will create the dashboard in a new accessible space
            const userDontHaveAccess = spaceSummary
                ? user.ability.cannot(
                      'promote',
                      subject('Dashboards', {
                          organizationUuid,
                          projectUuid,
                          isPrivate: spaceSummary.isPrivate,
                          access: await this.spaceModel.getUserSpaceAccess(
                              user.userUuid,
                              spaceSummary.uuid,
                          ),
                      }),
                  )
                : user.ability.cannot(
                      'promote',
                      subject('Dashboards', {
                          organizationUuid,
                          projectUuid,
                      }),
                  ) ||
                  user.ability.cannot(
                      'create',
                      subject('Space', { organizationUuid, projectUuid }),
                  );

            if (userDontHaveAccess) {
                this.analytics.track({
                    event: 'promote.error',
                    userId: user.userUuid,
                    properties: {
                        chartId: dashboardUuid,
                        fromProjectId: fromProjectUuid,
                        toProjectId: toProjectUuid,
                        organizationId: organizationUuid,
                        error: `Permission error on ${context}`,
                    },
                });

                throw new ForbiddenError(
                    `You don't have the right access permissions on ${context} to promote this dashboard.`,
                );
            }
        };

        const promotedDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const { organizationUuid, projectUuid } = promotedDashboard;
        const space = await this.spaceModel.getSpaceSummary(
            promotedDashboard.spaceUuid,
        );
        if (space.isPrivate) {
            throw new ParameterError(
                `We can't promote charts from private spaces`,
            );
        }
        const chartsUuids = promotedDashboard.tiles.reduce<string[]>(
            (acc, tile) => {
                if (isChartTile(tile) && tile.properties.savedChartUuid) {
                    return [...acc, tile.properties.savedChartUuid];
                }
                return acc;
            },
            [],
        );
        const chartPromises = chartsUuids.map((chartUuid) =>
            this.savedChartModel.get(chartUuid),
        );
        const charts = await Promise.all(chartPromises);

        const chartsWithinDashboards = charts.filter(
            (chart) => chart.dashboardUuid !== null,
        );
        // TODO also prmote charts within dashboards

        await checkPermissions(
            organizationUuid,
            projectUuid,
            space,
            'this dashboard and project',
            projectUuid,
            undefined,
        );

        const { upstreamProjectUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (!upstreamProjectUuid)
            throw new NotFoundError(
                'This chart does not have an upstream project',
            );

        const existingUpstreamDashboards = await this.dashboardModel.find({
            projectUuid: upstreamProjectUuid,
            slug: promotedDashboard.slug,
        });

        if (existingUpstreamDashboards.length === 0) {
            // There are no dashboards with the same slug, we create the chart, and the space if needed
            // We only check the org/project access
            await checkPermissions(
                organizationUuid,
                upstreamProjectUuid,
                undefined,
                'the upstream project',
                projectUuid,
                upstreamProjectUuid,
            );

            let newSpaceUuid: string;
            const existingSpace = await this.spaceModel.find({
                projectUuid: upstreamProjectUuid,
                slug: space.slug,
            });
            if (existingSpace.length === 0) {
                // We have 0 or more than 1 space with the same slug
                await checkPermissions(
                    organizationUuid,
                    upstreamProjectUuid,
                    undefined, // we also check here if user can create spaces in the upstream project
                    'the upstream project',
                    projectUuid,
                    upstreamProjectUuid,
                );
                // We create a new space
                const newSpace = await this.spaceModel.createSpace(
                    upstreamProjectUuid,
                    space.name,
                    user.userId,
                    space.isPrivate,
                    space.slug,
                );
                newSpaceUuid = newSpace.uuid;
            } else if (existingSpace.length === 1) {
                // We have an existing space with the same slug
                await checkPermissions(
                    organizationUuid,
                    upstreamProjectUuid,
                    existingSpace[0],
                    'the upstream space and project',
                    projectUuid,
                    upstreamProjectUuid,
                );
                newSpaceUuid = existingSpace[0].uuid;
            } else {
                // Multiple spaces with the same slug
                throw new AlreadyExistsError(
                    `There are multiple spaces with the same identifier ${space.slug}`,
                );
            }

            // Create new dashboard
            const newDashboardData: CreateDashboard & {
                slug: string;
            } = {
                ...promotedDashboard,
                spaceUuid: newSpaceUuid,
                slug: promotedDashboard.slug,
            };
            const newDashboard = await this.dashboardModel.create(
                newSpaceUuid,
                newDashboardData,
                user,
                upstreamProjectUuid,
            );

            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    dashboardId: newDashboard.uuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: newDashboard.slug,
                    hasExistingContent: false,
                    withNewSpace: existingSpace.length !== 1,
                },
            });

            return newDashboard;
        }
        if (existingUpstreamDashboards.length === 1) {
            // We override existing dashboard details
            const upstreamDashboard = existingUpstreamDashboards[0];
            const upstreamSpace = await this.spaceModel.getSpaceSummary(
                upstreamDashboard.spaceUuid,
            );

            await checkPermissions(
                organizationUuid,
                upstreamProjectUuid,
                upstreamSpace,
                'the upstream chart and project',
                projectUuid,
                upstreamProjectUuid,
            );

            if (
                upstreamDashboard.name !== promotedDashboard.name ||
                upstreamDashboard.description !== promotedDashboard.description
            ) {
                // We also update dashboard name and description if they have changed
                await this.savedChartModel.update(upstreamDashboard.uuid, {
                    name: promotedDashboard.name,
                    description: promotedDashboard.description,
                });
            }

            const updatedChart = await this.dashboardModel.addVersion(
                upstreamDashboard.uuid,
                promotedDashboard,
                user,
                projectUuid,
            );
            this.analytics.track({
                event: 'promote.execute',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedChart.uuid,
                    fromProjectId: projectUuid,
                    toProjectId: upstreamProjectUuid,
                    organizationId: organizationUuid,
                    slug: promotedDashboard.slug,
                    hasExistingContent: true,
                },
            });

            return updatedChart;
        }

        this.analytics.track({
            event: 'promote.error',
            userId: user.userUuid,
            properties: {
                dashboardId: promotedDashboard.uuid,
                fromProjectId: projectUuid,
                toProjectId: upstreamProjectUuid,
                organizationId: organizationUuid,
                slug: promotedDashboard.slug,
                error: `There are multiple dashboards with the same identifier`,
            },
        });
        // Multiple charts with the same slug
        throw new AlreadyExistsError(
            `There are multiple dashboards with the same identifier ${promotedDashboard.slug}`,
        );
    }
}
