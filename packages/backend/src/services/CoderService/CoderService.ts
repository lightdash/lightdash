import { subject } from '@casl/ability';
import {
    ChartAsCode,
    CreateSavedChart,
    currentVersion,
    DashboardAsCode,
    DashboardDAO,
    ForbiddenError,
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

        return {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: dashboard.tiles,
            filters: dashboard.filters,
            tabs: dashboard.tabs,
            slug: dashboard.slug,

            spaceSlug,
            version: currentVersion,
            downloadedAt: new Date(),
        };
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
        // But in the future we should fetch them in a single query for optimiziation purposes
        const chartSummaries = await this.savedChartModel.find({ projectUuid });
        const chartPromises = chartSummaries.map((chart) =>
            this.savedChartModel.get(chart.uuid),
        );
        const charts = await Promise.all(chartPromises);

        // get all spaces to map  spaceSlug
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
        const [chart] = await this.savedChartModel.find({
            slug,
            projectUuid,
        });

        // If chart does not exist, we can't use promoteService,
        // since it relies on information it is not available in ChartAsCode, and other uuids
        if (chart === undefined) {
            // TODO create space if does not exist using PromoteService upsertSpaces
            console.info(
                `Creating chart "${chartAsCode.name}" on project ${projectUuid}`,
            );

            const createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
            } = {
                ...chartAsCode,
                dashboardUuid: undefined, // TODO for charts within dashboards, we need to create the dashboard first, use promotion for that
                updatedByUser: user,
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
                spaces: [], // TODO create space if does not exist using PromoteService upsertSpaces
                dashboards: [],
            };
            return promotionChanges;
        }
        console.info(
            `Updating chart "${chartAsCode.name}" on project ${projectUuid}`,
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
            },
        };

        let promotionChanges: PromotionChanges = PromoteService.getChartChanges(
            updatedChart,
            upstreamChart,
        );
        promotionChanges = await this.promoteService.upsertSpaces(
            user,
            promotionChanges,
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
}
