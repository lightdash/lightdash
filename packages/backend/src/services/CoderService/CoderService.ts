import { subject } from '@casl/ability';
import {
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ChartAsCode,
    ChartAsCodeInternalization,
    ChartSummary,
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
    getLtreePathFromSlug,
    NotFoundError,
    Project,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    Space,
    SpaceMemberRole,
    SpaceSummary,
    UpdatedByUser,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { PromoteService } from '../PromoteService/PromoteService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
    promoteService: PromoteService;
};

const isAnyChartTile = (
    tile: DashboardTileAsCode | DashboardTile,
): tile is DashboardTile & {
    properties: { chartSlug: string; hideTitle: boolean };
} =>
    tile.type === DashboardTileTypes.SAVED_CHART ||
    tile.type === DashboardTileTypes.SQL_CHART;

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    promoteService: PromoteService;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
        promoteService,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
        this.promoteService = promoteService;
    }

    private static transformChart(
        chart: SavedChartDAO,
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'path'>[],
        dashboardSlugs: Record<string, string>,
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
    ): DashboardAsCode['filters'] {
        const dimensionFiltersWithoutUuids: DashboardAsCode['filters']['dimensions'] =
            dashboard.filters.dimensions.map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileUuid, target]) => {
                        const tileSlug = CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tileUuid,
                        );
                        if (!tileSlug) return acc;
                        return {
                            ...acc,
                            [tileSlug]: target,
                        };
                    },
                    {},
                );
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
        tilesWithUuids: DashboardTile[],
    ): DashboardDAO['filters'] {
        const dimensionFiltersWithUuids: DashboardDAO['filters']['dimensions'] =
            dashboardAsCode.filters.dimensions.map((filter) => {
                const tileTargets = Object.entries(
                    filter.tileTargets ?? {},
                ).reduce<Record<string, DashboardTileTarget>>(
                    (acc, [tileSlug, target]) => {
                        const tileUuid = tilesWithUuids.find(
                            (t) =>
                                isAnyChartTile(t) &&
                                t.properties.chartSlug === tileSlug,
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
            ...dashboardAsCode.filters,
            dimensions: dimensionFiltersWithUuids,
        };
    }

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'path'>[],
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
        };

        return dashboardAsCode;
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileAsCode[],
    ): Promise<DashboardTile[]> {
        const chartSlugs: string[] = tiles.reduce<string[]>(
            (acc, tile) =>
                isAnyChartTile(tile)
                    ? [...acc, tile.properties.chartSlug]
                    : acc,
            [],
        );

        const charts = await this.savedChartModel.find({
            slugs: chartSlugs,
            projectUuid,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });

        return tiles.map((tile) => {
            if (isAnyChartTile(tile)) {
                const savedChart = charts.find(
                    (chart) => chart.slug === tile.properties.chartSlug,
                );

                if (!savedChart) {
                    throw new NotFoundError(
                        `Chart with slug ${tile.properties.chartSlug} not found`,
                    );
                }
                return {
                    ...tile,
                    uuid: uuidv4(),
                    properties: {
                        ...tile.properties,
                        savedChartUuid: savedChart.uuid,
                    },
                } as DashboardTile;
            }
            return tile as DashboardTile;
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
                uuidsToSlugs = await this.savedChartModel.getSlugsForUuids(
                    uuids,
                );
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
        spaces: Omit<SpaceSummary, 'userAccess'>[],
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        return content.filter((c) => {
            const space = spaces.find((s) => s.uuid === c.spaceUuid);
            if (!space) return false;
            return hasViewAccessToSpace(
                user,
                space,
                spacesAccess[space.uuid] ?? [],
            );
        });
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
            this.dashboardModel.getById(dash.uuid),
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

        const transformedDashboards = dashboardsWithAccess.map((dashboard) =>
            CoderService.transformDashboard(dashboard, spaces),
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
        const missingIds = CoderService.getMissingIds(chartIds, charts);

        // get all spaces to map  dashboardSlug
        const dashboardUuids = charts.reduce<string[]>((acc, chart) => {
            if (chart.dashboardUuid) {
                acc.push(chart.dashboardUuid);
            }
            return acc;
        }, []);
        const dashboards = await this.dashboardModel.getSlugsForUuids(
            dashboardUuids,
        );

        const transformedCharts = charts.map((chart) =>
            CoderService.transformChart(chart, spaces, dashboards),
        );

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

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
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
                    chartAsCode.spaceSlug,
                    user,
                );

            console.info(
                `Creating chart "${chartAsCode.name}" on project ${projectUuid}`,
            );

            let createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            };

            if (chartAsCode.dashboardSlug) {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slug: chartAsCode.dashboardSlug,
                });

                let dashboardUuid: string = dashboard?.uuid;
                if (!dashboard) {
                    // Charts within dashboards need a dashboard first,
                    // so we will create a placeholder dashboard for this
                    // which we can update later
                    console.debug(
                        'Creating placeholder dashboard for chart within dashboard',
                        chartAsCode.slug,
                    );
                    const newDashboard = await this.dashboardModel.create(
                        space.uuid,
                        {
                            name: friendlyName(chartAsCode.dashboardSlug),
                            tiles: [],
                            slug: chartAsCode.dashboardSlug,
                            forceSlug: true,
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );

                    dashboardUuid = newDashboard.uuid;
                }
                createChart = {
                    ...chartAsCode,
                    spaceUuid: null,
                    dashboardUuid,
                    updatedByUser: user,
                    forceSlug: true,
                };
            } else {
                createChart = {
                    ...chartAsCode,
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
                `Finished creating chart "${chartAsCode.name}" on project ${projectUuid}`,
            );
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newChart,
                            spaceSlug: chartAsCode.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                chartAsCode.spaceSlug,
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
            `Updating chart "${chartAsCode.name}" on project ${projectUuid}`,
        );
        // Although, promotionService already upsertSpaces
        // We want to create a new space based on the slug, not the uuid
        // Then there is no need to do promoteService.upsertSpaces
        const { space } = await this.getOrCreateSpace(
            projectUuid,
            chartAsCode.spaceSlug,
            user,
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
                ...chartAsCode,
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
        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
        );

        console.info(
            `Finished updating chart "${chartAsCode.name}" on project ${projectUuid}: ${promotionChanges.charts[0].action}`,
        );

        return promotionChanges;
    }

    async getOrCreateSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
    ): Promise<{ space: Omit<SpaceSummary, 'userAccess'>; created: boolean }> {
        const [existingSpace] = await this.spaceModel.find({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });

        if (existingSpace !== undefined) {
            const spacesAccess = await this.spaceModel.getUserSpacesAccess(
                user.userUuid,
                [existingSpace.uuid],
            );
            if (
                hasViewAccessToSpace(
                    user,
                    existingSpace,
                    spacesAccess[existingSpace.uuid] ?? [],
                )
            ) {
                return { space: existingSpace, created: false };
            }
            throw new ForbiddenError(
                "You don't have access to a private space",
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
        const newSpaces: Space[] = [];
        for await (const currentPath of remainingPath) {
            if (!parentPath) {
                parentPath = currentPath;
            } else {
                parentPath = `${parentPath}.${currentPath}`;
            }

            const newSpace = await this.spaceModel.createSpace(
                {
                    isPrivate: closestAncestorSpace?.isPrivate ?? true,
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
                    const newSpaceWithAccess =
                        await this.spaceModel.getFullSpace(parentSpaceUuid);

                    const userAccessPromises = newSpaceWithAccess.access
                        .filter((access) => access.hasDirectAccess)
                        .map((userAccess) =>
                            this.spaceModel.addSpaceAccess(
                                newSpace.uuid,
                                userAccess.userUuid,
                                userAccess.role,
                            ),
                        );

                    const groupAccessPromises =
                        newSpaceWithAccess.groupsAccess.map((groupAccess) =>
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
                access: [],
            },
            created: true,
        };
    }

    async upsertDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        dashboardAsCode: DashboardAsCode,
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
        const [dashboardSummary] = await this.dashboardModel.find({
            slug,
            projectUuid,
        });
        const tilesWithUuids = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardAsCode.tiles,
        );

        const dashboardFilters = CoderService.getFiltersWithTileUuids(
            dashboardAsCode,
            tilesWithUuids,
        );
        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardAsCode.spaceSlug,
                    user,
                );

            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardAsCode,
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
                            spaceSlug: dashboardAsCode.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                dashboardAsCode.spaceSlug,
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

        const dashboard = await this.dashboardModel.getById(
            dashboardSummary.uuid,
        );

        console.info(
            `Updating dashboard "${dashboard.name}" on project ${projectUuid}`,
        );

        const dashboardWithUuids = {
            ...dashboardAsCode,
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
            dashboardAsCode.spaceSlug,
            user,
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
