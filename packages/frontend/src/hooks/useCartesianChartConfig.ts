import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    EchartsGrid,
    EchartsLegend,
    getSeriesId,
    isCompleteEchartsConfig,
    isCompleteLayout,
    Series,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Args = {
    initialChartConfig: CartesianChart | undefined;
    pivotKey: string | undefined;
    resultsData: ApiQueryResults | undefined;
    setPivotDimensions: React.Dispatch<
        React.SetStateAction<string[] | undefined>
    >;
};

const useCartesianChartConfig = ({
    initialChartConfig,
    pivotKey,
    resultsData,
    setPivotDimensions,
}: Args) => {
    const hasInitialValue =
        !!initialChartConfig &&
        isCompleteLayout(initialChartConfig.layout) &&
        isCompleteEchartsConfig(initialChartConfig.eChartsConfig);

    const [dirtyChartType, setChartType] = useState<CartesianSeriesType>(
        initialChartConfig?.eChartsConfig?.series?.[0]?.type ||
            CartesianSeriesType.BAR,
    );

    const [areaStyle, setAreaStyle] = useState<boolean>(
        !!initialChartConfig?.eChartsConfig?.series?.[0]?.areaStyle,
    );
    const [dirtyLayout, setDirtyLayout] = useState<
        Partial<CartesianChart['layout']> | undefined
    >(initialChartConfig?.layout);
    const [dirtyEchartsConfig, setDirtyEchartsConfig] = useState<
        Partial<CartesianChart['eChartsConfig']> | undefined
    >(initialChartConfig?.eChartsConfig);

    const isStacked = (dirtyEchartsConfig?.series || []).some(
        (series: Series) => series.stack !== undefined,
    );

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
            setChartType(type);
            setAreaStyle(hasAreaStyle);
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
        (fieldKey: string, updateSeries: Partial<Series>) => {
            return setDirtyEchartsConfig((prevState) => {
                if (updateSeries.type) {
                    //TODO check types from other series, if not all the same, set to Mixed
                    setType(
                        updateSeries.type,
                        false,
                        updateSeries.areaStyle !== undefined,
                    );
                }
                return (
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
                    }
                );
            });
        },
        [setType],
    );

    const updateSingleSeries = useCallback(
        (updatedSeries: Series) => {
            setDirtyEchartsConfig((prev) => {
                if (updatedSeries.type) {
                    //TODO check types from other series, if not all the same, set to Mixed
                    setType(
                        updatedSeries.type,
                        false,
                        updatedSeries.areaStyle !== undefined,
                    );
                }
                return {
                    ...prev,
                    series: (prev?.series || []).map((currentSeries) =>
                        getSeriesId(currentSeries) ===
                        getSeriesId(updatedSeries)
                            ? { ...currentSeries, ...updatedSeries }
                            : currentSeries,
                    ),
                };
            });
        },
        [setType],
    );
    const setStacking = useCallback(
        (stack: boolean) => {
            const yFields = dirtyLayout?.yField || [];
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

    const [
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
    ] = useMemo(() => {
        const dimensions = resultsData?.metricQuery.dimensions || [];
        const metrics = resultsData?.metricQuery.metrics || [];
        const tableCalculations =
            resultsData?.metricQuery.tableCalculations.map(
                ({ name }) => name,
            ) || [];
        return [
            [...dimensions, ...metrics, ...tableCalculations],
            dimensions,
            metrics,
            tableCalculations,
        ];
    }, [resultsData]);

    // Set fallout layout values
    // https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
    useEffect(() => {
        if (availableFields.length > 0) {
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

                // two metrics, one dimension
                else if (
                    availableMetrics.length === 2 &&
                    availableDimensions.length === 1
                ) {
                    newXField = availableDimensions[0];
                    newYFields = availableMetrics;
                }

                // two metrics, two dimensions
                // AND >2 metrics, >2 dimensions
                else if (
                    availableMetrics.length >= 2 &&
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

                setPivotDimensions(newPivotFields);
                return {
                    ...prev,
                    xField: newXField,
                    yField: newYFields,
                };
            });
        }
    }, [
        pivotKey,
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
        hasInitialValue,
        setPivotDimensions,
        setType,
    ]);

    // Generate expected series
    useEffect(() => {
        const areaStyleConfig = areaStyle ? {} : undefined;

        if (isCompleteLayout(dirtyLayout) && resultsData) {
            let expectedSeriesMap: Record<string, Series>;
            if (pivotKey) {
                const uniquePivotValues: string[] = Array.from(
                    new Set(
                        resultsData?.rows.map((row) => row[pivotKey].value.raw),
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
                            type: dirtyChartType,
                            areaStyle: areaStyleConfig,
                        };
                        return { ...sum, [getSeriesId(series)]: series };
                    }

                    const groupSeries = uniquePivotValues.reduce<
                        Record<string, Series>
                    >((acc, rawValue) => {
                        const pivotSeries: Series = {
                            type: dirtyChartType,
                            encode: {
                                xRef: { field: dirtyLayout.xField },
                                yRef: {
                                    field: yField,
                                    pivotValues: [
                                        { field: pivotKey, value: rawValue },
                                    ],
                                },
                            },
                            areaStyle: areaStyleConfig,
                            stack: areaStyle ? yField : undefined,
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
                        type: dirtyChartType,
                        areaStyle: areaStyleConfig,
                        stack: areaStyle ? 'stack-all-series' : undefined,
                    };
                    return { ...sum, [getSeriesId(series)]: series };
                }, {});
            }
            setDirtyEchartsConfig((prev) => {
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
    }, [
        dirtyChartType,
        dirtyLayout,
        pivotKey,
        resultsData,
        areaStyle,
        availableDimensions,
    ]);

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

    const chartType =
        dirtyChartType === CartesianSeriesType.LINE && areaStyle
            ? CartesianSeriesType.AREA
            : dirtyChartType;
    return {
        validCartesianConfig,
        dirtyChartType: chartType,
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
    };
};

export default useCartesianChartConfig;
