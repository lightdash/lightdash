import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    ContentType,
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
    ForbiddenError,
    generateSlug,
    getSchedulerResourceTypeAndId,
    hasChartsInDashboard,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
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
    type ChartFieldUpdates,
    type ChartVersionDifference,
    type ChartVersionSummary,
    type ContentVerificationInfo,
    type DashboardBasicDetailsWithTileTypes,
    type DashboardHistory,
    type DashboardTileTarget,
    type DashboardVersion,
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
import { LightdashConfig } from '../../config/parseConfig';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
// CaslAuditWrapper is now used via this.createAuditedAbility() from BaseService
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartFieldUsageChanges } from '../../models/CatalogModel/utils';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { createTwoColumnTiles } from '../../utils/dashboardTileUtils';
import { BaseService } from '../BaseService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import type {
    SoftDeletableService,
    SoftDeleteOptions,
} from '../SoftDeletableService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';

type DashboardServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    schedulerService: SchedulerService;
    savedChartModel: SavedChartModel;
    savedChartService: SavedChartService;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    catalogModel: CatalogModel;
    organizationModel: OrganizationModel;
    spacePermissionService: SpacePermissionService;
    contentVerificationModel: ContentVerificationModel;
};

export class DashboardService
    extends BaseService
    implements BulkActionable<Knex>, SoftDeletableService
{
    private lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    schedulerService: SchedulerService;

    savedChartModel: SavedChartModel;

    savedChartService: SavedChartService;

    catalogModel: CatalogModel;

    projectModel: ProjectModel;

    organizationModel: OrganizationModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel;

    constructor({
        lightdashConfig,
        analytics,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        schedulerService,
        savedChartModel,
        savedChartService,
        schedulerClient,
        slackClient,
        projectModel,
        catalogModel,
        organizationModel,
        spacePermissionService,
        contentVerificationModel,
    }: DashboardServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.schedulerService = schedulerService;
        this.savedChartModel = savedChartModel;
        this.savedChartService = savedChartService;
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.organizationModel = organizationModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
    }

    async verifyDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: string,
    ): Promise<ContentVerificationInfo> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { organizationUuid, projectUuid } = dashboard;

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError('Only admins can verify dashboards');
        }

        await this.contentVerificationModel.verify(
            ContentType.DASHBOARD,
            dashboard.uuid,
            projectUuid,
            user.userUuid,
        );

        const verification = await this.contentVerificationModel.getByContent(
            ContentType.DASHBOARD,
            dashboard.uuid,
        );

        if (!verification) {
            throw new Error('Failed to verify dashboard');
        }

        this.analytics.track({
            event: 'content_verification.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DASHBOARD,
                contentId: dashboard.uuid,
            },
        });

        return verification;
    }

    async unverifyDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: string,
    ): Promise<void> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { organizationUuid, projectUuid } = dashboard;

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'Only admins can remove dashboard verification',
            );
        }

        await this.contentVerificationModel.unverify(
            ContentType.DASHBOARD,
            dashboard.uuid,
        );

        this.analytics.track({
            event: 'content_verification.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DASHBOARD,
                contentId: dashboard.uuid,
            },
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
                const deletedChart = await this.savedChartModel.permanentDelete(
                    chart.uuid,
                );
                this.analytics.track({
                    event: 'saved_chart.deleted',
                    userId: user.userUuid,
                    properties: {
                        savedQueryId: deletedChart.uuid,
                        projectId: deletedChart.projectUuid,
                        softDelete: false,
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

        // Best effort: the chart has already been duplicated at this point, so
        // missing explore metadata should not fail the parent dashboard copy.
        let cachedExplore: Explore | ExploreError | undefined;
        try {
            cachedExplore = await this.projectModel.getExploreFromCache(
                projectUuid,
                duplicatedChart.tableName,
            );
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
            this.logger.warn(
                `Skipping duplicated chart enrichment for chart ${duplicatedChart.uuid}`,
                {
                    error,
                    projectUuid,
                    tableName: duplicatedChart.tableName,
                },
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
        const spaceContexts =
            await this.spacePermissionService.getSpacesAccessContext(
                user.userUuid,
                spaceUuids,
            );

        const auditedAbility = this.createAuditedAbility(user);
        return dashboards.filter((dashboard) => {
            const spaceContext = spaceContexts[dashboard.spaceUuid];
            if (!spaceContext) return false;
            const hasAbility = auditedAbility.can(
                'view',
                subject('Dashboard', {
                    ...spaceContext,
                    metadata: { dashboardUuid: dashboard.uuid },
                }),
            );
            return includePrivate
                ? hasAbility
                : hasAbility && hasDirectAccessToSpace(user, spaceContext);
        });
    }

    async getByIdOrSlug(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
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
        const resolvedSpaceUuid =
            dashboard.spaceUuid ??
            (await this.spacePermissionService.getFirstViewableSpaceUuid(
                user,
                projectUuid,
            ));
        const space = await this.spaceModel.get(resolvedSpaceUuid);

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                space.uuid,
            );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
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
            inheritsFromOrgOrProject,
            access,
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
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
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
            const tileUuidMap = new Map<string, string>();

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

                        const newTileUuid = uuidv4();
                        tileUuidMap.set(tile.uuid, newTileUuid);

                        return {
                            ...tile,
                            uuid: newTileUuid,
                            properties: {
                                ...tile.properties,
                                savedChartUuid: newChartUuid,
                            },
                        };
                    }
                    return tile;
                }),
            );

            const remapTileTargets = (
                tileTargets: Record<string, DashboardTileTarget> | undefined,
            ): Record<string, DashboardTileTarget> | undefined => {
                if (!tileTargets) return undefined;
                return Object.fromEntries(
                    Object.entries(tileTargets).map(([key, value]) => [
                        tileUuidMap.get(key) ?? key,
                        value,
                    ]),
                );
            };

            const remappedFilters: typeof newDashboard.filters = {
                dimensions: newDashboard.filters.dimensions.map((filter) => ({
                    ...filter,
                    tileTargets: remapTileTargets(filter.tileTargets),
                })),
                metrics: newDashboard.filters.metrics.map((filter) => ({
                    ...filter,
                    tileTargets: remapTileTargets(filter.tileTargets),
                })),
                tableCalculations: newDashboard.filters.tableCalculations.map(
                    (filter) => ({
                        ...filter,
                        tileTargets: remapTileTargets(filter.tileTargets),
                    }),
                ),
            };

            await this.dashboardModel.addVersion(
                newDashboard.uuid,
                {
                    tiles: [...updatedTiles],
                    filters: remappedFilters,
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
            inheritsFromOrgOrProject,
            access,
        };
    }

    async update(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        dashboard: UpdateDashboard,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const existingDashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );

        const currentSpace =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                existingDashboardDao.spaceUuid,
            );
        const auditedAbility = this.createAuditedAbility(user);
        const canUpdateDashboardInCurrentSpace = auditedAbility.can(
            'update',
            subject('Dashboard', {
                ...currentSpace,
                metadata: { dashboardUuid: existingDashboardDao.uuid },
            }),
        );

        if (!canUpdateDashboardInCurrentSpace) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (isDashboardUnversionedFields(dashboard)) {
            if (dashboard.spaceUuid) {
                const newSpace =
                    await this.spacePermissionService.getSpaceAccessContext(
                        user.userUuid,
                        dashboard.spaceUuid,
                    );
                const canUpdateDashboardInNewSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...newSpace,
                        metadata: { dashboardUuid: existingDashboardDao.uuid },
                    }),
                );
                if (!canUpdateDashboardInNewSpace) {
                    throw new ForbiddenError(
                        "You don't have access to the space this dashboard is being moved to",
                    );
                }
            }

            if (dashboard.colorPaletteUuid) {
                const palette = await this.organizationModel.findColorPalette(
                    existingDashboardDao.organizationUuid,
                    dashboard.colorPaletteUuid,
                );
                if (!palette) {
                    throw new ParameterError(
                        'Color palette does not belong to this organization',
                    );
                }
            }

            const updatedDashboard = await this.dashboardModel.update(
                existingDashboardDao.uuid,
                {
                    name: dashboard.name,
                    description: dashboard.description,
                    spaceUuid: dashboard.spaceUuid,
                    colorPaletteUuid: dashboard.colorPaletteUuid,
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

        // Auto-remove verification when dashboard is edited
        await this.contentVerificationModel.unverify(
            ContentType.DASHBOARD,
            existingDashboardDao.uuid,
        );

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            existingDashboardDao.uuid,
        );
        const updatedSpace =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                updatedNewDashboard.spaceUuid,
            );

        return {
            ...updatedNewDashboard,
            inheritsFromOrgOrProject: updatedSpace.inheritsFromOrgOrProject,
            access: updatedSpace.access,
        };
    }

    async togglePinning(
        user: SessionUser,
        dashboardUuidOrSlug: string,
    ): Promise<TogglePinnedItemInfo> {
        const existingDashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                existingDashboardDao.spaceUuid,
            );
        const existingDashboard = {
            ...existingDashboardDao,
            inheritsFromOrgOrProject,
            access,
        };

        const { projectUuid, organizationUuid, pinnedListUuid, spaceUuid } =
            existingDashboard;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('PinnedItems', {
                    projectUuid,
                    organizationUuid,
                    metadata: { dashboardUuid: existingDashboard.uuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...existingDashboard,
                    metadata: {
                        dashboardUuid: existingDashboard.uuid,
                        dashboardName: existingDashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                dashboardUuid: existingDashboard.uuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                dashboardUuid: existingDashboard.uuid,
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
                (item) => item.dashboardUuid === existingDashboard.uuid,
            ),
        };
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<Dashboard[]> {
        const auditedAbility = this.createAuditedAbility(user);
        const userHasAccessToDashboards = await Promise.all(
            dashboards.map(async (dashboardToUpdate) => {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    dashboardToUpdate.uuid,
                );
                const currentSpaceContext =
                    await this.spacePermissionService.getSpaceAccessContext(
                        user.userUuid,
                        dashboard.spaceUuid,
                    );
                const canUpdateDashboardInCurrentSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...currentSpaceContext,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                );
                const newSpaceContext =
                    await this.spacePermissionService.getSpaceAccessContext(
                        user.userUuid,
                        dashboardToUpdate.spaceUuid,
                    );
                const canUpdateDashboardInNewSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...newSpaceContext,
                        metadata: { dashboardUuid: dashboardToUpdate.uuid },
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
                const dashboardSpaceContext =
                    await this.spacePermissionService.getSpaceAccessContext(
                        user.userUuid,
                        dashboard.spaceUuid,
                    );
                return {
                    ...dashboard,
                    inheritsFromOrgOrProject:
                        dashboardSpaceContext.inheritsFromOrgOrProject,
                    access: dashboardSpaceContext.access,
                };
            },
        );

        return Promise.all(updatedDashboardsWithSpacesAccess);
    }

    async delete(
        user: SessionUser,
        dashboardUuid: string,
        options?: SoftDeleteOptions & { projectUuid?: string },
    ): Promise<void> {
        const dashboardToDelete = await this.dashboardModel.getByIdOrSlug(
            dashboardUuid,
            {
                projectUuid: options?.projectUuid,
            },
        );
        const { organizationUuid, projectUuid, spaceUuid, tiles } =
            dashboardToDelete;

        if (!options?.bypassPermissions) {
            const { inheritsFromOrgOrProject, access } =
                await this.spacePermissionService.getSpaceAccessContext(
                    user.userUuid,
                    spaceUuid,
                );
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject,
                        access,
                        metadata: { dashboardUuid },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    "You don't have access to the space this dashboard belongs to",
                );
            }
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

        const resolvedUuid = dashboardToDelete.uuid;
        if (this.lightdashConfig.softDelete.enabled) {
            await this.softDelete(user, resolvedUuid, {
                bypassPermissions: true, // perms checked above
            });
        } else {
            await this.permanentDelete(user, resolvedUuid, {
                bypassPermissions: true, // perms checked above
            });
        }

        this.analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboardToDelete.uuid,
                projectId: dashboardToDelete.projectUuid,
                softDelete: this.lightdashConfig.softDelete.enabled,
            },
        });
    }

    async softDelete(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'delete', {
                type: 'Dashboard',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const { inheritsFromOrgOrProject, access } =
                await this.spacePermissionService.getSpaceAccessContext(
                    user.userUuid,
                    dashboard.spaceUuid,
                );
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        inheritsFromOrgOrProject,
                        access,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    "You don't have access to the space this dashboard belongs to",
                );
            }
        }

        const deletedDashboard = await this.dashboardModel.softDelete(
            dashboard.uuid,
            user.userUuid,
        );

        await this.schedulerService.softDeleteByDashboardUuid(
            user,
            dashboard.uuid,
            {
                projectUuid: deletedDashboard.projectUuid,
                organizationUuid: deletedDashboard.organizationUuid,
            },
            { bypassPermissions: true }, // dashboard delete authorized above
        );
    }

    async restore(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { deleted: true },
        );

        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('DeletedContent', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        await this.dashboardModel.restore(dashboard.uuid);

        await this.schedulerService.restoreByDashboardUuid(
            user,
            dashboard.uuid,
            {
                projectUuid: dashboard.projectUuid,
                organizationUuid: dashboard.organizationUuid,
            },
            { bypassPermissions: true }, // dashboard restore authorized above
        );

        this.analytics.track({
            event: 'dashboard.restored',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboard.uuid,
                projectId: dashboard.projectUuid,
            },
        });
    }

    async permanentDelete(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        // 'any' so this works whether called directly on a soft-deleted
        // dashboard (restore-then-purge flow) or via `delete()` on a
        // not-yet-deleted dashboard (when softDelete config is off).
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { deleted: 'any' },
        );
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('DeletedContent', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        await this.dashboardModel.permanentDelete(dashboard.uuid);
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
            organizationUuid: dashboard.organizationUuid,
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
            savedSqlUuid: null,
        });
        const createSchedulerData: SchedulerDashboardUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                ...getSchedulerResourceTypeAndId(scheduler),
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
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
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };
        const { organizationUuid, projectUuid } = dashboard;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return {
            ...dashboard,
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
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                actor.user.userUuid,
                dashboard.spaceUuid,
            );

        const auditedAbility = this.createAuditedAbility(actor.user);
        const isActorAllowedToPerformAction = auditedAbility.can(
            action,
            subject('Dashboard', {
                organizationUuid: actor.user.organizationUuid || '',
                projectUuid: actor.projectUuid,
                inheritsFromOrgOrProject,
                access,
                metadata: { dashboardUuid: dashboard.uuid },
            }),
        );

        if (!isActorAllowedToPerformAction) {
            throw new ForbiddenError(
                `You don't have access to ${action} this dashboard`,
            );
        }

        if (resource.spaceUuid && dashboard.spaceUuid !== resource.spaceUuid) {
            const newSpace =
                await this.spacePermissionService.getSpaceAccessContext(
                    actor.user.userUuid,
                    resource.spaceUuid,
                );

            const isActorAllowedToPerformActionInNewSpace = auditedAbility.can(
                action,
                subject('Dashboard', {
                    organizationUuid: newSpace.organizationUuid,
                    projectUuid: actor.projectUuid,
                    inheritsFromOrgOrProject: newSpace.inheritsFromOrgOrProject,
                    access: newSpace.access,
                    metadata: { dashboardUuid: dashboard.uuid },
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
        dashboardUuidOrSlug: string,
    ): Promise<DashboardHistory> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to view the version history of this dashboard",
            );
        }

        const versions = await this.dashboardModel.getLatestVersionSummaries(
            dashboardDao.uuid,
        );

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

    async getVersion(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        versionUuid: string,
    ): Promise<DashboardVersion> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to view this dashboard version",
            );
        }

        const [versionSummary, dashboard] = await Promise.all([
            this.dashboardModel.getVersionSummaryByUuid(
                dashboardDao.uuid,
                versionUuid,
            ),
            this.dashboardModel.getVersionByUuid(
                dashboardDao.uuid,
                versionUuid,
            ),
        ]);

        if (!dashboard) {
            throw new NotFoundError('Dashboard version not found');
        }

        // Construct a full dashboard object from the version
        const fullDashboard: Dashboard = {
            ...dashboardDao,
            tiles: dashboard.tiles,
            filters: dashboard.filters,
            parameters: dashboard.parameters,
            tabs: dashboard.tabs,
            config: dashboard.config,
            updatedAt: dashboard.updatedAt,
            updatedByUser: dashboard.updatedByUser,
            inheritsFromOrgOrProject,
            access,
        };

        // Check if this is the current version
        const isCurrentVersion = dashboardDao.versionUuid === versionUuid;

        // Calculate chart version differences only if not the current version
        const chartVersionDifferences: ChartVersionDifference[] = [];

        if (!isCurrentVersion) {
            // Get current tiles with saved charts
            const currentChartTiles = dashboardDao.tiles.filter(
                (tile) =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid,
            );

            // Get version tiles with dashboard-owned charts (only these are rolled back)
            const versionChartTiles = dashboard.tiles.filter(
                (tile) =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid &&
                    tile.properties.belongsToDashboard === true,
            );

            // Compare charts that exist in the version
            const versionChartDifferencesPromises = versionChartTiles
                .filter(isDashboardChartTileType)
                .filter((tile) => tile.properties.savedChartUuid)
                .map(async (versionTile) => {
                    const chartUuid = versionTile.properties.savedChartUuid!;
                    const currentTile = currentChartTiles.find(
                        (tile) =>
                            isDashboardChartTileType(tile) &&
                            tile.properties.savedChartUuid === chartUuid,
                    );

                    let currentChartVersion: ChartVersionSummary | null = null;
                    let selectedChartVersion: ChartVersionSummary | null = null;

                    try {
                        // Get the current (latest) chart version
                        currentChartVersion =
                            (await this.savedChartModel.getLatestVersionSummary(
                                chartUuid,
                            )) ?? null;

                        // Get the chart version that was active when the dashboard version was created
                        selectedChartVersion =
                            (await this.savedChartModel.getVersionSummaryAtTimestamp(
                                chartUuid,
                                dashboard.updatedAt,
                            )) ?? null;
                    } catch (error) {
                        // Chart might have been deleted or inaccessible
                        this.logger.debug(
                            `Could not fetch chart versions for ${chartUuid}: ${error}`,
                        );
                    }

                    return {
                        tileUuid: versionTile.uuid,
                        chartUuid,
                        chartName: versionTile.properties.chartName || null,
                        currentVersion: currentChartVersion,
                        selectedVersion: selectedChartVersion,
                    };
                });

            const versionChartDifferences = await Promise.all(
                versionChartDifferencesPromises,
            );
            chartVersionDifferences.push(...versionChartDifferences);
        }

        return {
            ...versionSummary,
            dashboard: fullDashboard,
            chartVersionDifferences,
        };
    }

    async rollback(
        user: SessionUser,
        dashboardUuidOrSlug: string,
        versionUuid: string,
    ): Promise<void> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);

        // Check if trying to rollback to current version
        if (dashboardDao.versionUuid === versionUuid) {
            this.logger.info(
                `Ignoring rollback request - version ${versionUuid} is already the current version for dashboard ${dashboardDao.uuid}`,
            );
            return;
        }

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                dashboardDao.spaceUuid,
            );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to rollback this dashboard",
            );
        }

        const targetVersion = await this.dashboardModel.getVersionByUuid(
            dashboardDao.uuid,
            versionUuid,
        );

        if (!targetVersion) {
            throw new NotFoundError('Dashboard version not found');
        }

        // Rollback dashboard and all owned charts in a single transaction
        await this.savedChartModel.transaction(async (tx) => {
            // Rollback dashboard version
            await this.dashboardModel.addVersion(
                dashboardDao.uuid,
                {
                    tiles: targetVersion.tiles,
                    filters: targetVersion.filters,
                    parameters: targetVersion.parameters,
                    tabs: targetVersion.tabs,
                    config: targetVersion.config,
                },
                user,
                dashboardDao.projectUuid,
                tx,
            );

            // Only rollback charts that belong to the dashboard
            const uniqueChartUuids = [
                ...new Set(
                    targetVersion.tiles
                        .filter(
                            (tile) =>
                                isDashboardChartTileType(tile) &&
                                tile.properties.savedChartUuid &&
                                tile.properties.belongsToDashboard === true,
                        )
                        .map((tile) =>
                            isDashboardChartTileType(tile)
                                ? tile.properties.savedChartUuid!
                                : '',
                        )
                        .filter(Boolean),
                ),
            ];

            // Rollback each dashboard-owned chart to its version at the target dashboard version time
            if (uniqueChartUuids.length > 0) {
                this.logger.info(
                    `Rolling back ${uniqueChartUuids.length} dashboard-owned charts`,
                );

                await Promise.all(
                    uniqueChartUuids.map(async (chartUuid) => {
                        const result =
                            await this.savedChartModel.rollbackToVersionAtTimestamp(
                                chartUuid,
                                targetVersion.updatedAt,
                                user,
                                tx,
                            );

                        if (result) {
                            this.logger.info(`Rolled back chart ${chartUuid}`);
                        } else {
                            this.logger.warn(
                                `No chart version found for ${chartUuid} at timestamp ${targetVersion.updatedAt}. Chart may have been created after this dashboard version.`,
                            );
                        }
                    }),
                );
            } else {
                this.logger.info('No dashboard-owned charts to rollback');
            }
        });

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
