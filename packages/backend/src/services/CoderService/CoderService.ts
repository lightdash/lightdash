import { subject } from '@casl/ability';
import {
    ChartAsCode,
    CreateSavedChart,
    currentVersion,
    DashboardAsCode,
    DashboardChartTileProperties,
    DashboardDAO,
    DashboardTile,
    DashboardTileTypes,
    DashboardTileWithoutUuids,
    ForbiddenError,
    friendlyName,
    NotFoundError,
    PromotedChart,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    SessionUser,
    SpaceSummary,
    UpdatedByUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { PromoteService } from '../PromoteService/PromoteService';

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
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'slug'>[],
    ): ChartAsCode {
        const spaceSlug = spaceSummary.find(
            (space) => space.uuid === chart.spaceUuid,
        )?.slug;
        if (!spaceSlug) {
            throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
        }

        return {
            name: chart.name,
            description: chart.description,
            tableName: chart.tableName,
            updatedAt: chart.updatedAt,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            dashboardUuid: chart.dashboardUuid,
            slug: chart.slug,
            tableConfig: chart.tableConfig,

            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
        };
    }

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummary, 'uuid' | 'slug'>[],
    ): DashboardAsCode {
        const spaceSlug = spaceSummary.find(
            (space) => space.uuid === dashboard.spaceUuid,
        )?.slug;
        if (!spaceSlug) {
            throw new NotFoundError(`Space ${dashboard.spaceUuid} not found`);
        }

        const tilesWithoutUuids: DashboardTileWithoutUuids[] =
            dashboard.tiles.map((tile) => {
                const tileWithoutUuid: DashboardTileWithoutUuids = {
                    ...tile,
                    properties: { ...tile.properties },
                };
                delete tileWithoutUuid.uuid;
                if ('savedChartUuid' in tileWithoutUuid.properties) {
                    delete tileWithoutUuid.properties.savedChartUuid;
                }
                if ('savedSqlUuid' in tileWithoutUuid.properties) {
                    delete tileWithoutUuid.properties.savedSqlUuid;
                }
                if (
                    'savedSemanticViewerChartUuid' in tileWithoutUuid.properties
                ) {
                    delete tileWithoutUuid.properties
                        .savedSemanticViewerChartUuid;
                }
                return tileWithoutUuid;
            });

        return {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: tilesWithoutUuids,
            filters: dashboard.filters,
            tabs: dashboard.tabs,
            slug: dashboard.slug,

            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
        };
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileWithoutUuids[],
    ): Promise<DashboardTile[]> {
        const isChartTile = (
            tile: DashboardTileWithoutUuids,
        ): tile is DashboardTileWithoutUuids & {
            properties: { chartSlug: string };
        } =>
            tile.type === DashboardTileTypes.SAVED_CHART ||
            tile.type === DashboardTileTypes.SQL_CHART ||
            tile.type === DashboardTileTypes.SEMANTIC_VIEWER_CHART;

        const chartSlugs: string[] = tiles.reduce<string[]>(
            (acc, tile) =>
                isChartTile(tile) ? [...acc, tile.properties.chartSlug] : acc,
            [],
        );
        const charts = await this.savedChartModel.getChartsForProject(
            projectUuid,
            { slugs: chartSlugs },
        );

        return tiles.map((tile) => {
            if (isChartTile(tile)) {
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
                    properties: {
                        ...tile.properties,
                        savedChartUuid: savedChart.uuid,
                    },
                } as DashboardTile;
            }
            return tile as DashboardTile;
        });
    }

    async getDashboards(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // TODO allow more than just admins
        // Filter dashboards based on user permissions (from private spaces)
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        // TODO
        // We need to get the dashboards and all the dashboards config
        // At the moment we are going to fetch them all in individual queries
        // But in the future we should fetch them in a single query for optimization purposes
        const dashboardSummaries = await this.dashboardModel.find({
            projectUuid,
        });

        const dashboardPromises = dashboardSummaries.map((chart) =>
            this.dashboardModel.getById(chart.uuid),
        );
        const dashboards = await Promise.all(dashboardPromises);

        // get all spaces to map  spaceSlug
        const spaceUuids = dashboards.map((dashboard) => dashboard.spaceUuid);
        const spaces = await this.spaceModel.find({ spaceUuids });
        return dashboards.map((dashboard) =>
            CoderService.transformDashboard(dashboard, spaces),
        );
    }

    async getCharts(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // TODO allow more than just admins
        // Filter charts based on user permissions (from private spaces)
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        // TODO
        // We need to get the charts and all the chart config
        // At the moment we are going to fetch them all in individual queries
        // But in the future we should fetch them in a single query for optimization purposes
        const charts = await this.savedChartModel.getChartsForProject(
            projectUuid,
        );

        // get all spaces to map spaceSlug
        const spaceUuids = charts.map((chart) => chart.spaceUuid);
        const spaces = await this.spaceModel.find({ spaceUuids });
        return charts.map((chart) =>
            CoderService.transformChart(chart, spaces),
        );
    }

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
    ) {
        // TODO handle permissions in spaces
        // TODO allow more than just admins
        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const [chart] = await this.savedChartModel.getChartsForProject(
            projectUuid,
            { slugs: [slug] },
        );

        // If chart does not exist, we can't use promoteService,
        // since it relies on information it is not available in ChartAsCode, and other uuids
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

            const createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            } = {
                ...chartAsCode,
                spaceUuid: space.uuid,
                dashboardUuid: undefined, // TODO for charts within dashboards, we need to create the dashboard first, use promotion for that
                updatedByUser: user,
                forceSlug: true, // do not generate a new unique slug, use the one from chart as code , at this point we know it is going to be unique on this project
            };

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
        let promotionChanges: PromotionChanges = PromoteService.getChartChanges(
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
        const [space] = await this.spaceModel.find({
            slug: spaceSlug,
            projectUuid,
        });

        if (space !== undefined) return { space, created: false };

        console.info(`Creating new public space with slug ${spaceSlug}`);
        const newSpace = await this.spaceModel.createSpace(
            projectUuid,
            friendlyName(spaceSlug),
            user.userId,
            false,
            spaceSlug,
            true, // forceSameSlug
        );
        return {
            space: {
                ...newSpace,
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
        // TODO handle permissions in spaces
        // TODO allow more than just admins

        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
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

        // If chart does not exist, we can't use promoteService,
        // since it relies on information it is not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardAsCode.spaceSlug,
                    user,
                );

            const tilesWithUuids = await this.convertTileWithSlugsToUuids(
                projectUuid,
                dashboardAsCode.tiles,
            );
            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardAsCode,
                    tiles: tilesWithUuids,
                    forceSlug: true,
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

        const tilesWithUuids = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardAsCode.tiles,
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

        // TODO Check permissions for all chart tiles
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.promoteService.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
            );

        // TODO Right now dashboards on promote service always update dashboards
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
