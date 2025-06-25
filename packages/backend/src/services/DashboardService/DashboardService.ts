import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    CreateDashboard,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardDAO,
    DashboardTab,
    DashboardTileTypes,
    ExploreType,
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    TogglePinnedItemInfo,
    UpdateDashboard,
    UpdateMultipleDashboards,
    generateSlug,
    hasChartsInDashboard,
    isChartScheduler,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    type ChartFieldUpdates,
    type DashboardBasicDetailsWithTileTypes,
    type DuplicateDashboardParams,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { type Knex } from 'knex';
import { uniq } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import {
    CreateDashboardOrVersionEvent,
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartFieldUsageChanges } from '../../models/CatalogModel/utils';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';

type DashboardServiceArguments = {
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    savedChartModel: SavedChartModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    catalogModel: CatalogModel;
};

export class DashboardService
    extends BaseService
    implements BulkActionable<Knex>
{
    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    savedChartModel: SavedChartModel;

    catalogModel: CatalogModel;

    projectModel: ProjectModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    constructor({
        analytics,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        savedChartModel,
        schedulerClient,
        slackClient,
        projectModel,
        catalogModel,
    }: DashboardServiceArguments) {
        super();
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.savedChartModel = savedChartModel;
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
    }

    static getCreateEventProperties(
        dashboard: DashboardDAO,
    ): CreateDashboardOrVersionEvent['properties'] {
        return {
            title: dashboard.name,
            description: dashboard.description,

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
            sqlChartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SQL_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
            tabsCount: dashboard.tabs.length,
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
    ): Promise<DashboardBasicDetailsWithTileTypes[]> {
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );
        return dashboards.filter((dashboard) => {
            const dashboardSpace = spaces.find(
                (space) => space.uuid === dashboard.spaceUuid,
            );
            const hasAbility = user.ability.can(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboardSpace?.organizationUuid,
                    projectUuid: dashboardSpace?.projectUuid,
                    isPrivate: dashboardSpace?.isPrivate,
                    access: spacesAccess[dashboard.spaceUuid] ?? [],
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

        // TODO: normally this would be pre-constructed (perhaps in the Service Repository or on the user object when we create the CASL type)
        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        if (auditedAbility.cannot('view', subject('Dashboard', dashboard))) {
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
                isDashboardChartTileType(tile) &&
                !!tile.properties.belongsToDashboard &&
                !!tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
    }

    private async updateChartFieldUsage(
        projectUuid: string,
        chartExplore: Explore | ExploreError,
        chartFields: ChartFieldUpdates,
    ) {
        const fieldUsageChanges = await getChartFieldUsageChanges(
            projectUuid,
            chartExplore,
            chartFields,
            this.catalogModel.findTablesCachedExploreUuid.bind(
                this.catalogModel,
            ),
        );

        await this.catalogModel.updateFieldsChartUsage(
            projectUuid,
            fieldUsageChanges,
        );
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
        data: DuplicateDashboardParams,
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

        const newTabsMap = dashboard.tabs.map((tab) => ({
            uuid: tab.uuid,
            newUuid: uuidv4(), // generate new uuid for copied tabs
        }));

        const newTabs: DashboardTab[] = dashboard.tabs.map((tab) => ({
            ...tab,
            uuid: newTabsMap.find((tabMap) => tabMap.uuid === tab.uuid)
                ?.newUuid!,
        }));

        const duplicatedDashboard = {
            ...dashboard,
            tiles: dashboard.tiles.map((tile) => ({
                ...tile,
                tabUuid: newTabsMap.find((tab) => tab.uuid === tile.tabUuid)
                    ?.newUuid!,
            })),
            description: data.dashboardDesc,
            name: data.dashboardName,
            slug: generateSlug(dashboard.name),
            tabs: newTabs,
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
                        isDashboardChartTileType(tile) &&
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
                                    slug: generateSlug(
                                        `${
                                            chartInDashboard.name
                                        } ${Date.now()}`,
                                    ),
                                },
                            );
                        const cachedExplore =
                            await this.projectModel.getExploreFromCache(
                                projectUuid,
                                duplicatedChart.tableName,
                            );

                        try {
                            await this.updateChartFieldUsage(
                                projectUuid,
                                cachedExplore,
                                {
                                    oldChartFields: {
                                        metrics: [],
                                        dimensions: [],
                                    },
                                    newChartFields: {
                                        metrics:
                                            duplicatedChart.metricQuery.metrics,
                                        dimensions:
                                            duplicatedChart.metricQuery
                                                .dimensions,
                                    },
                                },
                            );
                        } catch (error) {
                            this.logger.error(
                                `Error updating chart field usage for chart ${duplicatedChart.uuid}`,
                                error,
                            );
                        }

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
                                virtualViewId:
                                    cachedExplore?.type === ExploreType.VIRTUAL
                                        ? cachedExplore.name
                                        : undefined,
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
                    tabs: newTabs,
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
            const dashboardTileTypes = Array.from(
                new Set(dashboard.tiles.map((t) => t.type)),
            );

            const updatedDashboard = await this.dashboardModel.addVersion(
                dashboardUuid,
                {
                    tiles: dashboard.tiles,
                    filters: dashboard.filters,
                    tabs: dashboard.tabs || [],
                    config: dashboard.config,
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
    ): Promise<TogglePinnedItemInfo> {
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

        return {
            projectUuid,
            spaceUuid,
            pinnedListUuid: pinnedList.pinnedListUuid,
            isPinned: !!pinnedList.items.find(
                (item) => item.dashboardUuid === dashboardUuid,
            ),
        };
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
        const dashboardToDelete = await this.dashboardModel.getById(
            dashboardUuid,
        );
        const { organizationUuid, projectUuid, spaceUuid, tiles } =
            dashboardToDelete;
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

        if (hasChartsInDashboard(dashboardToDelete)) {
            try {
                await Promise.all(
                    tiles.map(async (tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.belongsToDashboard &&
                            tile.properties.savedChartUuid
                        ) {
                            const chartInDashboard =
                                await this.savedChartModel.get(
                                    tile.properties.savedChartUuid,
                                );

                            const cachedExplore =
                                await this.projectModel.getExploreFromCache(
                                    projectUuid,
                                    chartInDashboard.tableName,
                                );

                            await this.updateChartFieldUsage(
                                projectUuid,
                                cachedExplore,
                                {
                                    oldChartFields: {
                                        metrics:
                                            chartInDashboard.metricQuery
                                                .metrics,
                                        dimensions:
                                            chartInDashboard.metricQuery
                                                .dimensions,
                                    },
                                    newChartFields: {
                                        metrics: [],
                                        dimensions: [],
                                    },
                                },
                            );
                        }
                    }),
                );
            } catch (error) {
                this.logger.error(
                    `Error updating chart field usage for dashboard ${dashboardUuid}`,
                    error,
                );
            }
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

        if (!isValidFrequency(newScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }

        if (!isValidTimezone(newScheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
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
                timeZone: scheduler.timezone,
                includeLinks: scheduler.includeLinks,
            },
        };
        this.analytics.track(createSchedulerData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        const { schedulerTimezone: defaultTimezone } =
            await this.projectModel.get(projectUuid);

        await this.schedulerClient.generateDailyJobsForScheduler(
            scheduler,
            {
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
            },
            defaultTimezone,
        );
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

    private async hasAccess(
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: string;
        },
        resource: {
            dashboardUuid: string;
            spaceUuid?: string;
        },
    ) {
        const dashboard = await this.dashboardModel.getById(
            resource.dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            dashboard.spaceUuid,
        );

        const isActorAllowedToPerformAction = actor.user.ability.can(
            action,
            subject('Dashboard', {
                organizationUuid: actor.user.organizationUuid,
                projectUuid: actor.projectUuid,
                isPrivate: space.isPrivate,
                access: spaceAccess,
            }),
        );

        if (!isActorAllowedToPerformAction) {
            throw new ForbiddenError(
                `You don't have access to ${action} this dashboard`,
            );
        }

        if (resource.spaceUuid && dashboard.spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                resource.spaceUuid,
            );
            const newSpaceAccess = await this.spaceModel.getUserSpaceAccess(
                actor.user.userUuid,
                resource.spaceUuid,
            );

            const isActorAllowedToPerformActionInNewSpace =
                actor.user.ability.can(
                    action,
                    subject('Dashboard', {
                        organizationUuid: newSpace.organizationUuid,
                        projectUuid: actor.projectUuid,
                        isPrivate: newSpace.isPrivate,
                        access: newSpaceAccess,
                    }),
                );

            if (!isActorAllowedToPerformActionInNewSpace) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this dashboard in the new space`,
                );
            }
        }
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: dashboardUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ) {
        if (!targetSpaceUuid) {
            throw new ParameterError(
                'You cannot move a dashboard outside of a space',
            );
        }

        if (checkForAccess) {
            await this.hasAccess(
                'update',
                { user, projectUuid },
                { dashboardUuid, spaceUuid: targetSpaceUuid },
            );
        }
        await this.dashboardModel.moveToSpace(
            {
                projectUuid,
                itemUuid: dashboardUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'dashboard.moved',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    dashboardId: dashboardUuid,
                    targetSpaceId: targetSpaceUuid,
                },
            });
        }
    }
}
