import {
    assertUnreachable,
    ChartType,
    getUnusedDimensions,
    type ChartAsCode,
    type DashboardAsCode,
    type McpDocumentRead,
    type SqlChartAsCode,
} from '@lightdash/common';

export type ContentWithWarnings =
    | { type: 'dashboard'; content: DashboardAsCode }
    | { type: 'chart'; content: ChartAsCode }
    | { type: 'sql_chart'; content: SqlChartAsCode }
    | { type: 'document'; content: McpDocumentRead };

export const getChartContentWarnings = (content: ChartAsCode): string[] => {
    const { unusedDimensions } = getUnusedDimensions({
        chartType: content.chartConfig.type,
        // Viz bindings are as-code-shaped (slug identity) and irrelevant
        // here anyway — getUnusedDimensions only reads cartesian configs.
        chartConfig:
            content.chartConfig.type === ChartType.DATA_APP_VIZ
                ? undefined
                : content.chartConfig.config,
        pivotDimensions: content.pivotConfig?.columns ?? [],
        queryDimensions: content.metricQuery.dimensions,
    });

    if (unusedDimensions.length === 0) {
        return [];
    }

    return [
        `Warning: metricQuery.dimensions includes fields not used by the chart configuration: ${unusedDimensions.join(
            ', ',
        )}. Use each dimension in layout.xField, layout.yField, or pivotConfig.columns, otherwise remove it.`,
    ];
};

export const getContentWarnings = (content: ContentWithWarnings): string[] => {
    switch (content.type) {
        case 'dashboard':
        case 'sql_chart':
        case 'document':
            return [];
        case 'chart':
            return getChartContentWarnings(content.content);
        default:
            return assertUnreachable(content, 'Invalid content type');
    }
};
