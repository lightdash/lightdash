import {
    CartesianSeriesType,
    createConditionalFormattingConfigWithSingleColor,
    DimensionType,
    FieldType,
    getItemMap,
    StackType,
    TimeFrames,
    type Dimension,
    type ItemsMap,
    type Series,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: async () => ({ data: { enabled: false } }),
}));

import { type ReferenceLineField } from '../../components/common/ReferenceLine';
import { finalizeTimeAxisOptions } from '../echarts/timezoneShift';
import useCartesianChartConfig, {
    applyReferenceLines,
} from './useCartesianChartConfig';
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
    isPivotSeriesOrderDeterminedByQuery,
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

        test('should return identical result when columnLimit is undefined', () => {
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

    // When a pivot value appears in the data that is NOT in the saved
    // eChartsConfig.series, getExpectedSeriesMap synthesises a fresh series
    // for it. That auto-generated series must inherit stack-label config
    // from the saved series, otherwise getStackTotalSeries (which short-
    // circuits when the first stacked series has no stackLabel.show) drops
    // the synthetic stack-total series and total labels disappear from
    // every bar. Surfaced after #22899 (0.2918.0) extended the
    // metric-sort-driven reorder that can push the synthetic series to
    // index 0.
    test('should propagate defaultStackLabel to every pivoted series', () => {
        const defaultStackLabel = { show: true };
        const result = getExpectedSeriesMap({
            ...pivotSeriesMapArgs,
            defaultStackLabel,
        });
        const series = Object.values(result);
        expect(series.length).toBeGreaterThan(0);
        series.forEach((s) =>
            expect(s.stackLabel).toStrictEqual(defaultStackLabel),
        );
    });

    test('should propagate defaultStackLabel to every non-pivoted series', () => {
        const defaultStackLabel = { show: true };
        const result = getExpectedSeriesMap({
            ...simpleSeriesMapArgs,
            defaultStackLabel,
        });
        const series = Object.values(result);
        expect(series.length).toBeGreaterThan(0);
        series.forEach((s) =>
            expect(s.stackLabel).toStrictEqual(defaultStackLabel),
        );
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

    test('should drop series with different pivot field names, not mark as isFilteredOut', () => {
        const expectedMap: Record<string, Series> = {
            'my_dimension|my_metric.status.open':
                expectedPivotedSeriesMap[
                    'my_dimension|my_metric.dimension_x.a'
                ],
        };
        const modifiedExpected: Record<string, Series> = {
            'my_dimension|my_metric.status.open': {
                ...Object.values(expectedMap)[0],
                encode: {
                    xRef: { field: 'my_dimension' },
                    yRef: {
                        field: 'my_metric',
                        pivotValues: [{ field: 'status', value: 'open' }],
                    },
                },
            },
        };

        const staleSeries: Series[] = [
            {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'my_dimension' },
                    yRef: {
                        field: 'my_metric',
                        pivotValues: [{ field: 'country', value: 'uk' }],
                    },
                },
            },
            {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'my_dimension' },
                    yRef: {
                        field: 'my_metric',
                        pivotValues: [{ field: 'country', value: 'us' }],
                    },
                },
            },
        ];

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: modifiedExpected,
            existingSeries: staleSeries,
            sortedByPivot: false,
        });

        // Stale series with different pivot field should be dropped entirely,
        // NOT retained with isFilteredOut
        expect(result).toHaveLength(1);
        expect(result[0].encode.yRef.pivotValues?.[0]?.field).toBe('status');
        expect(result[0].isFilteredOut).toBeFalsy();
    });

    test('should mark series as isFilteredOut only when pivot field names match', () => {
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

        const allSeries = Object.values(expectedPivotedSeriesMap);

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: limitedExpectedMap,
            existingSeries: allSeries,
            sortedByPivot: false,
        });

        // dimension_x.a series: NOT filtered out (they're expected)
        const aSeries = result.filter(
            (s) => s.encode.yRef.pivotValues?.[0]?.value === 'a',
        );
        aSeries.forEach((s) => expect(s.isFilteredOut).toBeFalsy());

        // dimension_x.b series: marked isFilteredOut (same pivot field, different value)
        const bSeries = result.filter(
            (s) => s.encode.yRef.pivotValues?.[0]?.value === 'b',
        );
        bSeries.forEach((s) => expect(s.isFilteredOut).toBe(true));
    });

    test('should drop (not mark isFilteredOut) stale series when pivot field count differs', () => {
        // Expected series pivots on TWO dimensions: [country, status]
        const expectedMap: Record<string, Series> = {
            'my_dimension|my_metric.country.US.status.open': {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'my_dimension' },
                    yRef: {
                        field: 'my_metric',
                        pivotValues: [
                            { field: 'country', value: 'US' },
                            { field: 'status', value: 'open' },
                        ],
                    },
                },
            },
        };

        // Stale series from an old chart that only pivoted on ONE dimension: [country]
        const staleSeries: Series[] = [
            {
                type: CartesianSeriesType.BAR,
                yAxisIndex: 0,
                encode: {
                    xRef: { field: 'my_dimension' },
                    yRef: {
                        field: 'my_metric',
                        pivotValues: [{ field: 'country', value: 'UK' }],
                    },
                },
            },
        ];

        const result = mergeExistingAndExpectedSeries({
            expectedSeriesMap: expectedMap,
            existingSeries: staleSeries,
            sortedByPivot: false,
        });

        // The stale series should be DROPPED (different pivot schema),
        // not retained with isFilteredOut: true
        const staleInResult = result.filter(
            (s) => s.encode.yRef.pivotValues?.[0]?.value === 'UK',
        );
        expect(staleInResult).toHaveLength(0);
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

    test('backend-driven series order from columnIndex DENSE_RANK overrides a saved-chart series order that disagrees (PROD-2927 / #20435)', () => {
        // Repro: a chart was saved with pivot category order [c, a]. New
        // results introduced category "b" and the backend re-ordered them
        // by DENSE_RANK columnIndex into [a, b, c]. Before #20435 the merge
        // preserved the saved [c, a] order and appended "b" at the end ->
        // [c, a, b], so users had to manually re-order series after every
        // run.
        // Expectation: when sortedByPivot is true, the merged output
        // matches expectedSeriesMap key order verbatim — backend wins over
        // a stale saved-chart order, not just over a missing one. This
        // strengthens the "insert in sorted position" test which only
        // covered an existing series order that was a prefix of the
        // backend order ([a, c] vs [a, b, c]).
        const defaultProps = {
            label: undefined,
            type: CartesianSeriesType.BAR,
            areaStyle: undefined,
            stack: undefined,
            showSymbol: undefined,
            smooth: undefined,
            yAxisIndex: 0,
        };

        // Existing series order is REVERSED relative to the new backend
        // order — [c, a] vs backend's [a, b, c]. This is the case the
        // existing #20435 test does not cover.
        const existingSeries: Series[] = [
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
        ];

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

        // Backend order wins — exact equality, not just inclusion. A
        // regression that re-introduces saved-chart order would either
        // produce [c, a, b] or [c, a, ...] here.
        expect(result.map((s) => s.encode.yRef.pivotValues?.[0].value)).toEqual(
            ['a', 'b', 'c'],
        );
    });
});

