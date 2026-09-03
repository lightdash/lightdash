import {
    buildDeepResearchVizConfig,
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiDeepResearchChartData,
} from '@lightdash/common';
import { useMemo } from 'react';
import { getOpenInExploreUrl } from '../../../../../utils/getOpenInExploreUrl';

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
