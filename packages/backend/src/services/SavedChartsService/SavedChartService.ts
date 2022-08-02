import { subject } from '@casl/ability';
import {
    ChartType,
    countTotalFilterRules,
    CreateSavedChart,
    CreateSavedChartVersion,
    ForbiddenError,
    SavedChart,
    SessionUser,
    UpdateMultipleSavedChart,
    UpdateSavedChart,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { CreateSavedChartOrVersionEvent } from '../../analytics/LightdashAnalytics';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';

type Dependencies = {
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
};

export class SavedChartService {
    private readonly projectModel: ProjectModel;

    private readonly savedChartModel: SavedChartModel;

    constructor(dependencies: Dependencies) {
        this.projectModel = dependencies.projectModel;
        this.savedChartModel = dependencies.savedChartModel;
    }

    static getCreateEventProperties(
        savedChart: SavedChart,
    ): CreateSavedChartOrVersionEvent['properties'] {
        return {
            projectId: savedChart.projectUuid,
            savedQueryId: savedChart.uuid,
            dimensionsCount: savedChart.metricQuery.dimensions.length,
            metricsCount: savedChart.metricQuery.metrics.length,
            filtersCount: countTotalFilterRules(savedChart.metricQuery.filters),
            sortsCount: savedChart.metricQuery.sorts.length,
            tableCalculationsCount:
                savedChart.metricQuery.tableCalculations.length,
            pivotCount: (savedChart.pivotConfig?.columns || []).length,
            chartType: savedChart.chartConfig.type,
            cartesian:
                savedChart.chartConfig.type === ChartType.CARTESIAN
                    ? {
                          xAxisCount: (
                              savedChart.chartConfig.config.eChartsConfig
                                  .xAxis || []
                          ).length,
                          yAxisCount: (
                              savedChart.chartConfig.config.eChartsConfig
                                  .yAxis || []
                          ).length,
                          seriesTypes: (
                              savedChart.chartConfig.config.eChartsConfig
                                  .series || []
                          ).map(({ type }) => type),
                          seriesCount: (
                              savedChart.chartConfig.config.eChartsConfig
                                  .series || []
                          ).length,
                      }
                    : undefined,
        };
    }

    async createVersion(
        user: SessionUser,
        savedChartUuid: string,
        data: CreateSavedChartVersion,
    ): Promise<SavedChart> {
        const { organizationUuid, projectUuid } =
            await this.savedChartModel.get(savedChartUuid);

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const savedChart = await this.savedChartModel.createVersion(
            savedChartUuid,
            data,
            user,
        );
        analytics.track({
            event: 'saved_chart_version.created',
            userId: user.userUuid,
            properties: SavedChartService.getCreateEventProperties(savedChart),
        });
        return savedChart;
    }

    async update(
        user: SessionUser,
        savedChartUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChart> {
        const { organizationUuid, projectUuid } =
            await this.savedChartModel.get(savedChartUuid);

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const savedChart = await this.savedChartModel.update(
            savedChartUuid,
            data,
        );
        analytics.track({
            event: 'saved_chart.updated',
            userId: user.userUuid,
            properties: {
                projectId: savedChart.projectUuid,
                savedQueryId: savedChartUuid,
            },
        });
        return savedChart;
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: string,
        data: UpdateMultipleSavedChart[],
    ): Promise<SavedChart[]> {
        const project = await this.projectModel.get(projectUuid);

        if (
            user.ability.cannot(
                'update',
                subject('SavedChart', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const savedCharts = await this.savedChartModel.updateMultiple(data);

        return savedCharts;
    }

    async delete(user: SessionUser, savedChartUuid: string): Promise<void> {
        const { organizationUuid, projectUuid } =
            await this.savedChartModel.get(savedChartUuid);

        if (
            user.ability.cannot(
                'delete',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const deletedChart = await this.savedChartModel.delete(savedChartUuid);
        analytics.track({
            event: 'saved_chart.deleted',
            userId: user.userUuid,
            properties: {
                savedQueryId: deletedChart.uuid,
                projectId: deletedChart.projectUuid,
            },
        });
    }

    async get(savedChartUuid: string, user: SessionUser): Promise<SavedChart> {
        const savedChart = await this.savedChartModel.get(savedChartUuid);
        if (user.ability.cannot('view', subject('SavedChart', savedChart))) {
            throw new ForbiddenError();
        }
        return savedChart;
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        savedChart: CreateSavedChart,
    ): Promise<SavedChart> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
                'create',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const newSavedChart = await this.savedChartModel.create(projectUuid, {
            ...savedChart,
            updatedByUser: user,
        });
        analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties:
                SavedChartService.getCreateEventProperties(newSavedChart),
        });
        return newSavedChart;
    }

    async duplicate(
        user: SessionUser,
        projectUuid: string,
        chartUuid: string,
    ): Promise<SavedChart> {
        const chart = await this.savedChartModel.get(chartUuid);
        if (user.ability.cannot('create', subject('SavedChart', chart))) {
            throw new ForbiddenError();
        }
        const duplicatedChart = {
            ...chart,
            name: `Copy of ${chart.name}`,
            updatedByUser: user,
        };
        const newSavedChart = await this.savedChartModel.create(
            projectUuid,
            duplicatedChart,
        );
        const newSavedChartProperties =
            SavedChartService.getCreateEventProperties(newSavedChart);

        analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties: {
                ...newSavedChartProperties,
                duplicated: true,
            },
        });

        analytics.track({
            event: 'duplicated_chart_created',
            userId: user.userUuid,
            properties: {
                ...newSavedChartProperties,
                newSavedQueryId: newSavedChartProperties.savedQueryId,
                duplicateOfSavedQueryId: chartUuid,
            },
        });
        return newSavedChart;
    }
}
