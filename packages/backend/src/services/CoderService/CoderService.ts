import { subject } from '@casl/ability';
import {
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ChartAsCode,
    ChartAsCodeInternalization,
    ChartSummary,
    ContentType,
    CreateSavedChart,
    currentVersion,
    DashboardAsCode,
    DashboardAsCodeInternalization,
    DashboardDAO,
    DashboardTile,
    DashboardTileAsCode,
    DashboardTileTarget,
    DashboardTileTypes,
    ForbiddenError,
    friendlyName,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    NotFoundError,
    Project,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    Space,
    SpaceMemberRole,
    SqlChartAsCode,
    UpdatedByUser,
    type ContentVerificationInfo,
    type DashboardTileWithSlug,
    type FilterGroup,
    type FilterGroupInput,
    type FilterGroupItem,
    type FilterGroupItemInput,
    type FilterRule,
    type Filters,
    type FiltersInput,
    type SpaceSummaryBase,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { PromoteService } from '../PromoteService/PromoteService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
    promoteService: PromoteService;
    spacePermissionService: SpacePermissionService;
    contentVerificationModel: ContentVerificationModel;
};

const normalizeFilterGroupItem = (
    item: FilterGroupItemInput,
): FilterGroupItem => {
    if ('or' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            or: item.or.map(normalizeFilterGroupItem),
        };
    }
    if ('and' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            and: item.and.map(normalizeFilterGroupItem),
        };
    }
    return { ...(item as FilterRule), id: item.id ?? uuidv4() };
};

const normalizeFilterGroup = (
    group: FilterGroupInput | undefined,
): FilterGroup | undefined => {
    if (!group) return undefined;
    return normalizeFilterGroupItem(group) as FilterGroup;
};

const normalizeFilterIds = (filters: FiltersInput): Filters => ({
    dimensions: normalizeFilterGroup(filters.dimensions),
    metrics: normalizeFilterGroup(filters.metrics),
    tableCalculations: normalizeFilterGroup(filters.tableCalculations),
});

