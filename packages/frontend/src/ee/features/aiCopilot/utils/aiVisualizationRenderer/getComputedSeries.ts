import {
    AiResultType,
    CartesianSeriesType,
    type ChartConfig,
    ChartType,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { type VisualizationProviderProps } from '../../../../../components/LightdashVisualization/VisualizationProvider';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
} from '../../../../../hooks/cartesianChartConfig/utils';

/**
 * Get the computed series for the chart config from the ai agent viz config
 * This is necessary to compute the series for the chart config from the ai agent viz config as we need to use the same logic as the dashboard chart converter
 */
export const getComputedSeries = ({
    aiResultType,
    echartsConfig,
    metricQuery,
    groupByDimensions,
    resultsData,
    fields,
}: {
    aiResultType: AiResultType;
    echartsConfig: ChartConfig;
    metricQuery: MetricQuery;
    groupByDimensions: string[] | undefined;
    resultsData: VisualizationProviderProps['resultsData'];
    fields: ItemsMap;
}) => {
    if (aiResultType !== AiResultType.QUERY_RESULT) return [];
    if (echartsConfig.type !== ChartType.CARTESIAN) return [];
    if (!echartsConfig.config?.eChartsConfig?.series?.length) return [];
    if (!echartsConfig.config?.layout?.xField) return [];
    if (!echartsConfig.config?.layout?.yField) return [];

    const firstSerie = echartsConfig.config?.eChartsConfig?.series?.[0];

    const expectedSeriesMap = getExpectedSeriesMap({
        defaultSmooth: firstSerie?.smooth,
        defaultShowSymbol: firstSerie?.showSymbol,
        defaultAreaStyle: firstSerie?.areaStyle,
        defaultCartesianType: CartesianSeriesType.BAR,
        availableDimensions: metricQuery.dimensions,
        isStacked: false,
        pivotKeys: groupByDimensions,
        resultsData,
        xField: echartsConfig.config.layout.xField,
        yFields: echartsConfig.config.layout.yField,
        defaultLabel: firstSerie?.label,
        itemsMap: fields,
    });
    const newSeries = mergeExistingAndExpectedSeries({
        expectedSeriesMap,
        existingSeries: echartsConfig.config?.eChartsConfig?.series || [],
    });
    return newSeries;
};
