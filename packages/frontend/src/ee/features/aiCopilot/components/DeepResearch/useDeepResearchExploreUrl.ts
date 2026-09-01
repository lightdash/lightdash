import {
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiDeepResearchChartData,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { useMemo } from 'react';
import { getOpenInExploreUrl } from '../../../../../utils/getOpenInExploreUrl';

export const buildDeepResearchVizConfig = (
    chart: AiDeepResearchChartData,
): ToolRunQueryArgs => {
    const metricQuery = chart.metricQuery;
    return {
        title: chart.title,
        description: '',
        queryConfig: {
            exploreName: metricQuery.exploreName,
            dimensions: metricQuery.dimensions,
            metrics: metricQuery.metrics,
            sorts: metricQuery.sorts.map(({ nullsFirst, ...sort }) => ({
                ...sort,
                ...(nullsFirst == null ? {} : { nullsFirst }),
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

export const useDeepResearchOpenInExploreUrl = (
    chart: AiDeepResearchChartData | undefined,
    projectUuid: string,
) =>
    useMemo(() => {
        if (!chart) {
            return null;
        }
        const webChartConfig = getWebAiChartConfig({
            vizConfig: buildDeepResearchVizConfig(chart),
            metricQuery: chart.metricQuery,
            fieldsMap: chart.fields,
            overrideChartType: chart.chartConfig.defaultVizType,
        });
        if (!webChartConfig.echartsConfig) {
            return null;
        }

        const { pathname, search } = getOpenInExploreUrl({
            metricQuery: chart.metricQuery,
            projectUuid,
            columnOrder: [
                ...chart.metricQuery.dimensions,
                ...chart.metricQuery.metrics,
                ...chart.metricQuery.tableCalculations.map(
                    (calculation) => calculation.name,
                ),
            ],
            pivotColumns: getGroupByDimensions(webChartConfig),
            chartConfig: webChartConfig.echartsConfig,
        });
        return `${pathname}?${search}`;
    }, [chart, projectUuid]);
