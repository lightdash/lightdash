import {
    ApiQueryResults,
    CartesianSeriesType,
    DimensionType,
    Explore,
    getDimensions,
    getItemId,
    getSeriesId,
    Series,
} from '@lightdash/common';
import { getPivotedData } from '../plottedData/usePlottedData';

export type GetExpectedSeriesMapArgs = {
    defaultCartesianType: CartesianSeriesType;
    defaultAreaStyle: Series['areaStyle'];
    isStacked: boolean;
    resultsData: ApiQueryResults;
    pivotKeys: string[] | undefined;
    yFields: string[];
    xField: string;
    availableDimensions: string[];
};

export const getExpectedSeriesMap = ({
    defaultCartesianType,
    defaultAreaStyle,
    isStacked,
    resultsData,
    pivotKeys,
    yFields,
    xField,
    availableDimensions,
}: GetExpectedSeriesMapArgs) => {
    let expectedSeriesMap: Record<string, Series>;
    if (pivotKeys && pivotKeys.length > 0) {
        const { rowKeyMap } = getPivotedData(
            resultsData.rows,
            pivotKeys,
            yFields.filter((yField) => !availableDimensions.includes(yField)),
            yFields.filter((yField) => availableDimensions.includes(yField)),
        );

        expectedSeriesMap = Object.values(rowKeyMap).reduce<
            Record<string, Series>
        >((acc, rowKey) => {
            let series: Series;
            if (typeof rowKey === 'string') {
                series = {
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: rowKey,
                        },
                    },
                    type: defaultCartesianType,
                    areaStyle: defaultAreaStyle,
                };
            } else {
                series = {
                    type: defaultCartesianType,
                    encode: {
                        xRef: { field: xField },
                        yRef: rowKey,
                    },
                    areaStyle: defaultAreaStyle,
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
                    encode: {
                        xRef: { field: xField },
                        yRef: {
                            field: yField,
                        },
                    },
                    type: defaultCartesianType,
                    areaStyle: defaultAreaStyle,
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
};

export const mergeExistingAndExpectedSeries = ({
    expectedSeriesMap,
    existingSeries,
}: MergeExistingAndExpectedSeriesArgs) => {
    const { existingValidSeries, existingValidSeriesIds } =
        existingSeries.reduce<{
            existingValidSeries: Series[];
            existingValidSeriesIds: string[];
        }>(
            (sum, series) => {
                const id = getSeriesId(series);
                if (!Object.keys(expectedSeriesMap).includes(id)) {
                    return { ...sum };
                }
                return {
                    ...sum,
                    existingValidSeries: [...sum.existingValidSeries, series],
                    existingValidSeriesIds: [...sum.existingValidSeriesIds, id],
                };
            },
            { existingValidSeries: [], existingValidSeriesIds: [] },
        );
    if (existingValidSeries.length <= 0) {
        return Object.values(expectedSeriesMap);
    }
    // add missing series in the correct order (next to series of the same group)
    return Object.entries(expectedSeriesMap).reduce<Series[]>(
        (acc, [expectedSeriesId, expectedSeries]) => {
            // Don't add the expected series if there is a valid one already
            if (existingValidSeriesIds.includes(expectedSeriesId)) {
                return [...acc];
            }
            // Add series to the end of its group
            if (
                expectedSeries.encode.yRef.pivotValues &&
                expectedSeries.encode.yRef.pivotValues.length > 0
            ) {
                const lastSeriesInGroupIndex = acc
                    .reverse()
                    .findIndex(
                        (series) =>
                            expectedSeries.encode.yRef.field ===
                            series.encode.yRef.field,
                    );
                if (lastSeriesInGroupIndex >= 0) {
                    return [
                        // part of the array before the specified index
                        ...acc.slice(0, lastSeriesInGroupIndex),
                        // inserted item
                        expectedSeries,
                        // part of the array after the specified index
                        ...acc.slice(lastSeriesInGroupIndex),
                    ].reverse();
                }
                return [...acc.reverse(), expectedSeries];
            }
            // Add series to the end
            return [...acc, expectedSeries];
        },
        existingValidSeries,
    );
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
    explore: Explore | undefined,
    columnOrder: string[],
) => {
    if (!explore) return dimensionIds;

    if (dimensionIds.length <= 1) return dimensionIds;

    const dimensions = getDimensions(explore);

    const dateDimensions = dimensions.filter(
        (dimension) =>
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
