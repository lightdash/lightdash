import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    CreateDashboard,
    CreateDashboardWithCharts,
    CreateSavedChart,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardDAO,
    DashboardTab,
    DashboardTileTypes,
    DashboardVersionedFields,
    ExploreType,
    FeatureFlags,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
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
    type DashboardHistory,
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
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { createTwoColumnTiles } from '../../utils/dashboardTileUtils';
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
    savedChartService: SavedChartService;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    catalogModel: CatalogModel;
    featureFlagModel: FeatureFlagModel;
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

    savedChartService: SavedChartService;

    catalogModel: CatalogModel;

    projectModel: ProjectModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    featureFlagModel: FeatureFlagModel;

    constructor({
        analytics,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        savedChartModel,
        savedChartService,
        schedulerClient,
        slackClient,
        projectModel,
        catalogModel,
        featureFlagModel,
    }: DashboardServiceArguments) {
        super();
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.savedChartModel = savedChartModel;
        this.savedChartService = savedChartService;
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
        this.featureFlagModel = featureFlagModel;
    }

    private async getNestedPermissionsFlag(user: SessionUser) {
        return this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
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
            parametersCount: Object.keys(dashboard.parameters || {}).length,
        };
    }

    private async deleteOrphanedChartsInDashboards(
        user: SessionUser,
        dashboardUuid: string,
    ) {
        const orphanedCharts =
            await this.dashboardModel.getOrphanedCharts(dashboardUuid);

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

    /**
     * Duplicates a chart that belongs to a dashboard.
     * Used when duplicating dashboards or duplicating tabs with dashboard charts.
     */
    private async duplicateChartForDashboard({
        chartUuid,
        projectUuid,
        dashboardUuid,
        user,
    }: {
        chartUuid: string;
        projectUuid: string;
        dashboardUuid: string;
        user: SessionUser;
    }): Promise<string> {
        const chartToDuplicate = await this.savedChartModel.get(chartUuid);
        if (!chartToDuplicate.dashboardUuid) {
            throw new ParameterError(
                'We cannot duplicate a chart that is not part of a dashboard',
            );
        }
        const duplicatedChart = await this.savedChartModel.create(
            projectUuid,
            user.userUuid,
            {
                ...chartToDuplicate,
                spaceUuid: null,
                dashboardUuid,
                updatedByUser: {
                    userUuid: user.userUuid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
                slug: generateSlug(`${chartToDuplicate.name} ${Date.now()}`),
            },
        );

        // Update catalog field usage for the new chart
        const cachedExplore = await this.projectModel.getExploreFromCache(
            projectUuid,
            duplicatedChart.tableName,
        );
        try {
            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: {
                    metrics: [],
                    dimensions: [],
                },
                newChartFields: {
                    metrics: duplicatedChart.metricQuery.metrics,
                    dimensions: duplicatedChart.metricQuery.dimensions,
                },
            });
        } catch (error) {
            this.logger.error(
                `Error updating chart field usage for duplicated chart ${duplicatedChart.uuid}`,
                error,
            );
        }

        this.analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties: {
                ...SavedChartService.getCreateEventProperties(duplicatedChart),
                dashboardId: duplicatedChart.dashboardUuid ?? undefined,
                duplicated: true,
                virtualViewId:
                    cachedExplore?.type === ExploreType.VIRTUAL
                        ? cachedExplore.name
                        : undefined,
            },
        });

        return duplicatedChart.uuid;
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

        const nestedPermissionsFlag = await this.featureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                organizationName: user.organizationName,
            },
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });

        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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

    async getByIdOrSlug(
        user: SessionUser,
        dashboardUuidOrSlug: string,
    ): Promise<Dashboard> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);

        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
                parametersCount: Object.keys(dashboard.parameters || {}).length,
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

        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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

        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
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
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
                        const newChartUuid =
                            await this.duplicateChartForDashboard({
                                chartUuid: tile.properties.savedChartUuid,
                                projectUuid: newDashboard.projectUuid,
                                dashboardUuid: newDashboard.uuid,
                                user,
                            });

                        return {
                            ...tile,
                            uuid: uuidv4(),
                            properties: {
                                ...tile.properties,
                                savedChartUuid: newChartUuid,
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

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
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
        dashboardUuidOrSlug: string,
        dashboard: UpdateDashboard,
    ): Promise<Dashboard> {
        const existingDashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);

        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const canUpdateDashboardInCurrentSpace = user.ability.can(
            'update',
            subject('Dashboard', {
                ...(await this.spaceModel.getSpaceSummary(
                    existingDashboardDao.spaceUuid,
                )),
                access: await this.spaceModel.getUserSpaceAccess(
                    user.userUuid,
                    existingDashboardDao.spaceUuid,
                    { useInheritedAccess: nestedPermissionsFlag.enabled },
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
                            {
                                useInheritedAccess:
                                    nestedPermissionsFlag.enabled,
                            },
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
                existingDashboardDao.uuid,
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

            // Handle chart duplication for dashboard charts that appear multiple times
            // This happens when duplicating a dashboard tab with charts saved directly to the dashboard
            // We detect duplicates by finding chart UUIDs that appear more than once
            // Step 1: Count occurrences of each chart UUID for dashboard charts
            const chartUuidOccurrences = new Map<string, number>();
            dashboard.tiles.forEach((tile) => {
                if (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard &&
                    tile.properties.savedChartUuid
                ) {
                    const chartUuid = tile.properties.savedChartUuid;
                    chartUuidOccurrences.set(
                        chartUuid,
                        (chartUuidOccurrences.get(chartUuid) ?? 0) + 1,
                    );
                }
            });

            // Step 2: Find chart UUIDs that need duplication (appear more than once)
            const chartUuidsToDuplicate = new Set(
                [...chartUuidOccurrences.entries()]
                    .filter(([, count]) => count > 1)
                    .map(([uuid]) => uuid),
            );

            // Step 3: Create duplicated charts for all tiles that need them (except the first occurrence)
            const seenChartUuids = new Set<string>();
            const chartDuplicationPromises: Promise<{
                tileIndex: number;
                newChartUuid: string;
            }>[] = [];

            dashboard.tiles.forEach((tile, index) => {
                if (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard &&
                    tile.properties.savedChartUuid &&
                    chartUuidsToDuplicate.has(tile.properties.savedChartUuid)
                ) {
                    const chartUuid = tile.properties.savedChartUuid;
                    if (seenChartUuids.has(chartUuid)) {
                        // This is a subsequent occurrence - needs duplication
                        chartDuplicationPromises.push(
                            this.duplicateChartForDashboard({
                                chartUuid,
                                projectUuid: existingDashboardDao.projectUuid,
                                dashboardUuid: existingDashboardDao.uuid,
                                user,
                            }).then((newChartUuid) => ({
                                tileIndex: index,
                                newChartUuid,
                            })),
                        );
                    } else {
                        // First occurrence - keep the original
                        seenChartUuids.add(chartUuid);
                    }
                }
            });

            // Step 4: Wait for all duplications and build the final tiles array
            const duplicatedCharts = await Promise.all(
                chartDuplicationPromises,
            );
            const duplicatedChartsByTileIndex = new Map(
                duplicatedCharts.map((d) => [d.tileIndex, d.newChartUuid]),
            );

            const tilesToSave = dashboard.tiles.map((tile, index) => {
                const newChartUuid = duplicatedChartsByTileIndex.get(index);
                if (
                    newChartUuid &&
                    tile.type === DashboardTileTypes.SAVED_CHART
                ) {
                    return {
                        ...tile,
                        properties: {
                            ...tile.properties,
                            savedChartUuid: newChartUuid,
                        },
                    };
                }
                return tile;
            });

            const updatedDashboard = await this.dashboardModel.addVersion(
                existingDashboardDao.uuid,
                {
                    tiles: tilesToSave,
                    filters: dashboard.filters,
                    parameters: dashboard.parameters,
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
            await this.deleteOrphanedChartsInDashboards(
                user,
                existingDashboardDao.uuid,
            );
        }

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            existingDashboardDao.uuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            updatedNewDashboard.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            updatedNewDashboard.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
        const existingDashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            existingDashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            existingDashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const userHasAccessToDashboards = await Promise.all(
            dashboards.map(async (dashboardToUpdate) => {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
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
                            {
                                useInheritedAccess:
                                    nestedPermissionsFlag.enabled,
                            },
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
                            {
                                useInheritedAccess:
                                    nestedPermissionsFlag.enabled,
                            },
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
                        { useInheritedAccess: nestedPermissionsFlag.enabled },
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
        const dashboardToDelete =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const { organizationUuid, projectUuid, spaceUuid, tiles } =
            dashboardToDelete;
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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

        const deletedDashboard =
            await this.dashboardModel.delete(dashboardUuid);

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
        searchQuery?: string,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SchedulerAndTargets[]>> {
        const dashboard = await this.checkCreateScheduledDeliveryAccess(
            user,
            dashboardUuid,
        );
        return this.schedulerModel.getSchedulers({
            projectUuid: dashboard.projectUuid,
            paginateArgs,
            searchQuery,
            filters: {
                resourceType: 'dashboard',
                resourceUuids: [dashboardUuid],
            },
        });
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

        if (!newScheduler.targets || !Array.isArray(newScheduler.targets)) {
            throw new ParameterError(
                'Targets is required and must be an array',
            );
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
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            resource.dashboardUuid,
        );
        const space = await this.spaceModel.getSpaceSummary(
            dashboard.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(
            actor.user,
        );
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            dashboard.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
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
                { useInheritedAccess: nestedPermissionsFlag.enabled },
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

    async getHistory(
        user: SessionUser,
        dashboardUuid: string,
    ): Promise<DashboardHistory> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to view the version history of this dashboard",
            );
        }

        const versions =
            await this.dashboardModel.getLatestVersionSummaries(dashboardUuid);

        this.analytics.track({
            event: 'dashboard_history.view',
            userId: user.userUuid,
            properties: {
                projectId: dashboardDao.projectUuid,
                dashboardId: dashboardDao.uuid,
                versionCount: versions.length,
            },
        });

        return { history: versions };
    }

    async rollback(
        user: SessionUser,
        dashboardUuid: string,
        versionUuid: string,
    ): Promise<void> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuid);
        const space = await this.spaceModel.getSpaceSummary(
            dashboardDao.spaceUuid,
        );
        const nestedPermissionsFlag = await this.getNestedPermissionsFlag(user);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            dashboardDao.spaceUuid,
            { useInheritedAccess: nestedPermissionsFlag.enabled },
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    isPrivate: space.isPrivate,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to rollback this dashboard",
            );
        }

        const targetVersion = await this.dashboardModel.getVersionByUuid(
            dashboardUuid,
            versionUuid,
        );

        if (!targetVersion) {
            throw new NotFoundError('Dashboard version not found');
        }

        await this.dashboardModel.addVersion(
            dashboardUuid,
            {
                tiles: targetVersion.tiles,
                filters: targetVersion.filters,
                parameters: targetVersion.parameters,
                tabs: targetVersion.tabs,
                config: targetVersion.config,
            },
            user,
            dashboardDao.projectUuid,
        );

        this.analytics.track({
            event: 'dashboard_version.rollback',
            userId: user.userUuid,
            properties: {
                projectId: dashboardDao.projectUuid,
                dashboardId: dashboardDao.uuid,
                versionId: versionUuid,
            },
        });
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

    async createDashboardWithCharts(
        user: SessionUser,
        projectUuid: string,
        data: CreateDashboardWithCharts,
    ): Promise<Dashboard> {
        // 1. Create empty dashboard
        const emptyDashboard: CreateDashboard = {
            name: data.name,
            description: data.description,
            spaceUuid: data.spaceUuid,
            tiles: [],
            tabs: [],
        };

        // Permissions are checked in the create method
        const dashboard = await this.create(user, projectUuid, emptyDashboard);

        try {
            const chartPromises = data.charts.map(
                (chartData: CreateSavedChart) => {
                    const chartDataWithDashboard: CreateSavedChart = {
                        ...chartData,
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: undefined,
                    };

                    return this.savedChartService.create(
                        user,
                        projectUuid,
                        chartDataWithDashboard,
                    );
                },
            );

            const savedCharts = await Promise.all(chartPromises);

            const tiles = createTwoColumnTiles(
                savedCharts,
                dashboard.tabs?.[0]?.uuid,
            );

            const updateFields: DashboardVersionedFields = {
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tiles,
                tabs: dashboard.tabs || [],
            };

            await this.update(user, dashboard.uuid, updateFields);

            return await this.getByIdOrSlug(user, dashboard.uuid);
        } catch (error) {
            try {
                await this.delete(user, dashboard.uuid);
            } catch (deleteError) {
                this.logger.error(
                    'Failed to cleanup dashboard after creation error',
                    deleteError,
                );
            }
            throw error;
        }
    }
}
