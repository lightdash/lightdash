import {
    CartesianSeriesType,
    createConditionalFormattingConfigWithSingleColor,
    getItemMap,
    type Series,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
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

    test('should clear color by category when conditional formattings are set', () => {
        const params = getSingleSeriesParams();
        const { result } = renderHook(() =>
            useCartesianChartConfig({
                ...params,
                initialChartConfig: {
                    ...params.initialChartConfig!,
                    layout: {
                        ...params.initialChartConfig!.layout,
                        colorByCategory: true,
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
        expect(result.current.validConfig.conditionalFormattings).toHaveLength(
            1,
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