describe('isPivotSeriesOrderDeterminedByQuery', () => {
    test('returns false when chart is not pivoted', () => {
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                undefined,
                ['metric'],
                [{ fieldId: 'metric' }],
            ),
        ).toBe(false);
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                [],
                ['metric'],
                [{ fieldId: 'metric' }],
            ),
        ).toBe(false);
    });

    test('returns false when there are no sorts', () => {
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                ['status'],
                ['metric'],
                undefined,
            ),
        ).toBe(false);
        expect(
            isPivotSeriesOrderDeterminedByQuery(['status'], ['metric'], []),
        ).toBe(false);
    });

    test('returns true when sort is on a pivot dimension (PROD-2927)', () => {
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                ['status'],
                ['metric'],
                [{ fieldId: 'status' }],
            ),
        ).toBe(true);
    });

    test('returns true when sort is on a y-axis metric (PROD-2999)', () => {
        // Repro: pivoted chart sorted by metric desc — saved series order
        // ignores the SQL ranking and stays frozen across filter changes.
        // Series order should track the query, so this predicate must fire.
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                ['status'],
                ['total_amount'],
                [{ fieldId: 'total_amount' }],
            ),
        ).toBe(true);
    });

    test('returns false when sort is on a non-pivot, non-metric field (e.g. x-axis dimension)', () => {
        // Manual drag-reorder still wins when the chart sort doesn't
        // determine pivot ranking — sorting by the x-axis dimension does
        // not produce a meaningful series order via DENSE_RANK.
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                ['status'],
                ['metric'],
                [{ fieldId: 'order_date' }],
            ),
        ).toBe(false);
    });

    test('returns true when at least one sort matches even if others do not', () => {
        expect(
            isPivotSeriesOrderDeterminedByQuery(
                ['status'],
                ['metric'],
                [{ fieldId: 'order_date' }, { fieldId: 'metric' }],
            ),
        ).toBe(true);
    });
});

