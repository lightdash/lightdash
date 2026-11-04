import {
    CartesianSeriesType,
    isCartesianChartConfig,
    isCompleteLayout,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
    type Series,
} from '@lightdash/common';
import { type InfiniteQueryResults } from '../useQueryResults';
import {
    getExpectedSeriesMap,
    isPivotSeriesOrderDeterminedByQuery,
    mergeExistingAndExpectedSeries,
} from './utils';

/**
 * Expected series for a read-only chart, passed to VisualizationProvider's `computedSeries`
 * so fallback colors cover every rendered series; otherwise pivoted series draw transparent.
 */
export const computeChartSeries = (
    chart: Pick<SavedChart, 'chartConfig'> & {
        metricQuery: Pick<MetricQuery, 'sorts'>;
    },
    validPivotDimensions: string[] | undefined,
    resultData: InfiniteQueryResults | undefined,
    itemsMap: ItemsMap,
): Series[] => {
    if (!chart.chartConfig || !resultData || resultData.rows.length === 0) {
        return [];
    }

    if (
        isCartesianChartConfig(chart.chartConfig.config) &&
        isCompleteLayout(chart.chartConfig.config.layout)
    ) {
        const firstSerie = chart.chartConfig.config.eChartsConfig.series?.[0];

        const expectedSeriesMap = getExpectedSeriesMap({
            defaultSmooth: firstSerie?.smooth,
            defaultShowSymbol: firstSerie?.showSymbol,
            defaultAreaStyle: firstSerie?.areaStyle,
            defaultCartesianType: CartesianSeriesType.BAR,
            isStacked: false,
            pivotKeys: validPivotDimensions,
            resultsData: resultData,
            xField: chart.chartConfig.config.layout.xField,
            yFields: chart.chartConfig.config.layout.yField,
            defaultLabel: firstSerie?.label,
            defaultStackLabel: firstSerie?.stackLabel,
            itemsMap,
            columnLimit: chart.chartConfig.config.columnLimit,
            existingSeries: chart.chartConfig.config.eChartsConfig.series,
        });
        const sortedByPivot = isPivotSeriesOrderDeterminedByQuery(
            validPivotDimensions,
            chart.chartConfig.config.layout.yField,
            chart.metricQuery.sorts,
        );

        const newSeries = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries: chart.chartConfig.config.eChartsConfig.series || [],
            sortedByPivot,
        });
        return newSeries.filter((s) => !s.isFilteredOut);
    }
    return [];
};
