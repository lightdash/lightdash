import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    ChartType,
    DimensionType,
    EchartsGrid,
    EchartsLegend,
    Explore,
    getDimensions,
    getItemId,
    getSeriesId,
    isCompleteEchartsConfig,
    isCompleteLayout,
    Series,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { arrayMoveByIndex } from '../../utils/arrayUtils';

type Args = {
    chartType: ChartType;
    initialChartConfig: CartesianChart | undefined;
    pivotKey: string | undefined;
    resultsData: ApiQueryResults | undefined;
    setPivotDimensions: React.Dispatch<
        React.SetStateAction<string[] | undefined>
    >;
    columnOrder: string[];
    explore: Explore | undefined;
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

const useCartesianChartConfig = ({
    chartType,
    initialChartConfig,
    pivotKey,
    resultsData,
    setPivotDimensions,
    columnOrder,
    explore,
}: Args) => {
    const hasInitialValue =
        !!initialChartConfig &&
        isCompleteLayout(initialChartConfig.layout) &&
        isCompleteEchartsConfig(initialChartConfig.eChartsConfig);
    const [dirtyLayout, setDirtyLayout] = useState<
        Partial<CartesianChart['layout']> | undefined
    >(initialChartConfig?.layout);
    const [dirtyEchartsConfig, setDirtyEchartsConfig] = useState<
        Partial<CartesianChart['eChartsConfig']> | undefined
    >(initialChartConfig?.eChartsConfig);

    const isInitiallyStacked = (dirtyEchartsConfig?.series || []).some(
        (series: Series) => series.stack !== undefined,
    );
    const [isStacked, setIsStacked] = useState<boolean>(isInitiallyStacked);

    const setLegend = useCallback((legend: EchartsLegend) => {
        setDirtyEchartsConfig((prevState) => {
            return {
                ...prevState,
                legend,
            };
        });
    }, []);

    const setGrid = useCallback((grid: EchartsGrid) => {
        setDirtyEchartsConfig((prevState) => {
            return {
                ...prevState,
                grid,
            };
        });
    }, []);

    const setXAxisName = useCallback((name: string) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, name }, ...axes],
            };
        });
    }, []);

    const setYAxisName = useCallback((index: number, name: string) => {
        setDirtyEchartsConfig((prevState) => {
            return {
                ...prevState,
                yAxis: [
                    prevState?.yAxis?.[0] || {},
                    prevState?.yAxis?.[1] || {},
                ].map((axis, axisIndex) =>
                    axisIndex === index ? { ...axis, name } : axis,
                ),
            };
        });
    }, []);

    const setYMinValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    yAxis: [
                        prevState?.yAxis?.[0] || {},
                        prevState?.yAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index ? { ...axis, min: value } : axis,
                    ),
                };
            });
        },
        [],
    );

    const setYMaxValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    yAxis: [
                        prevState?.yAxis?.[0] || {},
                        prevState?.yAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index ? { ...axis, max: value } : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXField = useCallback((xField: string | undefined) => {
        setDirtyLayout((prev) => ({
            ...prev,
            xField,
        }));
    }, []);

    const setShowGridX = useCallback((show: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showGridX: show,
        }));
    }, []);
    const setShowGridY = useCallback((show: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showGridY: show,
        }));
    }, []);
    const setInverseX = useCallback((inverse: boolean) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            const x = {
                ...prevState,
                xAxis: [{ ...firstAxis, inverse }, ...axes],
            };
            return x;
        });
    }, []);
    const addSingleSeries = useCallback((yField: string) => {
        setDirtyLayout((prev) => ({
            ...prev,
            yField: [...(prev?.yField || []), yField],
        }));
    }, []);

    const removeSingleSeries = useCallback((index: number) => {
        setDirtyLayout((prev) => ({
            ...prev,
            yField: prev?.yField
                ? [
                      ...prev.yField.slice(0, index),
                      ...prev.yField.slice(index + 1),
                  ]
                : [],
        }));
    }, []);

    const updateYField = useCallback((index: number, type: string) => {
        setDirtyLayout((prev) => ({
            ...prev,
            yField: prev?.yField?.map((field, i) => {
                return i === index ? type : field;
            }),
        }));
    }, []);

    const setType = useCallback(
        (type: Series['type'], flipAxes: boolean, hasAreaStyle: boolean) => {
            setDirtyLayout((prev) => ({
                ...prev,
                flipAxes,
            }));
            setDirtyEchartsConfig(
                (prevState) =>
                    prevState && {
                        ...prevState,
                        series: prevState?.series?.map((series) => ({
                            ...series,
                            type,
                            areaStyle: hasAreaStyle ? {} : undefined,
                        })),
                    },
            );
        },
        [],
    );

    const setFlipAxis = useCallback((flipAxes: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            flipAxes,
        }));
    }, []);

    const updateAllGroupedSeries = useCallback(
        (fieldKey: string, updateSeries: Partial<Series>) =>
            setDirtyEchartsConfig(
                (prevState) =>
                    prevState && {
                        ...prevState,
                        series: prevState?.series?.map((series) =>
                            series.encode.yRef.field === fieldKey
                                ? {
                                      ...series,
                                      ...updateSeries,
                                  }
                                : series,
                        ),
                    },
            ),
        [],
    );

    const updateSingleSeries = useCallback((updatedSeries: Series) => {
        setDirtyEchartsConfig((prev) => {
            return {
                ...prev,
                series: (prev?.series || []).map((currentSeries) =>
                    getSeriesId(currentSeries) === getSeriesId(updatedSeries)
                        ? { ...currentSeries, ...updatedSeries }
                        : currentSeries,
                ),
            };
        });
    }, []);

    const updateSingleSeriesOrder = useCallback(
        (sourceIndex: number, destinationIndex: number) => {
            setDirtyEchartsConfig((prev) => {
                if (prev && prev.series) {
                    return {
                        ...prev,
                        series: arrayMoveByIndex(
                            prev.series,
                            sourceIndex,
                            destinationIndex,
                        ),
                    };
                }
                return prev;
            });
        },
        [],
    );

    const updateAllGroupedSeriesOrder = useCallback(
        (fieldKey: string, destinationIndex: number) => {
            setDirtyEchartsConfig((prev) => {
                if (prev && prev.series) {
                    const seriesIndexes = prev?.series?.reduce<number[]>(
                        (acc, series, index) =>
                            series.encode.yRef.field === fieldKey
                                ? [...acc, index]
                                : acc,
                        [],
                    );
                    return {
                        ...prev,
                        series: arrayMoveByIndex(
                            prev.series,
                            seriesIndexes,
                            destinationIndex,
                        ),
                    };
                }
                return prev;
            });
        },
        [],
    );

    const setStacking = useCallback(
        (stack: boolean) => {
            const yFields = dirtyLayout?.yField || [];
            setIsStacked(stack);
            yFields.forEach((yField) => {
                updateAllGroupedSeries(yField, {
                    stack: stack
                        ? pivotKey
                            ? yField
                            : 'stack-all-series'
                        : undefined,
                });
            });
        },
        [dirtyLayout?.yField, updateAllGroupedSeries, pivotKey],
    );

    const sortedDimensions = useMemo(() => {
        return sortDimensions(
            resultsData?.metricQuery.dimensions || [],
            explore,
            columnOrder,
        );
    }, [resultsData?.metricQuery.dimensions, explore, columnOrder]);

    const [
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
    ] = useMemo(() => {
        const metrics = resultsData?.metricQuery.metrics || [];
        const tableCalculations =
            resultsData?.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ) || [];
        return [
            [...sortedDimensions, ...metrics, ...tableCalculations],
            sortedDimensions,
            metrics,
            tableCalculations,
        ];
    }, [resultsData, sortedDimensions]);

    // Set fallout layout values
    // https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
    useEffect(() => {
        if (availableFields.length > 0 && chartType === ChartType.CARTESIAN) {
            setDirtyLayout((prev) => {
                const isCurrentXFieldValid: boolean =
                    !!prev?.xField && availableFields.includes(prev.xField);
                const currentValidYFields = prev?.yField
                    ? prev.yField.filter((y) => availableFields.includes(y))
                    : [];
                const isCurrentYFieldsValid: boolean =
                    currentValidYFields.length > 0;

                // current configuration is still valid
                if (isCurrentXFieldValid && isCurrentYFieldsValid) {
                    return {
                        ...prev,
                        xField: prev?.xField,
                        yField: currentValidYFields,
                    };
                }

                // try to fix partially invalid configuration
                if (
                    (isCurrentXFieldValid && !isCurrentYFieldsValid) ||
                    (!isCurrentXFieldValid && isCurrentYFieldsValid)
                ) {
                    const usedFields: string[] = [];

                    if (isCurrentXFieldValid && prev?.xField) {
                        usedFields.push(prev?.xField);
                    }
                    if (isCurrentYFieldsValid) {
                        usedFields.push(...currentValidYFields);
                    }

                    const fallbackXField = availableFields.filter(
                        (f) => !usedFields.includes(f),
                    )[0];

                    if (!isCurrentXFieldValid && fallbackXField) {
                        return {
                            ...prev,
                            xField: fallbackXField,
                            yField: currentValidYFields,
                        };
                    }

                    const fallbackYFields = [
                        ...availableMetrics,
                        ...availableDimensions,
                    ].filter((f) => !usedFields.includes(f))[0];

                    if (!isCurrentYFieldsValid && fallbackYFields) {
                        return {
                            ...prev,
                            yField: [fallbackYFields],
                        };
                    }
                }

                let newXField: string | undefined = undefined;
                let newYFields: string[] = [];
                let newPivotFields: string[] = [];

                // one metric , one dimension
                if (
                    availableMetrics.length === 1 &&
                    availableDimensions.length === 1
                ) {
                    newXField = availableDimensions[0];
                    newYFields = [availableMetrics[0]];
                }

                // one metric, two dimensions
                else if (
                    availableMetrics.length === 1 &&
                    availableDimensions.length === 2
                ) {
                    newXField = availableDimensions[0];
                    newYFields = [availableMetrics[0]];
                    newPivotFields = [availableDimensions[1]];
                }

                // 1+ metrics, one dimension
                else if (
                    availableMetrics.length > 1 &&
                    availableDimensions.length === 1
                ) {
                    //Max 4 metrics in Y-axis
                    newXField = availableDimensions[0];
                    newYFields = availableMetrics.slice(0, 4);
                }

                // 2+ dimensions and 1+ metrics
                else if (
                    availableMetrics.length >= 1 &&
                    availableDimensions.length >= 2
                ) {
                    //Max 4 metrics in Y-axis
                    newXField = availableDimensions[0];
                    newYFields = availableMetrics.slice(0, 4);
                    newPivotFields = [availableDimensions[1]];
                }

                // 2+ metrics with no dimensions
                else if (
                    availableMetrics.length >= 2 &&
                    availableDimensions.length === 0
                ) {
                    newXField = availableMetrics[0];
                    newYFields = [availableMetrics[1]];
                }

                // 2+ dimensions with no metrics
                else if (
                    availableMetrics.length === 0 &&
                    availableDimensions.length >= 2
                ) {
                    newXField = availableDimensions[0];
                    newYFields = [availableDimensions[1]];
                }

                if (explore !== undefined) setPivotDimensions(newPivotFields);
                return {
                    ...prev,
                    xField: newXField,
                    yField: newYFields,
                };
            });
        }
    }, [
        chartType,
        pivotKey,
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
        hasInitialValue,
        explore,
        setPivotDimensions,
        setType,
    ]);

    // Generate expected series
    useEffect(() => {
        if (isCompleteLayout(dirtyLayout) && resultsData) {
            setDirtyEchartsConfig((prev) => {
                const defaultCartesianType =
                    prev?.series?.[0]?.type || CartesianSeriesType.BAR;
                const defaultAreaStyle =
                    defaultCartesianType === CartesianSeriesType.LINE
                        ? prev?.series?.[0]?.areaStyle
                        : undefined;
                let expectedSeriesMap: Record<string, Series>;
                if (pivotKey) {
                    const uniquePivotValues: string[] = Array.from(
                        new Set(
                            resultsData?.rows.map(
                                (row) => row[pivotKey].value.raw,
                            ),
                        ),
                    );
                    expectedSeriesMap = (dirtyLayout.yField || []).reduce<
                        Record<string, Series>
                    >((sum, yField) => {
                        if (availableDimensions.includes(yField)) {
                            const series = {
                                encode: {
                                    xRef: { field: dirtyLayout.xField },
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
                                    xRef: { field: dirtyLayout.xField },
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
                    }, {});
                } else {
                    expectedSeriesMap = (dirtyLayout.yField || []).reduce<
                        Record<string, Series>
                    >((sum, yField) => {
                        const series = {
                            encode: {
                                xRef: { field: dirtyLayout.xField },
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
                    }, {});
                }
                const existingValidSeriesMap =
                    prev?.series?.reduce<Record<string, Series>>(
                        (sum, series) => {
                            if (
                                !Object.keys(expectedSeriesMap).includes(
                                    getSeriesId(series),
                                )
                            ) {
                                return { ...sum };
                            }
                            return {
                                ...sum,
                                [getSeriesId(series)]: series,
                            };
                        },
                        {},
                    ) || {};
                return {
                    ...prev,
                    series: Object.values({
                        ...expectedSeriesMap,
                        ...existingValidSeriesMap,
                    }),
                };
            });
        }
    }, [dirtyLayout, pivotKey, resultsData, availableDimensions, isStacked]);

    const validCartesianConfig: CartesianChart | undefined = useMemo(
        () =>
            isCompleteLayout(dirtyLayout) &&
            isCompleteEchartsConfig(dirtyEchartsConfig)
                ? {
                      layout: dirtyLayout,
                      eChartsConfig: dirtyEchartsConfig,
                  }
                : undefined,
        [dirtyLayout, dirtyEchartsConfig],
    );

    const { dirtyChartType } = useMemo(() => {
        const firstSeriesType =
            dirtyEchartsConfig?.series?.[0]?.type || CartesianSeriesType.BAR;
        const firstSeriesAreaStyle = dirtyEchartsConfig?.series?.[0]?.areaStyle;
        return {
            dirtyChartType:
                firstSeriesType === CartesianSeriesType.LINE &&
                firstSeriesAreaStyle
                    ? CartesianSeriesType.AREA
                    : firstSeriesType,
        };
    }, [dirtyEchartsConfig]);

    return {
        validCartesianConfig,
        dirtyChartType,
        dirtyLayout,
        dirtyEchartsConfig,
        setXField,
        setType,
        setXAxisName,
        setYAxisName,
        setStacking,
        isStacked,
        addSingleSeries,
        updateSingleSeries,
        removeSingleSeries,
        updateAllGroupedSeries,
        updateYField,
        setFlipAxis,
        setYMinValue,
        setYMaxValue,
        setLegend,
        setGrid,
        setShowGridX,
        setShowGridY,
        setInverseX,
        updateSingleSeriesOrder,
        updateAllGroupedSeriesOrder,
    };
};

export default useCartesianChartConfig;
