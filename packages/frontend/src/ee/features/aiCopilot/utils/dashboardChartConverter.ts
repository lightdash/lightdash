import {
    getWebAiChartConfig,
    type AiAgentChartTypeOption,
    type ApiAiAgentThreadMessageVizQuery,
    type ChartConfig,
    type CreateSavedChartVersion,
    type DashboardV2Visualization,
    type DashboardVisualization,
} from '@lightdash/common';

export type VizQueryWithOverrides = ApiAiAgentThreadMessageVizQuery & {
    expandedChartConfig: ChartConfig | undefined;
    selectedChartType: AiAgentChartTypeOption | undefined;
};

function convertAiVisualizationToCreateSavedChartVersion(
    aiVizData: VizQueryWithOverrides,
    dashboardVisualization: DashboardVisualization | DashboardV2Visualization,
    options: {
        name: string;
        description?: string;
        dashboardUuid?: string;
        dashboardName?: string;
        userId?: string;
        maxQueryLimit?: number;
    },
): CreateSavedChartVersion {
    const { query, metadata, expandedChartConfig, selectedChartType } =
        aiVizData;
    const { metricQuery } = query;

    // Use expanded chart config if available (user made custom changes to the chart),
    // otherwise generate config from dashboard visualization with chart type override
    const finalChartConfig =
        expandedChartConfig ??
        getWebAiChartConfig({
            vizConfig: dashboardVisualization,
            metricQuery,
            maxQueryLimit: options.maxQueryLimit,
            fieldsMap: aiVizData.query.fields,
            overrideChartType: selectedChartType ?? undefined,
        }).echartsConfig;

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
        chartConfig: finalChartConfig,
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
        visualizations: (DashboardVisualization | DashboardV2Visualization)[];
    },
    vizQueryResults: VizQueryWithOverrides[],
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
