import {
    ApiQueryResults,
    CartesianSeriesType,
    getSeriesId,
    Series,
} from '@lightdash/common';

type Args = {
    defaultCartesianType: CartesianSeriesType;
    defaultAreaStyle: Series['areaStyle'];
    isStacked: boolean;
    resultsData: ApiQueryResults | undefined;
    pivotKey: string | undefined;
    yFields: string[];
    xField: string;
    availableDimensions: string[];
};

export const getExpectedSeriesMap = ({
    defaultCartesianType,
    defaultAreaStyle,
    isStacked,
    resultsData,
    pivotKey,
    yFields,
    xField,
    availableDimensions,
}: Args) => {
    let expectedSeriesMap: Record<string, Series>;
    if (pivotKey) {
        const uniquePivotValues: string[] = Array.from(
            new Set(resultsData?.rows.map((row) => row[pivotKey].value.raw)),
        );
        expectedSeriesMap = (yFields || []).reduce<Record<string, Series>>(
            (sum, yField) => {
                if (availableDimensions.includes(yField)) {
                    const series = {
                        encode: {
                            xRef: { field: xField },
                            yRef: {
                                field: yField,
                            },
                        },
                        type: defaultCartesianType,
                        areaStyle: defaultAreaStyle,
                    };
                    return { ...sum, [getSeriesId(series)]: series };
                }
                const stack =
                    defaultAreaStyle || isStacked ? yField : undefined;
                const groupSeries = uniquePivotValues.reduce<
                    Record<string, Series>
                >((acc, rawValue) => {
                    const pivotSeries: Series = {
                        type: defaultCartesianType,
                        encode: {
                            xRef: { field: xField },
                            yRef: {
                                field: yField,
                                pivotValues: [
                                    {
                                        field: pivotKey,
                                        value: rawValue,
                                    },
                                ],
                            },
                        },
                        areaStyle: defaultAreaStyle,
                        stack,
                    };
                    return {
                        ...acc,
                        [getSeriesId(pivotSeries)]: pivotSeries,
                    };
                }, {});

                return { ...sum, ...groupSeries };
            },
            {},
        );
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
                return [
                    // part of the array before the specified index
                    ...acc.slice(0, lastSeriesInGroupIndex),
                    // inserted item
                    expectedSeries,
                    // part of the array after the specified index
                    ...acc.slice(lastSeriesInGroupIndex),
                ].reverse();
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
