import {
    CartesianSeriesType,
    getItemMap,
    type Series,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: async () => ({ data: { enabled: false } }),
}));

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

    describe('with columnLimit', () => {
        test('should return all series when columnLimit covers all pivot groups', () => {
            const allResult = getExpectedSeriesMap(pivotSeriesMapArgs);

            const result = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: 2,
            });
            expect(Object.keys(result)).toStrictEqual(Object.keys(allResult));
        });

        test('should return all series when columnLimit exceeds available', () => {
            const allResult = getExpectedSeriesMap(pivotSeriesMapArgs);

            const result = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: 100,
            });
            expect(Object.keys(result)).toStrictEqual(Object.keys(allResult));
        });

        test('should not affect series without pivot', () => {
            const result = getExpectedSeriesMap({
                ...simpleSeriesMapArgs,
                columnLimit: 1,
            });
            expect(result).toStrictEqual(expectedSimpleSeriesMap);
        });

        test('should treat columnLimit of 0 as no limit', () => {
            const allResult = getExpectedSeriesMap(pivotSeriesMapArgs);
            const result = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: 0,
            });
            expect(Object.keys(result)).toStrictEqual(Object.keys(allResult));
        });

        test('should treat negative columnLimit as no limit', () => {
            const allResult = getExpectedSeriesMap(pivotSeriesMapArgs);
            const result = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: -5,
            });
            expect(Object.keys(result)).toStrictEqual(Object.keys(allResult));
        });

        test('should return identical result when columnLimit is undefined (flag-off path)', () => {
            const withoutLimit = getExpectedSeriesMap(pivotSeriesMapArgs);
            const withUndefinedLimit = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: undefined,
            });
            expect(Object.keys(withUndefinedLimit)).toStrictEqual(
                Object.keys(withoutLimit),
            );
        });

        test('should keep all metrics for the first pivot group when columnLimit is 1', () => {
            const result = getExpectedSeriesMap({
                ...pivotSeriesMapArgs,
                columnLimit: 1,
            });
            const keys = Object.keys(result);
            expect(keys).toHaveLength(2);
            expect(keys).toStrictEqual([
                'my_dimension|my_metric.dimension_x.a',
                'my_dimension|my_second_metric.dimension_x.a',
            ]);
        });
    });
});

