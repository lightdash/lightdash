import {
    DimensionType,
    getDimensionsFromItemsMap,
    getItemId,
    getSeriesId,
    isDimension,
    type CartesianSeriesType,
    type ItemsMap,
    type Series,
} from '@lightdash/common';
import {
    getPivotedData,
    getPivotedDataFromPivotDetails,
} from '../plottedData/getPlottedData';
import type { InfiniteQueryResults } from '../useQueryResults';

export type GetExpectedSeriesMapArgs = {
    defaultSmooth?: boolean;
    defaultShowSymbol?: boolean;
    defaultCartesianType: CartesianSeriesType;
    defaultAreaStyle: Series['areaStyle'];
    isStacked: boolean;
    resultsData: InfiniteQueryResults;
    pivotKeys: string[] | undefined;
    yFields: string[];
    xField: string;
    availableDimensions: string[];
    defaultLabel?: Series['label'];
    itemsMap: ItemsMap | undefined;
};

export const getExpectedSeriesMap = ({
    defaultSmooth,
    defaultShowSymbol,
    defaultCartesianType,
    defaultAreaStyle,
    isStacked,
    resultsData,
    pivotKeys,
    yFields,
    xField,
    availableDimensions,
    defaultLabel,
    itemsMap,
}: GetExpectedSeriesMapArgs) => {
    let expectedSeriesMap: Record<string, Series>;

    const defaultProperties = {
        smooth: defaultSmooth,
        showSymbol: defaultShowSymbol,
        type: defaultCartesianType,
        areaStyle: defaultAreaStyle,
        yAxisIndex: 0,
        label: defaultLabel,
    };
    if (pivotKeys && pivotKeys.length > 0) {
        // Use new pivoted data format if available
        const { rowKeyMap } = resultsData.pivotDetails
            ? getPivotedDataFromPivotDetails(resultsData, itemsMap)
            : getPivotedData(
                  resultsData.rows,
                  pivotKeys,
                  yFields.filter(
                      (yField) => !availableDimensions.includes(yField),
                  ),
                  yFields.filter((yField) =>
                      availableDimensions.includes(yField),
                  ),
              );

        expectedSeriesMap = Object.values(rowKeyMap).reduce<
            Record<string, Series>
        >((acc, rowKey) => {
            let series: Series;
            if (typeof rowKey === 'string') {
                series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: rowKey,
                        },
                    },
                };
            } else {
                series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: rowKey,
                    },
                    stack:
                        defaultAreaStyle || isStacked
                            ? rowKey.field
                            : undefined,
                };
            }
            return { ...acc, [getSeriesId(series)]: series };
        }, {});
    } else {
        expectedSeriesMap = (yFields || []).reduce<Record<string, Series>>(
            (sum, yField) => {
                const series = {
                    ...defaultProperties,
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: yField,
                        },
                    },
                    stack:
                        isStacked || !!defaultAreaStyle
                            ? 'stack-all-series'
                            : undefined,
                };
                return { ...sum, [getSeriesId(series)]: series };
            },
            {},
        );
    }
    return expectedSeriesMap;
};

type MergeExistingAndExpectedSeriesArgs = {
    expectedSeriesMap: Record<string, Series>;
    existingSeries: Series[];
    sortedByPivot: boolean;
};

