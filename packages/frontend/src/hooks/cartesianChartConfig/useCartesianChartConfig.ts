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

// https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
const getDefaultLayout = (
    availableDimensions: string[],
    availableMetrics: string[],
) => {
    let xField: string | undefined = undefined;
    let yFields: string[] = [];
    let pivotFields: string[] = [];

    // one metric , one dimension
    if (availableMetrics.length === 1 && availableDimensions.length === 1) {
        xField = availableDimensions[0];
        yFields = [availableMetrics[0]];
    }

    // one metric, two dimensions
    else if (
        availableMetrics.length === 1 &&
        availableDimensions.length === 2
    ) {
        xField = availableDimensions[0];
        yFields = [availableMetrics[0]];
        pivotFields = [availableDimensions[1]];
    }

    // two metrics, one dimension
    else if (
        availableMetrics.length === 2 &&
        availableDimensions.length === 1
    ) {
        xField = availableDimensions[0];
        yFields = availableMetrics;
    }

    // 2+ dimensions and 1+ metrics
    else if (availableMetrics.length >= 1 && availableDimensions.length >= 2) {
        //Max 4 metrics in Y-axis
        xField = availableDimensions[0];
        yFields = availableMetrics.slice(0, 4);
        pivotFields = [availableDimensions[1]];
    }

    // 2+ metrics with no dimensions
    else if (availableMetrics.length >= 2 && availableDimensions.length === 0) {
        xField = availableMetrics[0];
        yFields = [availableMetrics[1]];
    }

    // 2+ dimensions with no metrics
    else if (availableMetrics.length === 0 && availableDimensions.length >= 2) {
        xField = availableDimensions[0];
        yFields = [availableDimensions[1]];
    }

    return {
        xField,
        yFields,
        pivotFields,
    };
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

    const [availableDimensions, availableMetrics] = useMemo(() => {
        const sortedDimensions = sortDimensions(
            resultsData?.metricQuery.dimensions || [],
            explore,
            columnOrder,
        );
        const metrics = resultsData?.metricQuery.metrics || [];
        return [sortedDimensions, metrics];
    }, [columnOrder, explore, resultsData]);

    // Set default layout and pivot
    useEffect(() => {
        if (
            chartType === ChartType.CARTESIAN &&
            [...availableDimensions, ...availableMetrics].length > 0 &&
            (!dirtyLayout || Object.keys(dirtyLayout).length === 0)
        ) {
            const { xField, yFields, pivotFields } = getDefaultLayout(
                availableDimensions,
                availableMetrics,
            );
            setPivotDimensions(pivotFields);
            setDirtyLayout({
                xField: xField,
                yField: yFields,
            });
        }
    }, [
        dirtyLayout,
        availableDimensions,
        availableMetrics,
        setPivotDimensions,
        setDirtyLayout,
        chartType,
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
        setDirtyLayout,
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
    };
};

export default useCartesianChartConfig;
