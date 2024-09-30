import { CartesianSeriesType, getItemMap } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import useCartesianChartConfig from './useCartesianChartConfig';
import {
    existingMixedSeries,
    expectedMixedSeriesMap,
    expectedMultiPivotedSeriesMap,
    expectedPivotedSeriesMap,
    expectedSimpleSeriesMap,
    explore,
    groupedMixedSeries,
    mergedMixedSeries,
    multiPivotSeriesMapArgs,
    pivotSeriesMapArgs,
    simpleSeriesMapArgs,
    useCartesianChartConfigParamsMock,
} from './useCartesianChartConfig.mock';
import {
    getExpectedSeriesMap,
    getSeriesGroupedByField,
    mergeExistingAndExpectedSeries,
    sortDimensions,
} from './utils';

describe('sortDimensions', () => {
    test('should not sort anything if no explore', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            undefined,
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual(dimensionIds);
    });

    test('should not sort anything if no dates', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_boolean',
            'dimension_whatever',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual(dimensionIds);
    });

    test('should sort a single date', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_date_1',
            'dimension_boolean',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_date_1',
            'dimension_boolean',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_date_1',
            'dimension_string',
            'dimension_boolean',
        ]);
    });

    test('should sort dates based on columnOrder', () => {
        const dimensionIds = [
            'dimension_string',
            'dimension_date_1',
            'dimension_date_2',
        ];
        const columnOrder = [
            'dimension_string',
            'dimension_date_2',
            'dimension_date_1',
        ];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_date_2',
            'dimension_date_1',
            'dimension_string',
        ]);
    });

    test('should sort timestamp', () => {
        const dimensionIds = ['dimension_string', 'dimension_timestamp'];
        const columnOrder = ['dimension_string', 'dimension_timestamp'];
        const sortedDimensions = sortDimensions(
            dimensionIds,
            getItemMap(explore),
            columnOrder,
        );
        expect(sortedDimensions).toStrictEqual([
            'dimension_timestamp',
            'dimension_string',
        ]);
    });
});

describe('getExpectedSeriesMap', () => {
    test('should return series without pivot', () => {
        expect(getExpectedSeriesMap(simpleSeriesMapArgs)).toStrictEqual(
            expectedSimpleSeriesMap,
        );
    });
    test('should return series with pivot', () => {
        expect(getExpectedSeriesMap(pivotSeriesMapArgs)).toStrictEqual(
            expectedPivotedSeriesMap,
        );
    });
    test('should return series with multi pivot', () => {
        expect(getExpectedSeriesMap(multiPivotSeriesMapArgs)).toStrictEqual(
            expectedMultiPivotedSeriesMap,
        );
    });
});

describe('mergeExistingAndExpectedSeries', () => {
    test('should return empty list when expected series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: {},
                existingSeries: Object.values(expectedSimpleSeriesMap),
            }),
        ).toStrictEqual([]);
    });
    test('should return all expected series when existing series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedSimpleSeriesMap,
                existingSeries: [],
            }),
        ).toStrictEqual(Object.values(expectedSimpleSeriesMap));
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedPivotedSeriesMap,
                existingSeries: [],
            }),
        ).toStrictEqual(Object.values(expectedPivotedSeriesMap));
    });
    test('should return new series in correct order', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedMixedSeriesMap,
                existingSeries: existingMixedSeries,
            }),
        ).toStrictEqual(Object.values(mergedMixedSeries));
    });
});

describe('getSeriesGroupedByField', () => {
    test('should return series grouped by Y field', () => {
        expect(
            getSeriesGroupedByField(Object.values(mergedMixedSeries)),
        ).toStrictEqual(groupedMixedSeries);
    });
});

describe('useCartesianChartConfig', () => {
    test('should default series yAxisIndex to 0', () => {
        const { result } = renderHook(
            // @ts-expect-error partially mock params for hook
            () => useCartesianChartConfig(useCartesianChartConfigParamsMock),
        );

        const series = result.current.validConfig!.eChartsConfig.series!;

        expect(series.length).toBeGreaterThan(0);
        series.forEach((serie) => expect(serie.yAxisIndex).toBe(0));
    });

    test('should set undefined yAxisIndex to 0', () => {
        const seriesFromOldChart = [
            {
                type: CartesianSeriesType.BAR,
                encode: {
                    xRef: {
                        field: 'orders_customer_id',
                    },
                    yRef: {
                        field: 'orders_total_order_amount',
                    },
                },
                yAxisIndex: 1,
            },
            {
                type: CartesianSeriesType.BAR,
                encode: {
                    xRef: {
                        field: 'orders_customer_id',
                    },
                    yRef: {
                        field: 'orders_fulfillment_rate',
                    },
                },
            },
        ];

        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                initialChartConfig: {
                    ...useCartesianChartConfigParamsMock.initialChartConfig,

                    eChartsConfig: {
                        series: seriesFromOldChart,
                    },
                },
            }),
        );

        const series = result.current.validConfig!.eChartsConfig.series!;

        expect(series[0].yAxisIndex).toBe(1);
        expect(series[1].yAxisIndex).toBe(0);
    });
});
