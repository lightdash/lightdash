import { type ToolRunQueryArgs } from '../AiAgent/schemas/tools/toolRunQueryArgs';
import { type AiDeepResearchChartData } from './types';

export const buildDeepResearchVizConfig = (
    chart: AiDeepResearchChartData,
): ToolRunQueryArgs => {
    const { metricQuery } = chart;
    return {
        title: chart.title,
        description: '',
        queryConfig: {
            exploreName: metricQuery.exploreName,
            dimensions: metricQuery.dimensions,
            metrics: metricQuery.metrics,
            sorts: metricQuery.sorts.map((sort) => ({
                ...sort,
                nullsFirst: sort.nullsFirst ?? null,
            })),
            limit: metricQuery.limit,
            parameters: null,
            customMetrics: null,
            tableCalculations: null,
            filters: null,
        },
        chartConfig: chart.chartConfig,
    };
};