const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is DashboardTile & {
    properties: { chartSlug: string; hideTitle: boolean; chartName?: string };
} =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    promoteService: PromoteService;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        savedSqlModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
        promoteService,
        spacePermissionService,
        contentVerificationModel,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
        this.promoteService = promoteService;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
    }

    private static transformChart(
        chart: SavedChartDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'path'>[],
        dashboardSlugs: Record<string, string>,
        verificationMap: Map<string, ContentVerificationInfo>,
    ): ChartAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === chart.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        return {
            name: chart.name,
            description: chart.description,
            tableName: chart.tableName,
            updatedAt: chart.updatedAt,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            pivotConfig: chart.pivotConfig,
            dashboardSlug: chart.dashboardUuid
                ? dashboardSlugs[chart.dashboardUuid]
                : undefined,
            slug: chart.slug,
            tableConfig: chart.tableConfig,
            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
            parameters: chart.parameters,
            verification: verificationMap.get(chart.uuid) ?? null,
        };
    }

    private static transformSqlChart(
        sqlChart: {
            name: string;
            description: string | null;
            slug: string;
            sql: string;
            limit: number;
            config: SqlChartAsCode['config'];
            chartKind: SqlChartAsCode['chartKind'];
            lastUpdatedAt: Date;
        },
        spacePath: string,
    ): SqlChartAsCode {
        const spaceSlug = getContentAsCodePathFromLtreePath(spacePath);

        return {
            name: sqlChart.name,
            description: sqlChart.description,
            slug: sqlChart.slug,
            sql: sqlChart.sql,
            limit: sqlChart.limit,
            config: sqlChart.config,
            chartKind: sqlChart.chartKind,
            updatedAt: sqlChart.lastUpdatedAt,
            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
        };
    }

    static isUuid(id: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
        );
    }

    static getChartSlugForTileUuid = (
        dashboard: DashboardDAO,
        uuid: string,
    ) => {
        const tile = dashboard.tiles.find((t) => t.uuid === uuid);
        if (tile && isAnyChartTile(tile)) {
            const hasMultipleTilesWithSameChartSlug =
                dashboard.tiles.filter(
                    (t) =>
                        isAnyChartTile(t) &&
                        t.properties.chartSlug === tile.properties.chartSlug,
                ).length > 1;
            if (hasMultipleTilesWithSameChartSlug) {
                const chartSlugIndex = dashboard.tiles
                    .filter(
                        (t) =>
                            isAnyChartTile(t) &&
                            t.properties.chartSlug ===
                                tile.properties.chartSlug,
                    )
                    .findIndex((t) => t.uuid === uuid);
                return `${tile.properties.chartSlug}-${chartSlugIndex + 1}`;
            }
            return tile.properties.chartSlug;
        }
        return undefined;
    };

    /* Convert dashboard filters from tile uuids to tile slugs
     * DashboardDAO to DashboardAsCode
     */
    static getFiltersWithTileSlugs(
        dashboard: DashboardDAO,
    ): Required<NonNullable<DashboardAsCode['filters']>> {
        const dimensionFiltersWithoutUuids: NonNullable<
            DashboardAsCode['filters']
        >['dimensions'] = dashboard.filters.dimensions.map((filter) => {
            const tileTargets = Object.entries(filter.tileTargets ?? {}).reduce<
                Record<string, DashboardTileTarget>
            >((acc, [tileUuid, target]) => {
                const tileSlug = CoderService.getChartSlugForTileUuid(
                    dashboard,
                    tileUuid,
                );
                if (!tileSlug) return acc;
                return {
                    ...acc,
                    [tileSlug]: target,
                };
            }, {});
            return {
                ...filter,
                id: undefined,
                tileTargets,
            };
        });

        return {
            ...dashboard.filters,
            dimensions: dimensionFiltersWithoutUuids,
        };
    }

    /* Convert dashboard filters from tile slugs to tile uuids
     * DashboardAsCode to DashboardDAO
     */
    static getFiltersWithTileUuids(
        dashboardAsCode: DashboardAsCode,
        tilesWithUuids: DashboardTileWithSlug[],
    ): DashboardDAO['filters'] {
        const dimensionFiltersWithUuids: DashboardDAO['filters']['dimensions'] =
            (dashboardAsCode.filters?.dimensions ?? []).map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileSlug, target]) => {
                        const tileUuid = tilesWithUuids.find(
                            (t) =>
                                isAnyChartTile(t) &&
                                // Match first by tileSlug, then by chartSlug (for the case of tile not having a slug)
                                (t.tileSlug === tileSlug ||
                                    t.properties.chartSlug === tileSlug),
                        )?.uuid;
                        if (!tileUuid) {
                            console.error(
                                `Tile with slug ${tileSlug} not found in tilesWithUuids`,
                            );
                            return acc;
                        }
                        return {
                            ...acc,
                            [tileUuid]: target,
                        };
                    },
                    {},
                );
                return {
                    ...filter,
                    id: uuidv4(),
                    tileTargets,
                };
            });
        return {
            metrics: dashboardAsCode.filters?.metrics ?? [],
            tableCalculations: dashboardAsCode.filters?.tableCalculations ?? [],
            dimensions: dimensionFiltersWithUuids,
        };
    }

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'path'>[],
        verificationMap: Map<string, ContentVerificationInfo>,
    ): DashboardAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === dashboard.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${dashboard.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        const tilesWithoutUuids: DashboardTileAsCode[] = dashboard.tiles.map(
            (tile): DashboardTileAsCode => {
                if (isAnyChartTile(tile)) {
                    return {
                        ...tile,
                        uuid: undefined,
                        tileSlug: CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tile.uuid,
                        ),
                        properties: {
                            title: tile.properties.title,
                            hideTitle: tile.properties.hideTitle,
                            chartSlug: tile.properties.chartSlug,
                            chartName: tile.properties.chartName,
                        },
                    };
                }

                // Markdown and loom are returned as they are
                return {
                    ...tile,
                    tileSlug: undefined,
                    uuid: undefined,
                };
            },
            [],
        );

        const dashboardAsCode: DashboardAsCode = {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: tilesWithoutUuids,

            filters: CoderService.getFiltersWithTileSlugs(dashboard),
            tabs: dashboard.tabs,
            slug: dashboard.slug,

            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
            verification: verificationMap.get(dashboard.uuid) ?? null,
        };

        return dashboardAsCode;
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileAsCode[],
    ): Promise<DashboardTileWithSlug[]> {
        const chartSlugs: string[] = tiles.reduce<string[]>(
            (acc, tile) =>
                isAnyChartTile(tile)
                    ? [...acc, tile.properties.chartSlug]
                    : acc,
            [],
        );

        // Skip database queries if there are no chart tiles
        if (chartSlugs.length === 0) {
            return tiles.map((tile) => ({
                ...tile,
                uuid: tile.uuid ?? uuidv4(),
            })) as DashboardTileWithSlug[];
        }

        // Query both regular charts and SQL charts in parallel
        const [charts, sqlChartRows] = await Promise.all([
            this.savedChartModel.find({
                slugs: chartSlugs,
                projectUuid,
                excludeChartsSavedInDashboard: false,
                includeOrphanChartsWithinDashboard: true,
            }),
            this.savedSqlModel.find({
                slugs: chartSlugs,
                projectUuid,
            }),
        ]);

        // Create a unified map of slug -> { uuid, isSql } for both chart types
        const chartSlugToInfo = new Map<
            string,
            { uuid: string; isSql: boolean }
        >();
        charts.forEach((chart) =>
            chartSlugToInfo.set(chart.slug, { uuid: chart.uuid, isSql: false }),
        );
        sqlChartRows.forEach((row) =>
            chartSlugToInfo.set(row.slug, {
                uuid: row.saved_sql_uuid,
                isSql: true,
            }),
        );

        return tiles.map((tile) => {
            if (isAnyChartTile(tile)) {
                const { chartSlug } = tile.properties;
                const chartInfo = chartSlugToInfo.get(chartSlug);
                const isSqlChart =
                    chartInfo?.isSql ??
                    tile.type === DashboardTileTypes.SQL_CHART;

                // Use the correct property name based on chart type
                if (isSqlChart) {
                    return {
                        ...tile,
                        uuid: uuidv4(),
                        type: DashboardTileTypes.SQL_CHART,
                        properties: {
                            ...tile.properties,
                            savedSqlUuid: chartInfo?.uuid ?? null,
                        },
                    } as DashboardTileWithSlug;
                }

                return {
                    ...tile,
                    uuid: uuidv4(),
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        ...tile.properties,
                        savedChartUuid: chartInfo?.uuid ?? null,
                    },
                } as DashboardTileWithSlug;
            }

            return tile as DashboardTileWithSlug;
        });
    }

    /*
    Dashboard or chart ids can be uuids or slugs
     We need to convert uuids to slugs before making the query
    */
    async convertIdsToSlugs(
        type: 'dashboard' | 'chart',
        ids: string[] | undefined,
    ) {
        if (!ids) return ids; // return [] or undefined

        const uuids = ids?.filter((id) => CoderService.isUuid(id));
        let uuidsToSlugs: string[] = [];

        if (uuids.length > 0) {
            if (type === 'dashboard') {
                const dashboardSlugs =
                    await this.dashboardModel.getSlugsForUuids(uuids);
                uuidsToSlugs = Object.values(dashboardSlugs);
            } else if (type === 'chart') {
                uuidsToSlugs =
                    await this.savedChartModel.getSlugsForUuids(uuids);
            }
        }
        const slugs = ids?.filter((id) => !CoderService.isUuid(id)) ?? [];

        return [...uuidsToSlugs, ...slugs];
    }

    static getMissingIds(
        ids: string[] | undefined,
        items: Pick<SavedChartDAO | DashboardDAO, 'slug' | 'uuid'>[],
    ) {
        return ids
            ? ids.reduce<string[]>((acc, id) => {
                  const exists = items.some(
                      (item) => id === item.uuid || id === item.slug,
                  );
                  if (!exists) {
                      acc.push(id);
                  }
                  return acc;
              }, [])
            : [];
    }

    private async filterPrivateContent<
        T extends
            | DashboardDAO
            | SavedChartDAO
            | (ChartSummary & { updatedAt: Date })
            | Pick<
                  DashboardDAO,
                  'uuid' | 'name' | 'spaceUuid' | 'description' | 'slug'
              >,
    >(
        user: SessionUser,
        project: Project,
        content: T[],
        spaces: SpaceSummaryBase[],
    ): Promise<T[]> {
        if (
            user.ability.can(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            // User is an admin, return all content
            return content;
        }

        const spaceUuids = spaces.map((s) => s.uuid);

        const accessibleSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        const accessibleSet = new Set(accessibleSpaceUuids);
        return content.filter((c) => accessibleSet.has(c.spaceUuid));
    }

    /*
    @param dashboardIds: Dashboard ids can be uuids or slugs, if undefined return all dashboards, if [] we return no dashboards
    @returns: DashboardAsCode[]
    */
    async getDashboards(
        user: SessionUser,
        projectUuid: string,
        dashboardIds: string[] | undefined,
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download dashboards',
            );
        }

        const slugs = await this.convertIdsToSlugs('dashboard', dashboardIds);

        if (slugs?.length === 0) {
            this.logger.warn(
                `No dashboards to download for project ${projectUuid} with ids ${dashboardIds?.join(
                    ', ',
                )}`,
            );
            return {
                dashboards: [],
                languageMap: undefined,
                missingIds: dashboardIds || [],
                total: 0,
                offset: 0,
            };
        }

        const dashboardSummaries = await this.dashboardModel.find({
            projectUuid,
            slugs,
        });
        const spaceUuids = dashboardSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });

        const dashboardSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboardSummaries,
            spaces,
        );
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const offsetIndex = offset || 0;
        const newOffset = Math.min(
            offsetIndex + maxResults,
            dashboardSummariesWithAccess.length,
        );

        const limitedDashboardSummaries = dashboardSummariesWithAccess.slice(
            offsetIndex,
            newOffset,
        );

        const dashboardPromises = limitedDashboardSummaries.map((dash) =>
            this.dashboardModel.getByIdOrSlug(dash.uuid),
        );
        const dashboards = await Promise.all(dashboardPromises);

        const missingIds = CoderService.getMissingIds(dashboardIds, dashboards);
        if (missingIds.length > 0) {
            this.logger.warn(
                `Missing filtered dashboards for project ${projectUuid} with ids ${missingIds.join(
                    ', ',
                )}`,
            );
        }

        const dashboardsWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboards,
            spaces,
        );

        const dashboardUuidsForVerification = dashboardsWithAccess.map(
            (d) => d.uuid,
        );
        const dashboardVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.DASHBOARD,
                dashboardUuidsForVerification,
            );

        const transformedDashboards = dashboardsWithAccess.map((dashboard) =>
            CoderService.transformDashboard(
                dashboard,
                spaces,
                dashboardVerificationMap,
            ),
        );

        return {
            dashboards: transformedDashboards,
            languageMap: languageMap
                ? transformedDashboards.map((dashboard) => {
                      try {
                          return new DashboardAsCodeInternalization().getLanguageMap(
                              dashboard,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for dashboard ${dashboard.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            total: dashboardSummariesWithAccess.length,
            offset: newOffset,
        };
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // Filter charts based on user permissions (from private spaces)
        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You are not allowed to download charts');
        }

        const slugs = await this.convertIdsToSlugs('chart', chartIds);
        if (slugs?.length === 0) {
            this.logger.warn(
                `No charts to download for project ${projectUuid} with ids ${chartIds?.join(
                    ', ',
                )}`,
            );
            return {
                charts: [],
                languageMap: undefined,
                missingIds: chartIds || [],
                total: 0,
                offset: 0,
            };
        }

        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
            slugs,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;

        // Apply offset and limit to chart summaries
        const offsetIndex = offset || 0;
        const spaceUuids = chartSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });
        const chartsSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            chartSummaries,
            spaces,
        );
        const newOffset = Math.min(
            offsetIndex + maxResults,
            chartsSummariesWithAccess.length,
        );
        const limitedChartSummaries = chartsSummariesWithAccess.slice(
            offsetIndex,
            newOffset,
        );

        const chartPromises = limitedChartSummaries.map((chart) =>
            this.savedChartModel.get(chart.uuid),
        );
        const charts = await Promise.all(chartPromises);

        // get all spaces to map  dashboardSlug
        const dashboardUuids = charts.reduce<string[]>((acc, chart) => {
            if (chart.dashboardUuid) {
                acc.push(chart.dashboardUuid);
            }
            return acc;
        }, []);
        const dashboards =
            await this.dashboardModel.getSlugsForUuids(dashboardUuids);

        const chartUuids = charts.map((chart) => chart.uuid);
        const chartVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.CHART,
                chartUuids,
            );

        const transformedCharts = charts.map((chart) =>
            CoderService.transformChart(
                chart,
                spaces,
                dashboards,
                chartVerificationMap,
            ),
        );

        const missingIds = CoderService.getMissingIds(chartIds, charts);

        return {
            charts: transformedCharts,
            languageMap: languageMap
                ? transformedCharts.map((chart) => {
                      try {
                          return new ChartAsCodeInternalization().getLanguageMap(
                              chart,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for chart ${chart.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            total: chartsSummariesWithAccess.length,
            offset: newOffset,
        };
    }

    async getSqlCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
    ): Promise<{
        sqlCharts: SqlChartAsCode[];
        missingIds: string[];
        total: number;
        offset: number;
    }> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download SQL charts',
            );
        }

        // For SQL charts, we use slugs directly (no UUID to slug conversion needed)
        // since SQL charts are only identified by slug in the as-code workflow
        const slugs = chartIds;

        if (slugs?.length === 0) {
            return {
                sqlCharts: [],
                missingIds: chartIds || [],
                total: 0,
                offset: 0,
            };
        }

        const sqlChartRows = await this.savedSqlModel.find({
            projectUuid,
            slugs,
        });

        // Filter SQL charts by space access
        const sqlChartSpaceUuids = sqlChartRows.map((row) => row.space_uuid);
        const sqlChartSpaces = await this.spaceModel.find({
            spaceUuids: sqlChartSpaceUuids,
        });
        const sqlChartsWithAccess = await this.filterPrivateContent(
            user,
            project,
            sqlChartRows.map((row) => ({
                uuid: row.saved_sql_uuid,
                name: row.name,
                spaceUuid: row.space_uuid,
                description: row.description ?? undefined,
                slug: row.slug,
            })),
            sqlChartSpaces,
        );

        // Filter rows by access permissions first
        const sqlChartSlugsWithAccess = new Set(
            sqlChartsWithAccess.map((c) => c.slug),
        );
        const accessibleSqlChartRows = sqlChartRows.filter((row) =>
            sqlChartSlugsWithAccess.has(row.slug),
        );

        // Apply pagination to the filtered results
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const offsetIndex = offset || 0;
        const paginatedSqlChartRows = accessibleSqlChartRows.slice(
            offsetIndex,
            offsetIndex + maxResults,
        );
        const newOffset = Math.min(
            offsetIndex + paginatedSqlChartRows.length,
            accessibleSqlChartRows.length,
        );

        const transformedSqlCharts = paginatedSqlChartRows.map((row) =>
            CoderService.transformSqlChart(
                {
                    name: row.name,
                    description: row.description,
                    slug: row.slug,
                    sql: row.sql,
                    limit: row.limit,
                    config: row.config as SqlChartAsCode['config'],
                    chartKind: row.chart_kind,
                    lastUpdatedAt: row.last_version_updated_at,
                },
                row.path,
            ),
        );

        // Calculate missing IDs
        const foundSlugs = new Set(sqlChartRows.map((c) => c.slug));
        const missingIds = chartIds
            ? chartIds.filter((id) => !foundSlugs.has(id))
            : [];

        return {
            sqlCharts: transformedSqlCharts,
            missingIds,
            total: accessibleSqlChartRows.length,
            offset: newOffset,
        };
    }

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        force?: boolean,
    ) {
        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Default optional fields when missing (e.g. user-authored YAML)
        const chartWithDefaults = {
            ...chartAsCode,
            updatedAt: chartAsCode.updatedAt ?? new Date(),
            tableConfig: chartAsCode.tableConfig ?? { columnOrder: [] },
            metricQuery: {
                ...chartAsCode.metricQuery,
                filters: normalizeFilterIds(chartAsCode.metricQuery.filters),
            },
        };

        const [chart] = await this.savedChartModel.find({
            slug,
            projectUuid,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });

        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (chart === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    chartWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                );

            console.info(
                `Creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );

            let createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            };

            if (chartWithDefaults.dashboardSlug) {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slug: chartWithDefaults.dashboardSlug,
                });

                let dashboardUuid: string = dashboard?.uuid;
                if (!dashboard) {
                    // Charts within dashboards need a dashboard first,
                    // so we will create a placeholder dashboard for this
                    // which we can update later
                    console.debug(
                        'Creating placeholder dashboard for chart within dashboard',
                        chartWithDefaults.slug,
                    );
                    const newDashboard = await this.dashboardModel.create(
                        space.uuid,
                        {
                            name: friendlyName(chartWithDefaults.dashboardSlug),
                            tiles: [],
                            slug: chartWithDefaults.dashboardSlug,
                            forceSlug: true,
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );

                    dashboardUuid = newDashboard.uuid;
                }
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: null,
                    dashboardUuid,
                    updatedByUser: user,
                    forceSlug: true,
                };
            } else {
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: space.uuid,
                    dashboardUuid: null,
                    updatedByUser: user,
                    forceSlug: true,
                };
            }

            const newChart = await this.savedChartModel.create(
                projectUuid,
                user.userUuid,
                createChart,
            );

            console.info(
                `Finished creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newChart,
                            spaceSlug: chartWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                chartWithDefaults.spaceSlug,
                            ),
                            oldUuid: newChart.uuid,
                        },
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }
        console.info(
            `Updating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
        );
        // Although, promotionService already upsertSpaces
        // We want to create a new space based on the slug, not the uuid
        // Then there is no need to do promoteService.upsertSpaces
        const { space } = await this.getOrCreateSpace(
            projectUuid,
            chartWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
        );

        const { promotedChart, upstreamChart } =
            await this.promoteService.getPromoteCharts(
                user,
                projectUuid, // We use the same projectUuid for both promoted and upstream
                chart.uuid,
                true, // includeOrphanChartsWithinDashboard
            );
        const updatedChart = {
            ...promotedChart,
            chart: {
                ...promotedChart.chart,
                ...chartWithDefaults,
                projectUuid,
                organizationUuid: project.organizationUuid,
            },
        };

        //  we force the new space on the upstreamChart
        if (upstreamChart.chart) upstreamChart.chart.spaceUuid = space.uuid;
        let promotionChanges: PromotionChanges =
            await this.promoteService.getChartChanges(
                updatedChart,
                upstreamChart,
            );
        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }
        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
        );

        console.info(
            `Finished updating chart "${chartWithDefaults.name}" on project ${projectUuid}: ${promotionChanges.charts[0].action}`,
        );

        return promotionChanges;
    }

    async upsertSqlChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        sqlChartAsCode: SqlChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        force?: boolean,
    ): Promise<PromotionChanges> {
        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Default updatedAt to now when missing (e.g. user-authored YAML)
        const sqlChartWithDefaults = {
            ...sqlChartAsCode,
            updatedAt: sqlChartAsCode.updatedAt ?? new Date(),
        };

        const sqlChartRows = await this.savedSqlModel.find({
            slugs: [slug],
            projectUuid,
        });
        const existingSqlChart = sqlChartRows[0];

        const { space, created: spaceCreated } = await this.getOrCreateSpace(
            projectUuid,
            sqlChartAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
        );

        if (existingSqlChart === undefined) {
            // Create new SQL chart
            this.logger.info(
                `Creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            const { savedSqlUuid } = await this.savedSqlModel.create(
                user.userUuid,
                projectUuid,
                {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                    spaceUuid: space.uuid,
                    slug: sqlChartAsCode.slug, // Force the slug from the YAML file
                },
            );

            this.logger.info(
                `Finished creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            // Note: We use a minimal object for the promotion changes since SQL charts
            // don't have the same structure as regular charts. The CLI only uses the action.
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            uuid: savedSqlUuid,
                            name: sqlChartAsCode.name,
                            slug: sqlChartAsCode.slug,
                            spaceSlug: sqlChartAsCode.spaceSlug,
                        } as PromotionChanges['charts'][0]['data'],
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }

        // Update existing SQL chart
        this.logger.info(
            `Updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        await this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid: existingSqlChart.saved_sql_uuid,
            sqlChart: {
                unversionedData: {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    spaceUuid: space.uuid,
                },
                versionedData: {
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                },
            },
        });

        this.logger.info(
            `Finished updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        const promotionChanges: PromotionChanges = {
            charts: [
                {
                    action: PromotionAction.UPDATE,
                    data: {
                        uuid: existingSqlChart.saved_sql_uuid,
                        name: sqlChartAsCode.name,
                        slug: sqlChartAsCode.slug,
                        spaceSlug: sqlChartAsCode.spaceSlug,
                    } as PromotionChanges['charts'][0]['data'],
                },
            ],
            spaces: spaceCreated
                ? [{ action: PromotionAction.CREATE, data: space }]
                : [],
            dashboards: [],
        };
        return promotionChanges;
    }

    async getOrCreateSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
    ): Promise<{ space: SpaceSummaryBase; created: boolean }> {
        const [existingSpace] = await this.spaceModel.find({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });

        if (existingSpace !== undefined) {
            if (
                !(await this.spacePermissionService.can(
                    'view',
                    user,
                    existingSpace.uuid,
                ))
            ) {
                throw new ForbiddenError(
                    "You don't have access to a private space",
                );
            }
            return { space: existingSpace, created: false };
        }
        if (skipSpaceCreate) {
            throw new NotFoundError(
                `Space ${spaceSlug} does not exist, skipping creation`,
            );
        }
        const path = getLtreePathFromContentAsCodePath(spaceSlug);

        const closestAncestorSpaceUuid =
            await this.spaceModel.findClosestAncestorByPath({
                path,
                projectUuid,
            });

        const closestAncestorSpace = closestAncestorSpaceUuid
            ? await this.spaceModel.getSpaceSummary(closestAncestorSpaceUuid)
            : null;

        const remainingPath = path
            .replace(closestAncestorSpace?.path ?? '', '') // remove the closest ancestor path
            .replace(/^\./, '') // remove the leading dot
            .split('.');

        let parentSpaceUuid = closestAncestorSpaceUuid;
        let parentPath = closestAncestorSpace?.path ?? '';
        const isPrivate =
            closestAncestorSpace?.isPrivate ?? publicSpaceCreate !== true;
        const inheritParentPermissions = !isPrivate;
        const newSpaces: Space[] = [];

        for await (const currentPath of remainingPath) {
            if (!parentPath) {
                parentPath = currentPath;
            } else {
                parentPath = `${parentPath}.${currentPath}`;
            }

            const newSpace = await this.spaceModel.createSpace(
                {
                    isPrivate,
                    inheritParentPermissions,
                    name: friendlyName(currentPath),
                    parentSpaceUuid,
                },
                {
                    projectUuid,
                    userId: user.userId,
                    path: parentPath,
                },
            );

            if (newSpace.isPrivate) {
                if (parentSpaceUuid) {
                    const [ctx, groupsAccess] = await Promise.all([
                        this.spacePermissionService.getAllSpaceAccessContext(
                            parentSpaceUuid,
                        ),
                        this.spacePermissionService.getGroupAccess(
                            parentSpaceUuid,
                        ),
                    ]);

                    const userAccessPromises = ctx.access
                        .filter((a) => a.hasDirectAccess)
                        .map((a) =>
                            this.spaceModel.addSpaceAccess(
                                newSpace.uuid,
                                a.userUuid,
                                a.role,
                            ),
                        );

                    const groupAccessPromises = groupsAccess.map(
                        (groupAccess) =>
                            this.spaceModel.addSpaceGroupAccess(
                                newSpace.uuid,
                                groupAccess.groupUuid,
                                groupAccess.spaceRole,
                            ),
                    );

                    await Promise.all([
                        ...userAccessPromises,
                        ...groupAccessPromises,
                    ]);
                } else {
                    await this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        user.userUuid,
                        SpaceMemberRole.ADMIN,
                    );
                }
            }

            parentSpaceUuid = newSpace.uuid;

            newSpaces.push(newSpace);
        }

        return {
            space: {
                ...newSpaces[newSpaces.length - 1],
                chartCount: 0,
                dashboardCount: 0,
                childSpaceCount: 0,
            },
            created: true,
        };
    }

    async upsertDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        dashboardAsCode: DashboardAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        force?: boolean,
    ): Promise<PromotionChanges> {
        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Default optional fields when missing (e.g. user-authored YAML)
        const dashboardWithDefaults = {
            ...dashboardAsCode,
            updatedAt: dashboardAsCode.updatedAt ?? new Date(),
            filters: {
                dimensions: dashboardAsCode.filters?.dimensions ?? [],
                metrics: dashboardAsCode.filters?.metrics ?? [],
                tableCalculations:
                    dashboardAsCode.filters?.tableCalculations ?? [],
            },
        };

        const [dashboardSummary] = await this.dashboardModel.find({
            slug,
            projectUuid,
        });
        const tilesWithUuids = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardWithDefaults.tiles,
        );

        const dashboardFilters = CoderService.getFiltersWithTileUuids(
            dashboardWithDefaults,
            tilesWithUuids,
        );
        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                );

            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardWithDefaults,
                    tiles: tilesWithUuids,
                    forceSlug: true,
                    filters: dashboardFilters,
                },
                user,
                projectUuid,
            );

            return {
                dashboards: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newDashboard,
                            spaceSlug: dashboardWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                dashboardWithDefaults.spaceSlug,
                            ),
                        },
                    },
                ],
                charts: [],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
            };
        }
        // Use promote service to update existing dashboard

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardSummary.uuid,
        );

        console.info(
            `Updating dashboard "${dashboard.name}" on project ${projectUuid}`,
        );

        const dashboardWithUuids = {
            ...dashboardWithDefaults,
            tiles: tilesWithUuids,
        };
        const { promotedDashboard, upstreamDashboard } =
            await this.promoteService.getPromotedDashboard(
                user,
                {
                    ...dashboard,
                    ...dashboardWithUuids,
                    filters: dashboardFilters,
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                },
                projectUuid, // We use the same projectUuid for both promoted and upstream
            );

        PromoteService.checkPromoteDashboardPermissions(
            user,
            promotedDashboard,
            upstreamDashboard,
        );

        // Although, promotionService already upsertSpaces
        // We want to create a new space based on the slug, not the uuid
        const { space } = await this.getOrCreateSpace(
            projectUuid,
            dashboardWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
        );

        //  we force the new space on the upstreamDashboard
        if (upstreamDashboard.dashboard)
            upstreamDashboard.dashboard.spaceUuid = space.uuid;

        // TODO: Check permissions for all chart tiles
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.promoteService.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
                true, // includeOrphanChartsWithinDashboard
            );

        // TODO: Right now dashboards on promote service always update dashboards
        // See isDashboardUpdated for more details

        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }

        promotionChanges = await this.promoteService.getOrCreateDashboard(
            user,
            promotionChanges,
        );

        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
            promotionChanges.dashboards[0].data.uuid,
        );

        promotionChanges = await this.promoteService.updateDashboard(
            user,
            promotionChanges,
        );

        console.info(
            `Finished updating dashboard "${dashboard.name}" on project ${projectUuid}: ${promotionChanges.dashboards[0].action}`,
        );
        return promotionChanges;
    }
}
