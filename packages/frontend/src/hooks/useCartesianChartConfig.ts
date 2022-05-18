import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    CompleteCartesianChartLayout,
    getSeriesId,
    isCompleteEchartsConfig,
    isCompleteLayout,
    Series,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

const useCartesianChartConfig = (
    initialChartConfig: CartesianChart | undefined,
    pivotKey: string | undefined,
    resultsData: ApiQueryResults | undefined,
    setPivotDimensions: React.Dispatch<
        React.SetStateAction<string[] | undefined>
    >,
) => {
    const hasInitialValue =
        !!initialChartConfig &&
        isCompleteLayout(initialChartConfig.layout) &&
        isCompleteEchartsConfig(initialChartConfig.eChartsConfig);

    const [dirtyChartType, setChartType] = useState<CartesianSeriesType>(
        initialChartConfig?.eChartsConfig?.series?.[0]?.type ||
            CartesianSeriesType.BAR,
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

    const setType = useCallback((type: Series['type'], flipAxes: boolean) => {
        setChartType(type);
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
                    })),
                },
        );
    }, []);

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
            yFields.forEach((yField) => {
                updateAllGroupedSeries(yField, {
                    stack: stack ? yField : undefined,
                });
            });
        },
        [updateAllGroupedSeries, dirtyLayout],
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
        const setAxes = (
            prev: Partial<Partial<CompleteCartesianChartLayout>> | undefined,
            xField: string,
            yField: string[],
        ) => {
            const validYFields = prev?.yField
                ? prev.yField.filter((y) => availableFields.includes(y))
                : [];
            return {
                ...prev,
                xField:
                    prev?.xField && availableFields.includes(prev?.xField)
                        ? prev?.xField
                        : xField,
                yField: validYFields.length > 0 ? validYFields : yField,
            };
        };

        const setPivotField = (pivotField: string) => {
            setPivotDimensions((currentPivots) => {
                return currentPivots === undefined
                    ? [pivotField]
                    : currentPivots;
            });
        };

        // Only load this if there are no existing chart configuration (not saved)
        if (hasInitialValue) return;

        // one metric , one dimension
        if (availableMetrics.length === 1 && availableDimensions.length === 1) {
            setDirtyLayout((prev) => {
                return setAxes(prev, availableDimensions[0], [
                    availableMetrics[0],
                ]);
            });
        }

        // one metric, two dimensions
        if (availableMetrics.length === 1 && availableDimensions.length === 2) {
            setDirtyLayout((prev) => {
                return setAxes(prev, availableDimensions[0], [
                    availableMetrics[0],
                ]);
            });
            setPivotField(availableDimensions[1]);
        }

        // two metrics, one dimension
        if (availableMetrics.length === 2 && availableDimensions.length === 1) {
            setDirtyLayout((prev) => {
                return setAxes(prev, availableDimensions[0], availableMetrics);
            });
        }

        // two metrics, two dimensions
        // AND >2 metrics, >2 dimensions
        if (availableMetrics.length >= 2 && availableDimensions.length >= 2) {
            setDirtyLayout((prev) => {
                //Max 4 metrics in Y-axis
                return setAxes(
                    prev,
                    availableDimensions[0],
                    availableMetrics.slice(0, 4),
                );
            });
            setPivotField(availableDimensions[1]);
        }

        // 2+ metrics with no dimensions
        if (availableMetrics.length >= 2 && availableDimensions.length === 0) {
            setDirtyLayout((prev) => {
                return setAxes(prev, availableMetrics[0], [
                    availableMetrics[1],
                ]);
            });
        }

        // 2+ dimensions with no metrics
        if (availableMetrics.length === 0 && availableDimensions.length >= 2) {
            setDirtyLayout((prev) => {
                return setAxes(prev, availableDimensions[0], [
                    availableDimensions[1],
                ]);
            });
        }

        // else , default behaviour
        if (availableFields.length > 1) {
            setDirtyLayout((prev) => {
                const fallbackXField =
                    availableDimensions[0] || availableFields[0];
                const fallbackYField =
                    [...availableMetrics, ...availableTableCalculations][0] ||
                    availableFields[1];
                const validYFields = prev?.yField
                    ? prev.yField.filter((y) => availableFields.includes(y))
                    : [];
                return {
                    ...prev,
                    xField:
                        prev?.xField && availableFields.includes(prev?.xField)
                            ? prev?.xField
                            : fallbackXField,
                    yField:
                        validYFields.length > 0
                            ? validYFields
                            : [fallbackYField],
                };
            });
        }
    }, [
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
    }, [dirtyChartType, dirtyLayout, pivotKey, resultsData]);

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
    };
};

export default useCartesianChartConfig;
