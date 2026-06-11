import {
    assertUnreachable,
    getUnusedDimensions,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';

export type ContentWithWarnings =
    | { type: 'dashboard'; content: DashboardAsCode }
    | { type: 'chart'; content: ChartAsCode };

export const getChartContentWarnings = (content: ChartAsCode): string[] => {
    const { unusedDimensions } = getUnusedDimensions({
        chartType: content.chartConfig.type,
        chartConfig: content.chartConfig.config,
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
            return [];
        case 'chart':
            return getChartContentWarnings(content.content);
        default:
            return assertUnreachable(content, 'Invalid content type');
    }
};
