import {
    ChartType,
    countTotalFilterRules,
    CreateSavedChart,
    CreateSavedChartVersion,
    SavedChart,
    SessionUser,
    UpdateSavedChart,
} from 'common';
import { analytics } from '../../analytics/client';
import { CreateSavedChartOrVersionEvent } from '../../analytics/LightdashAnalytics';
import { ForbiddenError } from '../../errors';
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
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedChart = await this.savedChartModel.createVersion(
            savedChartUuid,
            data,
        );
        analytics.track({
            event: 'saved_chart_version.created',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: SavedChartService.getCreateEventProperties(savedChart),
        });
        return savedChart;
    }

    async update(
        user: SessionUser,
        savedChartUuid: string,
        data: UpdateSavedChart,
    ): Promise<SavedChart> {
        if (user.ability.cannot('update', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const savedChart = await this.savedChartModel.update(
            savedChartUuid,
            data,
        );
        analytics.track({
            event: 'saved_chart.updated',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                savedQueryId: savedChartUuid,
            },
        });
        return savedChart;
    }

    async delete(user: SessionUser, savedChartUuid: string): Promise<void> {
        if (user.ability.cannot('delete', 'SavedChart')) {
            throw new ForbiddenError();
        }
        await this.savedChartModel.delete(savedChartUuid);
        analytics.track({
            event: 'saved_chart.deleted',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                savedQueryId: savedChartUuid,
            },
        });
    }

    async get(savedChartUuid: string): Promise<SavedChart> {
        return this.savedChartModel.get(savedChartUuid);
    }

    async create(
        user: SessionUser,
        projectUuid: string,
        savedChart: CreateSavedChart,
    ): Promise<SavedChart> {
        if (user.ability.cannot('create', 'SavedChart')) {
            throw new ForbiddenError();
        }
        const newSavedChart = await this.savedChartModel.create(
            projectUuid,
            savedChart,
        );
        analytics.track({
            event: 'saved_chart.created',
            projectId: projectUuid,
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            properties:
                SavedChartService.getCreateEventProperties(newSavedChart),
        });
        return newSavedChart;
    }
}
