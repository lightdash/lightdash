import {
    type ApiAiAgentThreadMessageVizQuery,
    type CreateSavedChartVersion,
    type DashboardVisualization,
} from '@lightdash/common';
import { getChartConfigFromAiAgentVizConfig } from './echarts';

function convertAiVisualizationToCreateSavedChartVersion(
    aiVizData: ApiAiAgentThreadMessageVizQuery,
    dashboardVisualization: DashboardVisualization,
    options: {
        name: string;
        description?: string;
        dashboardUuid?: string;
        dashboardName?: string;
        userId?: string;
        maxQueryLimit?: number;
    },
): CreateSavedChartVersion {
    const { query, metadata } = aiVizData;
    const { metricQuery } = query;

    const chartConfig = getChartConfigFromAiAgentVizConfig({
        vizConfig: dashboardVisualization,
        metricQuery,
        rows: [], // Empty rows array - charts will load data dynamically
        maxQueryLimit: options.maxQueryLimit,
        fieldsMap: aiVizData.query.fields,
    });

    // Create table config with proper column order
    const tableConfig = {
        columnOrder: [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map((tc) => tc.name),
        ],
    };

    const result: CreateSavedChartVersion = {
        description: options.description || metadata.description || undefined,
        tableName: metricQuery.exploreName,
        metricQuery,
        chartConfig: chartConfig.echartsConfig,
        tableConfig,
        dashboardUuid: options.dashboardUuid,
        dashboardName: options.dashboardName,
    };

    return result;
}

export function convertDashboardVisualizationsToChartData(
    dashboardConfig: {
        title: string;
        description: string;
        visualizations: DashboardVisualization[];
    },
    vizQueryResults: ApiAiAgentThreadMessageVizQuery[],
    options: {
        dashboardUuid?: string;
        dashboardName?: string;
        userId?: string;
        maxQueryLimit?: number;
    },
): CreateSavedChartVersion[] {
    if (dashboardConfig.visualizations.length !== vizQueryResults.length) {
        throw new Error(
            `Mismatch between visualization count (${dashboardConfig.visualizations.length}) and query results count (${vizQueryResults.length})`,
        );
    }

    return dashboardConfig.visualizations.map((visualization, index) => {
        const vizQueryResult = vizQueryResults[index];

        return convertAiVisualizationToCreateSavedChartVersion(
            vizQueryResult,
            visualization,
            {
                name: visualization.title,
                description: visualization.description,
                dashboardUuid: options.dashboardUuid,
                dashboardName: options.dashboardName,
                userId: options.userId,
                maxQueryLimit: options.maxQueryLimit,
            },
        );
    });
}