describe('getSeriesGroupedByField', () => {
    test('should return series grouped by Y field', () => {
        expect(
            getSeriesGroupedByField(Object.values(mergedMixedSeries)),
        ).toStrictEqual(groupedMixedSeries);
    });
});

describe('reference-line semantic to physical axis integration', () => {
    const timeField = 'orders_created_day';
    const valueField = 'orders_revenue';
    const stringField = 'orders_status';
    const makeSeries = (yField: string = valueField): Series[] => [
        {
            type: CartesianSeriesType.BAR,
            yAxisIndex: 0,
            encode: {
                xRef: { field: timeField },
                yRef: { field: yField },
            },
        },
    ];
    const timeFieldItem: Dimension = {
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: 'Created month',
        name: timeField,
        sql: '',
        table: 'orders',
        tableLabel: 'Orders',
        type: DimensionType.DATE,
        timeInterval: TimeFrames.MONTH,
    };
    const valueFieldItem: Dimension = {
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: 'Revenue',
        name: valueField,
        sql: '',
        table: 'orders',
        tableLabel: 'Orders',
        type: DimensionType.NUMBER,
    };
    const stringFieldItem: Dimension = {
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: 'Status',
        name: stringField,
        sql: '',
        table: 'orders',
        tableLabel: 'Orders',
        type: DimensionType.STRING,
    };
    const itemsMap: ItemsMap = {
        [timeField]: timeFieldItem,
        [valueField]: valueFieldItem,
        [stringField]: stringFieldItem,
    };
    const editorReferenceLines: ReferenceLineField[] = [
        {
            fieldId: timeField,
            data: {
                uuid: 'date',
                name: 'Year start',
                xAxis: '2024',
            },
        },
        {
            fieldId: valueField,
            data: {
                uuid: 'threshold',
                name: 'Revenue target',
                yAxis: '2024',
            },
        },
    ];

    test.each([
        { orientation: 'vertical', flipAxes: false },
        { orientation: 'flipped', flipAxes: true },
    ])(
        'keeps editor-produced date and numeric lines on their physical axes when $orientation',
        ({ flipAxes }) => {
            const series = applyReferenceLines(
                makeSeries(),
                {
                    xField: timeField,
                    yField: [valueField],
                    flipAxes,
                },
                editorReferenceLines,
            );
            const options = { dataset: { source: [] }, series };
            const timeSlot = flipAxes ? 'yAxis' : 'xAxis';
            const valueSlot = flipAxes ? 'xAxis' : 'yAxis';

            const flagOn = finalizeTimeAxisOptions(options, {
                kind: 'plain',
                flipAxes,
            });
            const data = flagOn.series?.[0].markLine?.data ?? [];
            const dateLine = data.find((line) => line.uuid === 'date');
            const thresholdLine = data.find(
                (line) => line.uuid === 'threshold',
            );

            expect(dateLine?.[timeSlot]).toBe(
                Date.parse('2024-01-01T00:00:00Z'),
            );
            expect(dateLine?.[valueSlot]).toBeUndefined();
            expect(dateLine?.label?.formatter).toBe('Year start');
            expect(thresholdLine?.[valueSlot]).toBe('2024');
            expect(thresholdLine?.[timeSlot]).toBeUndefined();

            // No timezone mode means flag-off options and authored values pass
            // through by reference, after the normal field-aware axis mapping.
            expect(finalizeTimeAxisOptions(options, undefined)).toBe(options);
            expect(series[0].markLine?.data[0][timeSlot]).toBe('2024');
            expect(series[0].markLine?.data[1][valueSlot]).toBe('2024');
        },
    );

    test.each([
        {
            orientation: 'flipped',
            flipAxes: true,
            legacyData: { xAxis: '2024-07-15' },
            expectedTimeSlot: 'yAxis' as const,
            expectedValueSlot: 'xAxis' as const,
        },
        {
            orientation: 'vertical after flip-save-unflip',
            flipAxes: false,
            legacyData: { yAxis: '2024-07-15' },
            expectedTimeSlot: 'xAxis' as const,
            expectedValueSlot: 'yAxis' as const,
        },
    ])(
        'repairs a legacy coarse-grain line before axis inference when $orientation',
        ({ flipAxes, legacyData, expectedTimeSlot, expectedValueSlot }) => {
            const series = applyReferenceLines(
                makeSeries(),
                { xField: timeField, yField: [valueField], flipAxes },
                [
                    {
                        // Legacy extraction attributed the semantic time value
                        // to the numeric field because it assumed physical keys.
                        fieldId: valueField,
                        data: { uuid: 'legacy-date', ...legacyData },
                    },
                ],
                { itemsMap, resolvedTimezone: 'UTC' },
            );
            const line = series[0].markLine?.data[0];

            expect(line?.[expectedTimeSlot]).toBe('2024-07-15');
            expect(line?.[expectedValueSlot]).toBeUndefined();

            const finalized = finalizeTimeAxisOptions(
                {
                    dataset: {
                        source: [{ [timeField]: '2024-07-15' }],
                    },
                    series,
                },
                { kind: 'calendar', fieldId: timeField, flipAxes },
            );
            const finalizedLine = finalized.series?.[0].markLine?.data[0];

            expect(finalizedLine?.[expectedTimeSlot]).toBe(
                Date.parse('2024-07-15T00:00:00Z'),
            );
            expect(finalizedLine?.[expectedValueSlot]).toBeUndefined();
        },
    );

    test('repairs an unambiguous explicitly-zoned legacy time value', () => {
        const series = applyReferenceLines(
            makeSeries(),
            { xField: timeField, yField: [valueField], flipAxes: true },
            [
                {
                    fieldId: valueField,
                    data: {
                        uuid: 'legacy-zoned',
                        xAxis: '2024-07-15T12:00:00Z',
                    },
                },
            ],
            { itemsMap, resolvedTimezone: 'UTC' },
        );

        expect(series[0].markLine?.data[0].yAxis).toBe('2024-07-15T12:00:00Z');
        expect(series[0].markLine?.data[0].xAxis).toBeUndefined();
    });

    test('leaves ambiguous numeric years and flag-off mappings unchanged', () => {
        const layout = {
            xField: timeField,
            yField: [valueField],
            flipAxes: true,
        };
        const numericYear: ReferenceLineField = {
            fieldId: valueField,
            data: { uuid: 'threshold', xAxis: '2024' },
        };
        const legacyDate: ReferenceLineField = {
            fieldId: valueField,
            data: { uuid: 'legacy-date', xAxis: '2024-07-15' },
        };

        const numericResult = applyReferenceLines(
            makeSeries(),
            layout,
            [numericYear],
            { itemsMap, resolvedTimezone: 'UTC' },
        );
        const flagOffResult = applyReferenceLines(
            makeSeries(),
            layout,
            [legacyDate],
            { itemsMap, resolvedTimezone: undefined },
        );

        expect(numericResult[0].markLine?.data[0].xAxis).toBe('2024');
        expect(numericResult[0].markLine?.data[0].yAxis).toBeUndefined();
        expect(flagOffResult[0].markLine?.data[0].xAxis).toBe('2024-07-15');
        expect(flagOffResult[0].markLine?.data[0].yAxis).toBeUndefined();
    });

    test('does not reinterpret a date-shaped category reference during finalization', () => {
        const series = applyReferenceLines(
            makeSeries(stringField),
            {
                xField: timeField,
                yField: [stringField],
                flipAxes: true,
            },
            [
                {
                    fieldId: stringField,
                    data: {
                        uuid: 'category-date-shape',
                        xAxis: '2024-07-15',
                    },
                },
            ],
            { itemsMap, resolvedTimezone: 'UTC' },
        );
        const finalized = finalizeTimeAxisOptions(
            { dataset: { source: [] }, series },
            { kind: 'plain', flipAxes: true },
        );
        const line = finalized.series?.[0].markLine?.data[0];

        expect(line?.xAxis).toBe('2024-07-15');
        expect(line?.yAxis).toBeUndefined();
    });

    test.each([
        {
            mode: 'flag on',
            resolvedTimezone: 'UTC',
            expectedSlot: 'yAxis' as const,
            clearedSlot: 'xAxis' as const,
        },
        {
            mode: 'flag off',
            resolvedTimezone: undefined,
            expectedSlot: 'xAxis' as const,
            clearedSlot: 'yAxis' as const,
        },
    ])(
        'maps a mis-keyed saved coarse-grain line through the full config hook when $mode',
        ({ resolvedTimezone, expectedSlot, clearedSlot }) => {
            const initialSeries = makeSeries()[0];
            const params: Parameters<typeof useCartesianChartConfig>[0] = {
                initialChartConfig: {
                    layout: {
                        xField: timeField,
                        yField: [valueField],
                        flipAxes: true,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                ...initialSeries,
                                markLine: {
                                    data: [
                                        {
                                            uuid: 'legacy-saved-date',
                                            xAxis: '2024-07-15',
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
                pivotKeys: undefined,
                resultsData: {
                    rows: [],
                    metricQuery: {
                        dimensions: [timeField],
                        metrics: [valueField],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                    hasFetchedAllRows: true,
                    resolvedTimezone,
                } as never,
                columnOrder: [timeField, valueField],
                itemsMap,
                stacking: false,
                cartesianType: undefined,
                colorPalette: [],
            };
            const { result } = renderHook(() =>
                useCartesianChartConfig(params),
            );
            const line =
                result.current.validConfig.eChartsConfig.series?.[0].markLine
                    ?.data[0];

            expect(line?.[expectedSlot]).toBe('2024-07-15');
            expect(line?.[clearedSlot]).toBeUndefined();
        },
    );
});

describe('useCartesianChartConfig', () => {
    const getSingleSeriesParams = (): Parameters<
        typeof useCartesianChartConfig
    >[0] => ({
        ...useCartesianChartConfigParamsMock,
        itemsMap: undefined,
        stacking: undefined,
        cartesianType: undefined,
        colorPalette: [],
        initialChartConfig: {
            layout: {
                xField: 'orders_customer_id',
                yField: ['orders_total_order_amount'],
            },
            eChartsConfig: {
                series: [
                    {
                        type: CartesianSeriesType.BAR,
                        yAxisIndex: 0,
                        encode: {
                            xRef: {
                                field: 'orders_customer_id',
                            },
                            yRef: {
                                field: 'orders_total_order_amount',
                            },
                        },
                    },
                ],
            },
        },
        resultsData: {
            ...useCartesianChartConfigParamsMock.resultsData,
            metricQuery: {
                ...useCartesianChartConfigParamsMock.resultsData.metricQuery,
                exploreName: 'orders',
                metrics: ['orders_total_order_amount'],
            },
        } as any,
        columnOrder: ['orders_customer_id', 'orders_total_order_amount'],
    });

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

    test('should return undefined columnLimit when feature flag is off and no saved limit', () => {
        const { result } = renderHook(
            // @ts-expect-error partially mock params for hook
            () => useCartesianChartConfig(useCartesianChartConfigParamsMock),
        );

        expect(result.current.columnLimit).toBeUndefined();
    });

    test('should preserve saved columnLimit in validConfig', () => {
        const { result } = renderHook(() =>
            // @ts-expect-error partially mock params for hook
            useCartesianChartConfig({
                ...useCartesianChartConfigParamsMock,
                initialChartConfig: {
                    ...useCartesianChartConfigParamsMock.initialChartConfig,
                    columnLimit: 5,
                },
            }),
        );

        expect(result.current.validConfig?.columnLimit).toBe(5);
    });

    test('should include conditional formattings in valid config', () => {
        const conditionalFormattings = [
            createConditionalFormattingConfigWithSingleColor('#ff0000', {
                fieldId: 'orders_total_order_amount',
            }),
        ];
        const params = getSingleSeriesParams();

        const { result } = renderHook(() =>
            useCartesianChartConfig({
                ...params,
                initialChartConfig: {
                    ...params.initialChartConfig!,
                    conditionalFormattings,
                },
            }),
        );

        expect(result.current.validConfig.conditionalFormattings).toEqual(
            conditionalFormattings,
        );
    });

    test('should preserve category overrides when conditional formattings are set', () => {
        const params = getSingleSeriesParams();
        const { result } = renderHook(() =>
            useCartesianChartConfig({
                ...params,
                initialChartConfig: {
                    ...params.initialChartConfig!,
                    layout: {
                        ...params.initialChartConfig!.layout,
                        colorByCategory: true,
                        categoryColorOverrides: {
                            retail: '#00ff00',
                        },
                    },
                },
            }),
        );

        act(() => {
            result.current.onSetConditionalFormattings([
                createConditionalFormattingConfigWithSingleColor('#ff0000', {
                    fieldId: 'orders_total_order_amount',
                }),
            ]);
        });

        expect(result.current.dirtyLayout?.colorByCategory).toBeUndefined();
        expect(result.current.dirtyLayout?.categoryColorOverrides).toEqual({
            retail: '#00ff00',
        });
        expect(result.current.validConfig.conditionalFormattings).toHaveLength(
            1,
        );
    });

    test('should preserve conditional formattings when switching back to category colors', () => {
        const conditionalFormattings = [
            createConditionalFormattingConfigWithSingleColor('#ff0000', {
                fieldId: 'orders_total_order_amount',
            }),
        ];
        const params = getSingleSeriesParams();
        const { result } = renderHook(() =>
            useCartesianChartConfig({
                ...params,
                initialChartConfig: {
                    ...params.initialChartConfig!,
                    conditionalFormattings,
                },
            }),
        );

        act(() => {
            result.current.setColorByCategory(true);
        });

        expect(result.current.dirtyLayout?.colorByCategory).toBe(true);
        expect(result.current.validConfig.conditionalFormattings).toEqual(
            conditionalFormattings,
        );
    });

    test('should clear conditional formattings when adding a second series', () => {
        const params = getSingleSeriesParams();
        const { result } = renderHook(() =>
            useCartesianChartConfig({
                ...params,
                initialChartConfig: {
                    ...params.initialChartConfig!,
                    conditionalFormattings: [
                        createConditionalFormattingConfigWithSingleColor(
                            '#ff0000',
                            {
                                fieldId: 'orders_total_order_amount',
                            },
                        ),
                    ],
                },
            }),
        );

        act(() => {
            result.current.addSingleSeries('orders_fulfillment_rate');
        });

        expect(result.current.validConfig.conditionalFormattings).toEqual([]);
    });

    test('should set and clear y-axis minInterval', () => {
        const params = getSingleSeriesParams();
        const { result } = renderHook(() => useCartesianChartConfig(params));

        act(() => {
            result.current.setYMinInterval(0, 1);
        });

        expect(result.current.dirtyEchartsConfig?.yAxis?.[0]?.minInterval).toBe(
            1,
        );

        act(() => {
            result.current.setYMinInterval(0, undefined);
        });

        expect(
            result.current.dirtyEchartsConfig?.yAxis?.[0]?.minInterval,
        ).toBeUndefined();
    });

    test('should set x-axis minInterval', () => {
        const params = getSingleSeriesParams();
        const { result } = renderHook(() => useCartesianChartConfig(params));

        act(() => {
            result.current.setXMinInterval(0, 1);
        });

        expect(result.current.dirtyEchartsConfig?.xAxis?.[0]?.minInterval).toBe(
            1,
        );
    });

    test('should clear category colors but keep conditional formatting when stacking is enabled', () => {
        const initialParams = getSingleSeriesParams();
        const conditionalFormattings = [
            createConditionalFormattingConfigWithSingleColor('#ff0000', {
                fieldId: 'orders_total_order_amount',
            }),
        ];
        const { result, rerender } = renderHook(
            ({ params }) =>
                // @ts-expect-error partially mock params for hook
                useCartesianChartConfig(params),
            {
                initialProps: {
                    params: {
                        ...initialParams,
                        initialChartConfig: {
                            ...initialParams.initialChartConfig,
                            layout: {
                                ...initialParams.initialChartConfig?.layout,
                                colorByCategory: true,
                                categoryColorOverrides: {
                                    retail: '#00ff00',
                                },
                            },
                            conditionalFormattings,
                        },
                    },
                },
            },
        );

        rerender({
            params: {
                ...initialParams,
                stacking: StackType.NORMAL,
                initialChartConfig: {
                    ...initialParams.initialChartConfig,
                    layout: {
                        ...initialParams.initialChartConfig?.layout,
                        colorByCategory: true,
                        categoryColorOverrides: {
                            retail: '#00ff00',
                        },
                    },
                    conditionalFormattings,
                },
            },
        });

        expect(result.current.dirtyLayout?.colorByCategory).toBeUndefined();
        expect(
            result.current.dirtyLayout?.categoryColorOverrides,
        ).toBeUndefined();
        expect(result.current.validConfig.conditionalFormattings).toEqual(
            conditionalFormattings,
        );
    });

    test('should coerce conditional formatting to a single target when stacked', () => {
        const initialParams = getSingleSeriesParams();
        const multiMetricParams = {
            ...initialParams,
            stacking: StackType.NORMAL,
            initialChartConfig: {
                ...initialParams.initialChartConfig,
                layout: {
                    xField: 'orders_customer_id',
                    yField: ['orders_total_order_amount', 'orders_order_count'],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            yAxisIndex: 0,
                            encode: {
                                xRef: { field: 'orders_customer_id' },
                                yRef: {
                                    field: 'orders_total_order_amount',
                                },
                            },
                        },
                        {
                            type: CartesianSeriesType.BAR,
                            yAxisIndex: 0,
                            encode: {
                                xRef: { field: 'orders_customer_id' },
                                yRef: { field: 'orders_order_count' },
                            },
                        },
                    ],
                },
                conditionalFormattings: [
                    createConditionalFormattingConfigWithSingleColor(
                        '#ff0000',
                        { fieldId: 'orders_total_order_amount' },
                    ),
                    createConditionalFormattingConfigWithSingleColor(
                        '#0000ff',
                        { fieldId: 'orders_order_count' },
                    ),
                ],
            },
        };

        const { result } = renderHook(
            ({ params }) => useCartesianChartConfig(params),
            { initialProps: { params: multiMetricParams } },
        );

        expect(
            result.current.validConfig.conditionalFormattings?.map(
                (config) => config.target?.fieldId,
            ),
        ).toEqual(['orders_total_order_amount', 'orders_total_order_amount']);
    });

    test('should clear conditional formattings when chart becomes ineligible', () => {
        const initialParams = getSingleSeriesParams();
        const { result, rerender } = renderHook(
            ({ params }) =>
                // @ts-expect-error partially mock params for hook
                useCartesianChartConfig(params),
            {
                initialProps: {
                    params: {
                        ...initialParams,
                        initialChartConfig: {
                            ...initialParams.initialChartConfig,
                            conditionalFormattings: [
                                createConditionalFormattingConfigWithSingleColor(
                                    '#ff0000',
                                    {
                                        fieldId: 'orders_total_order_amount',
                                    },
                                ),
                            ],
                        },
                    },
                },
            },
        );

        rerender({
            params: {
                ...initialParams,
                pivotKeys: ['orders_status'] as string[] | undefined,
                initialChartConfig: {
                    ...initialParams.initialChartConfig,
                    conditionalFormattings: [
                        createConditionalFormattingConfigWithSingleColor(
                            '#ff0000',
                            {
                                fieldId: 'orders_total_order_amount',
                            },
                        ),
                    ],
                },
            },
        });

        expect(result.current.validConfig.conditionalFormattings).toEqual([]);
    });
});
