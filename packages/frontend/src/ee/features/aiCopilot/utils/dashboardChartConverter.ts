import {
    getGroupByDimensions,
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

    const webAiChartConfig = getWebAiChartConfig({
        vizConfig: dashboardVisualization,
        metricQuery,
        maxQueryLimit: options.maxQueryLimit,
        fieldsMap: aiVizData.query.fields,
        overrideChartType: selectedChartType ?? undefined,
    });

    // Use expanded chart config if available (user made custom changes to the chart),
    // otherwise generate config from dashboard visualization with chart type override
    const finalChartConfig =
        expandedChartConfig ?? webAiChartConfig.echartsConfig;

    // The artifact preview pivots results by the groupBy hint; the saved chart
    // needs the same dimensions persisted as pivotConfig or its series can't
    // bind to the un-pivoted results and the chart renders flat.
    const groupByDimensions = getGroupByDimensions(webAiChartConfig);

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
        pivotConfig: groupByDimensions?.length
            ? { columns: groupByDimensions }
            : undefined,
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
