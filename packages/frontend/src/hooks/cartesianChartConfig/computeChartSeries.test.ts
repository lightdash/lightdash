import {
    CartesianSeriesType,
    ChartType,
    getSeriesId,
    type ChartConfig,
    type Series,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { type InfiniteQueryResults } from '../useQueryResults';
import { computeChartSeries } from './computeChartSeries';
import {
    buildInfiniteQueryResults,
    expectedPivotedSeriesMap,
    expectedSimpleSeriesMap,
    pivotSeriesMapArgs,
    simpleSeriesMapArgs,
} from './useCartesianChartConfig.mock';

// Saved without pivot values, as AI-generated charts are
const storedSeries: Series[] = ['my_metric', 'my_second_metric'].map(
    (field) => ({
        type: CartesianSeriesType.BAR,
        encode: {
            xRef: { field: 'my_dimension' },
            yRef: { field },
        },
    }),
);

const cartesianChartConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'my_dimension',
            yField: ['my_metric', 'my_second_metric'],
        },
        eChartsConfig: { series: storedSeries },
    },
};

const chart = {
    chartConfig: cartesianChartConfig,
    metricQuery: { sorts: [] },
};

const seriesIds = (series: Series[]) => series.map(getSeriesId).sort();

describe('computeChartSeries', () => {
    test('expands stored series without pivot values into one series per pivot value', () => {
        const series = computeChartSeries(
            chart,
            ['dimension_x'],
            pivotSeriesMapArgs.resultsData as InfiniteQueryResults,
            {},
        );

        expect(seriesIds(series)).toEqual(
            Object.keys(expectedPivotedSeriesMap).sort(),
        );
        expect(
            series.every((s) => s.encode.yRef.pivotValues?.length === 1),
        ).toBe(true);
    });

    test('keeps unpivoted series as stored', () => {
        const series = computeChartSeries(
            chart,
            undefined,
            simpleSeriesMapArgs.resultsData as InfiniteQueryResults,
            {},
        );

        expect(seriesIds(series)).toEqual(
            Object.keys(expectedSimpleSeriesMap).sort(),
        );
    });

    test('returns no series before rows arrive', () => {
        const series = computeChartSeries(
            chart,
            ['dimension_x'],
            buildInfiniteQueryResults({ rows: [] }),
            {},
        );

        expect(series).toEqual([]);
    });

    test('returns no series for non-cartesian charts', () => {
        const series = computeChartSeries(
            {
                chartConfig: { type: ChartType.TABLE, config: {} },
                metricQuery: { sorts: [] },
            },
            ['dimension_x'],
            pivotSeriesMapArgs.resultsData as InfiniteQueryResults,
            {},
        );

        expect(series).toEqual([]);
    });
});