export const mergeExistingAndExpectedSeries = ({
    expectedSeriesMap,
    existingSeries,
    sortedByPivot,
}: MergeExistingAndExpectedSeriesArgs) => {
    const { existingValidSeries, existingValidSeriesIds } =
        existingSeries.reduce<{
            existingValidSeries: Series[];
            existingValidSeriesIds: string[];
        }>(
            (sum, series) => {
                const id = getSeriesId(series);

                // this results in a string without the pivot values
                //e.g. 'orders_order_date_month|orders_average_order_size.orders_is_completed.true' -> 'orders_order_date_month|orders_average_order_size.orders_is_completed'
                // used to check if the series is not expected but part of the same pivot of expected series
                const idWithoutPivotValues = id.replace(/\.[^.]+$/, '');

                const isSeriesExpected =
                    Object.keys(expectedSeriesMap).includes(id);

                const isSeriesFilteredOut =
                    Object.keys(expectedSeriesMap).some((expectedId) =>
                        expectedId.startsWith(idWithoutPivotValues),
                    ) && !isSeriesExpected;

                if (!isSeriesExpected && !isSeriesFilteredOut) {
                    return { ...sum };
                }

                return {
                    ...sum,
                    existingValidSeries: [
                        ...sum.existingValidSeries,
                        {
                            ...series,
                            isFilteredOut: isSeriesFilteredOut,
                        },
                    ],
                    existingValidSeriesIds: [...sum.existingValidSeriesIds, id],
                };
            },
            { existingValidSeries: [], existingValidSeriesIds: [] },
        );

    if (existingValidSeries.length <= 0) {
        return Object.values(expectedSeriesMap);
    }

    // add missing series, inheriting properties from existing series in the same group
    const mergedSeries = Object.entries(expectedSeriesMap).reduce<Series[]>(
        (acc, [expectedSeriesId, expectedSeries]) => {
            // Don't add the expected series if there is a valid one already
            if (existingValidSeriesIds.includes(expectedSeriesId)) {
                return acc;
            }

            let seriesToAdd = expectedSeries;

            // For pivot series, inherit yAxisIndex from existing series with same field
            if (
                seriesToAdd.encode.yRef.pivotValues &&
                seriesToAdd.encode.yRef.pivotValues.length > 0
            ) {
                const seriesInSameGroup = acc.find(
                    (series) =>
                        seriesToAdd.encode.yRef.field ===
                        series.encode.yRef.field,
                );

                if (seriesInSameGroup) {
                    seriesToAdd = {
                        ...seriesToAdd,
                        yAxisIndex: seriesInSameGroup.yAxisIndex,
                    };
                }
            }

            return [...acc, seriesToAdd];
        },
        existingValidSeries,
    );

    // Reorder series to match expectedSeriesMap order only when sorted by
    // a pivot dimension. This respects the query sort for grouped dimensions
    // while preserving manual series ordering when sorting by other fields.
    if (!sortedByPivot) {
        return mergedSeries;
    }

    const expectedSeriesIds = Object.keys(expectedSeriesMap);
    return [...mergedSeries].sort((a, b) => {
        const aIndex = expectedSeriesIds.indexOf(getSeriesId(a));
        const bIndex = expectedSeriesIds.indexOf(getSeriesId(b));
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
};

export const getSeriesGroupedByField = (series: Series[]) => {
    const seriesGroupMap = series.reduce<
        Record<string, { index: number; value: Series[] }>
    >((acc, obj, index) => {
        if (
            acc[obj.encode.yRef.field] &&
            !!obj.encode.yRef.pivotValues &&
            obj.encode.yRef.pivotValues.length > 0
        ) {
            return {
                ...acc,
                [obj.encode.yRef.field]: {
                    ...acc[obj.encode.yRef.field],
                    value: [...acc[obj.encode.yRef.field].value, obj],
                },
            };
        }
        return {
            ...acc,
            [obj.encode.yRef.field]: { index, value: [obj] },
        };
    }, {});
    return Object.values(seriesGroupMap).sort((a, b) => a.index - b.index);
};

export const sortDimensions = (
    dimensionIds: string[],
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
) => {
    if (!itemsMap) return dimensionIds;

    if (dimensionIds.length <= 1) return dimensionIds;

    const dimensions = Object.values(getDimensionsFromItemsMap(itemsMap));

    const dateDimensions = dimensions.filter(
        (dimension) =>
            isDimension(dimension) &&
            dimensionIds.includes(getItemId(dimension)) &&
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                dimension.type,
            ),
    );
    switch (dateDimensions.length) {
        case 0:
            return dimensionIds; // No dates, we return the same order
        case 1: // Only 1 date, we return this date first
            const dateDimensionId = getItemId(dateDimensions[0]);
            return [
                dateDimensionId,
                ...dimensionIds.filter(
                    (dimensionId) => dimensionId !== dateDimensionId,
                ),
            ];
        default:
            // 2 or more dates, we return first the date further left in the results table
            const sortedDateDimensions = dateDimensions.sort(
                (a, b) =>
                    columnOrder.indexOf(getItemId(a)) -
                    columnOrder.indexOf(getItemId(b)),
            );
            const sortedDateDimensionIds = sortedDateDimensions.map(getItemId);
            return [
                ...sortedDateDimensionIds,
                ...dimensionIds.filter(
                    (dimensionId) =>
                        !sortedDateDimensionIds.includes(dimensionId),
                ),
            ];
    }
};
