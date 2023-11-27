import { subject } from '@casl/ability';
import {
    CreateDashboard,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    ForbiddenError,
    hasChartsInDashboard,
    isChartScheduler,
    isChartTile,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    SpaceSummary,
    UpdateDashboard,
    UpdateMultipleDashboards,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import cronstrue from 'cronstrue';
import { v4 as uuidv4 } from 'uuid';
import { analytics } from '../../analytics/client';
import {
    CreateDashboardOrVersionEvent,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { schedulerClient, slackClient } from '../../clients/clients';
import database from '../../database/database';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { getFirstAccessibleSpace } from '../../database/entities/spaces';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type Dependencies = {
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    savedChartModel: SavedChartModel;
};

export class DashboardService {
    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    savedChartModel: SavedChartModel;

    constructor({
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        savedChartModel,
    }: Dependencies) {
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.savedChartModel = savedChartModel;
    }

    static getCreateEventProperties(
        dashboard: Dashboard,
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
                analytics.track({
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

    async hasDashboardSpaceAccess(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<boolean> {
        let space: SpaceSummary;

        try {
            space = await this.spaceModel.getSpaceSummary(spaceUuid);
        } catch (e) {
            Sentry.captureException(e);
            console.error(e);
            return false;
        }

        return hasSpaceAccess(user, space);
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
        return dashboards.filter((dashboard) => {
            const hasAbility = user.ability.can(
                'view',
                subject('Dashboard', dashboard),
            );
            const dashboardSpace = spaces.find(
                (space) => space.uuid === dashboard.spaceUuid,
            );
            return (
                hasAbility &&
                dashboardSpace &&
                hasSpaceAccess(user, dashboardSpace, includePrivate)
            );
        });
    }

    async getById(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        if (user.ability.cannot('view', subject('Dashboard', dashboard))) {
            throw new ForbiddenError();
        }
        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.analyticsModel.addDashboardViewEvent(
            dashboard.uuid,
            user.userUuid,
        );
        analytics.track({
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
            const space = await getFirstAccessibleSpace(
                database,
                projectUuid,
                user.userUuid,
            );
            return {
                organizationUuid: space.organization_uuid,
                uuid: space.space_uuid,
            };
        };
        const space = dashboard.spaceUuid
            ? await this.spaceModel.get(dashboard.spaceUuid)
            : await getFirstSpace();

        if (
            user.ability.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!(await this.hasDashboardSpaceAccess(user, space.uuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            dashboard,
            user,
            projectUuid,
        );
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });

        return this.dashboardModel.getById(newDashboard.uuid);
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);

        if (user.ability.cannot('create', subject('Dashboard', dashboard))) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const duplicatedDashboard = {
            ...dashboard,
            name: `Copy of ${dashboard.name}`,
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
                                },
                            );
                        analytics.track({
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
                },
                user,
                projectUuid,
            );
        }

        const dashboardProperties =
            DashboardService.getCreateEventProperties(newDashboard);
        analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: { ...dashboardProperties, duplicated: true },
        });

        analytics.track({
            event: 'duplicated_dashboard_created',
            userId: user.userUuid,
            properties: {
                ...dashboardProperties,
                newDashboardId: newDashboard.uuid,
                duplicateOfDashboardId: dashboard.uuid,
            },
        });

        return this.dashboardModel.getById(newDashboard.uuid);
    }

    async update(
        user: SessionUser,
        dashboardUuid: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        const existingDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Dashboard', existingDashboard),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            !(await this.hasDashboardSpaceAccess(
                user,
                existingDashboard.spaceUuid,
            ))
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (isDashboardUnversionedFields(dashboard)) {
            const updatedDashboard = await this.dashboardModel.update(
                dashboardUuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
                },
            );

            analytics.track({
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
                },
                user,
                existingDashboard.projectUuid,
            );
            analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
            await this.deleteOrphanedChartsInDashboards(user, dashboardUuid);
        }
        return this.dashboardModel.getById(dashboardUuid);
    }

    async togglePinning(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const existingDashboard = await this.dashboardModel.getById(
            dashboardUuid,
        );
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

        if (!(await this.hasDashboardSpaceAccess(user, spaceUuid))) {
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

        analytics.track({
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
        const space = await getFirstAccessibleSpace(
            database,
            projectUuid,
            user.userUuid,
        );

        if (
            user.ability.cannot(
                'update',
                subject('Dashboard', {
                    organizationUuid: space.organization_uuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, space.space_uuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        analytics.track({
            event: 'dashboard.updated_multiple',
            userId: user.userUuid,
            properties: {
                dashboardIds: dashboards.map((dashboard) => dashboard.uuid),
                projectId: projectUuid,
            },
        });
        return this.dashboardModel.updateMultiple(projectUuid, dashboards);
    }

    async delete(user: SessionUser, dashboardUuid: string): Promise<void> {
        const { organizationUuid, projectUuid, spaceUuid } =
            await this.dashboardModel.getById(dashboardUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!(await this.hasDashboardSpaceAccess(user, spaceUuid))) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        const deletedDashboard = await this.dashboardModel.delete(
            dashboardUuid,
        );
        analytics.track({
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
        await this.checkUpdateAccess(user, dashboardUuid);
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
        const { projectUuid, organizationUuid } = await this.checkUpdateAccess(
            user,
            dashboardUuid,
        );
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
        analytics.track(createSchedulerData);

        await slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );
        await schedulerClient.generateDailyJobsForScheduler(scheduler);
        return scheduler;
    }

    private async checkUpdateAccess(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<Dashboard> {
        const dashboard = await this.dashboardModel.getById(dashboardUuid);
        const { organizationUuid, projectUuid } = dashboard;
        if (
            user.ability.cannot(
                'update',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!(await this.hasDashboardSpaceAccess(user, dashboard.spaceUuid))) {
            throw new ForbiddenError();
        }

        return dashboard;
    }
}