describe('mergeExistingAndExpectedSeries', () => {
    test('should return empty list when expected series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: {},
                existingSeries: Object.values(expectedSimpleSeriesMap),
                sortedByPivot: false,
            }),
        ).toStrictEqual([]);
    });
    test('should return all expected series when existing series is empty', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedSimpleSeriesMap,
                existingSeries: [],
                sortedByPivot: false,
            }),
        ).toStrictEqual(Object.values(expectedSimpleSeriesMap));
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedPivotedSeriesMap,
                existingSeries: [],
                sortedByPivot: false,
            }),
        ).toStrictEqual(Object.values(expectedPivotedSeriesMap));
    });
    test('should return new series in correct order when sorted by pivot', () => {
        expect(
            mergeExistingAndExpectedSeries({
                expectedSeriesMap: expectedMixedSeriesMap,
                existingSeries: existingMixedSeries,
                sortedByPivot: true,
            }),
        ).toStrictEqual(Object.values(mergedMixedSeries));
    });
    test('should mark series beyond column limit as isFilteredOut', () => {
        // Simulate columnLimit=1: expectedSeriesMap only has dimension_x.a series
        const limitedExpectedMap: Record<string, Series> = {
            'my_dimension|my_metric.dimension_x.a':
                expectedPivotedSeriesMap[
                    'my_dimension|my_metric.dimension_x.a'
                ],
            'my_dimension|my_second_metric.dimension_x.a':
                expectedPivotedSeriesMap[
                    'my_dimension|my_second_metric.dimension_x.a'
                ],
        };

        // existingSeries has all 4 series (both a and b pivot values)
        const allSeries = Object.values(expectedPivotedSeriesMap);

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: limitedExpectedMap,
            existingSeries: allSeries,
            sortedByPivot: false,
        });

        // dimension_x.a series should NOT be filtered out
        const aSeries = result.filter(
            (s) => s.encode.yRef.pivotValues?.[0]?.value === 'a',
        );
        expect(aSeries).toHaveLength(2);
        aSeries.forEach((s) => expect(s.isFilteredOut).toBeFalsy());

        // dimension_x.b series should be marked as filtered out
        const bSeries = result.filter(
            (s) => s.encode.yRef.pivotValues?.[0]?.value === 'b',
        );
        expect(bSeries).toHaveLength(2);
        bSeries.forEach((s) => expect(s.isFilteredOut).toBe(true));
    });

    test('should mark multi-pivot series beyond column limit as isFilteredOut, not drop them', () => {
        // Simulate columnLimit=1 on a 2-dimension pivot:
        // expectedSeriesMap only has the first pivot group (dimension_x.a.dimension_y.a)
        const limitedExpectedMap: Record<string, Series> = {
            'my_dimension|my_metric.dimension_x.a.dimension_y.a':
                expectedMultiPivotedSeriesMap[
                    'my_dimension|my_metric.dimension_x.a.dimension_y.a'
                ],
        };

        // existingSeries has all 4 multi-pivot series
        const allSeries = Object.values(expectedMultiPivotedSeriesMap);

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: limitedExpectedMap,
            existingSeries: allSeries,
            sortedByPivot: false,
        });

        // The first pivot group should NOT be filtered out
        const expectedSeries = result.filter(
            (s) =>
                s.encode.yRef.pivotValues?.[0]?.value === 'a' &&
                s.encode.yRef.pivotValues?.[1]?.value === 'a',
        );
        expect(expectedSeries).toHaveLength(1);
        expect(expectedSeries[0].isFilteredOut).toBeFalsy();

        // All other series should be marked isFilteredOut (not dropped)
        const filteredSeries = result.filter(
            (s) =>
                !(
                    s.encode.yRef.pivotValues?.[0]?.value === 'a' &&
                    s.encode.yRef.pivotValues?.[1]?.value === 'a'
                ),
        );
        expect(filteredSeries.length).toBeGreaterThan(0);
        filteredSeries.forEach((s) => expect(s.isFilteredOut).toBe(true));

        // Total should be all 4 series (none dropped)
        expect(result).toHaveLength(allSeries.length);
    });

    test('should not mark any series as isFilteredOut when expectedSeriesMap is full (flag-off path)', () => {
        const allSeries = Object.values(expectedPivotedSeriesMap);

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: expectedPivotedSeriesMap,
            existingSeries: allSeries,
            sortedByPivot: false,
        });

        expect(result).toHaveLength(allSeries.length);
        result.forEach((s) => expect(s.isFilteredOut).toBeFalsy());
    });

    test('should insert new pivot category in sorted position, not at end', () => {
        const defaultProps = {
            label: undefined,
            type: CartesianSeriesType.BAR,
            areaStyle: undefined,
            stack: undefined,
            showSymbol: undefined,
            smooth: undefined,
            yAxisIndex: 0,
        };

        // Existing series: has categories "a" and "c"
        const existingSeries: Series[] = [
            {
                ...defaultProps,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'version', value: 'a' }],
                    },
                },
            },
            {
                ...defaultProps,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'version', value: 'c' }],
                    },
                },
            },
        ];

        // Expected series from new query results (sorted): a, b, c
        // "b" is the newly introduced category
        const expectedSeriesMap: Record<string, Series> = {
            'date|metric.version.a': {
                ...defaultProps,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'version', value: 'a' }],
                    },
                },
            },
            'date|metric.version.b': {
                ...defaultProps,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'version', value: 'b' }],
                    },
                },
            },
            'date|metric.version.c': {
                ...defaultProps,
                encode: {
                    xRef: { field: 'date' },
                    yRef: {
                        field: 'metric',
                        pivotValues: [{ field: 'version', value: 'c' }],
                    },
                },
            },
        };

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap,
            existingSeries,
            sortedByPivot: true,
        });

        // "b" should be inserted between "a" and "c", not at the end
        expect(result.map((s) => s.encode.yRef.pivotValues?.[0].value)).toEqual(
            ['a', 'b', 'c'],
        );
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

    test('should return undefined columnLimit when feature flag is off', () => {
        const { result } = renderHook(
            // @ts-expect-error partially mock params for hook
            () => useCartesianChartConfig(useCartesianChartConfigParamsMock),
        );

        expect(result.current.columnLimit).toBeUndefined();
    });
});
