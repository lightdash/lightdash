import { getUnusedDimensions, type ChartAsCode } from '@lightdash/common';

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
