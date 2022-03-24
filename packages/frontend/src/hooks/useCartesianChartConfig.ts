import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    getSeriesId,
    isCompleteEchartsConfig,
    isCompleteLayout,
    Series,
} from 'common';
import { useCallback, useEffect, useMemo, useState } from 'react';
const useCartesianChartConfig = (
    chartConfigs: CartesianChart | undefined,
    pivotKey: string | undefined,
    resultsData: ApiQueryResults | undefined,
) => {
    const [dirtyChartType, setChartType] = useState<CartesianSeriesType>(
        chartConfigs?.eChartsConfig.series?.[0]?.type ||
            CartesianSeriesType.BAR,
    );
    const [dirtyLayout, setDirtyLayout] = useState<
        Partial<CartesianChart['layout']> | undefined
    >(chartConfigs?.layout);
    const [dirtyEchartsConfig, setDirtyEchartsConfig] = useState<
        Partial<CartesianChart['eChartsConfig']> | undefined
    >(chartConfigs?.eChartsConfig);

    useEffect(() => {
        setChartType(
            chartConfigs?.eChartsConfig.series?.[0]?.type ||
                CartesianSeriesType.BAR,
        );
        setDirtyLayout(chartConfigs?.layout);
        setDirtyEchartsConfig(chartConfigs?.eChartsConfig);
    }, [chartConfigs]);

    const setXAxisName = useCallback((name: string) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, name }, ...axes],
            };
        });
    }, []);

    const setYAxisName = useCallback((name: string) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.yAxis || [];
            return {
                ...prevState,
                yAxis: [{ ...firstAxis, name }, ...axes],
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

    const setLabel = useCallback((label: Series['label']) => {
        setDirtyEchartsConfig(
            (prevState) =>
                prevState && {
                    ...prevState,
                    series: prevState?.series?.map((series) => ({
                        ...series,
                        label: {
                            show:
                                label?.show !== undefined
                                    ? label?.show
                                    : series.label?.show,
                            position:
                                label?.position !== undefined
                                    ? label?.position
                                    : series.label?.position,
                        },
                    })),
                },
        );
    }, []);

    const updateSingleSeries = useCallback(
        (index: number, updatedSeries: Partial<Series>) => {
            setDirtyEchartsConfig((prev) => {
                return {
                    ...prev,
                    series: prev?.series
                        ? [
                              ...prev.series.slice(0, index),
                              { ...prev?.series[index], ...updatedSeries },
                              ...prev.series.slice(index + 1),
                          ]
                        : [],
                };
            });
        },
        [],
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
    useEffect(() => {
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
    ]);

    // Generate expected series
    useEffect(() => {
        if (isCompleteLayout(dirtyLayout)) {
            let expectedSeriesMap: Record<string, Series>;
            if (pivotKey) {
                const uniquePivotValues: string[] = Array.from(
                    new Set(resultsData?.rows.map((row) => row[pivotKey])),
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
        setLabel,
        addSingleSeries,
        updateSingleSeries,
        removeSingleSeries,
    };
};

export default useCartesianChartConfig;
