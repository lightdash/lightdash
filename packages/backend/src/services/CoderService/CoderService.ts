import { subject } from '@casl/ability';
import {
    NotFoundError,
    SavedChartDAO,
    SessionUser,
    SpaceSummary,
} from '@lightdash/common';
import { ChartAsCode, currentVersion } from '@lightdash/common/src/types/coder';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
};

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        dashboardModel,
        spaceModel,
        schedulerClient,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
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
            colorPalette: chart.colorPalette,
            slug: chart.slug,
            tableConfig: chart.tableConfig,

            spaceSlug,
            version: currentVersion,
        };
    }

    async getCharts(user: SessionUser, projectUuid: string) {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // TODO handle permissions
        // Filter charts based on user permissions (from private spaces)

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
}
