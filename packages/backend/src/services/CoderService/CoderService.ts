import { subject } from '@casl/ability';
import {
    ChartAsCode,
    CreateSavedChart,
    currentVersion,
    ForbiddenError,
    NotFoundError,
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
        if (chart === undefined) {
            // TODO create space if does not exist
            console.info(
                `Creating chart ${chartAsCode.name} on project ${projectUuid}`,
            );

            const createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
            } = {
                ...chartAsCode,
                updatedByUser: user,
            };
            const newChart = await this.savedChartModel.create(
                projectUuid,
                user.userUuid,
                createChart,
            );
            const spaces = await this.spaceModel.find({
                spaceUuids: [newChart.spaceUuid],
            });

            return {
                chart: CoderService.transformChart(newChart, spaces),
                created: true,
            };
        }
        // update
        console.info(
            `Updating chart ${chartAsCode.name} on project ${projectUuid}`,
        );

        // TODO update space or create if does not exist
        await this.savedChartModel.update(chart.uuid, {
            name: chartAsCode.name,
            description: chartAsCode.description,
        });

        const updatedChart = await this.savedChartModel.createVersion(
            chart.uuid,
            chartAsCode,
            user,
        );
        const spaces = await this.spaceModel.find({
            spaceUuids: [updatedChart.spaceUuid],
        });
        return {
            chart: CoderService.transformChart(updatedChart, spaces),
            created: false,
        };
    }
}
