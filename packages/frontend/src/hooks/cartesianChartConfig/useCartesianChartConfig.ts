import {
    ApiQueryResults,
    CartesianChart,
    CartesianSeriesType,
    ChartType,
    CompleteCartesianChartLayout,
    EchartsGrid,
    EchartsLegend,
    Explore,
    getSeriesId,
    isCompleteEchartsConfig,
    isCompleteLayout,
    MarkLineData,
    Series,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getMarkLineAxis,
    ReferenceLineField,
} from '../../components/common/ReferenceLine';
import {
    getExpectedSeriesMap,
    mergeExistingAndExpectedSeries,
    sortDimensions,
} from './utils';

type Args = {
    chartType: ChartType;
    initialChartConfig: CartesianChart | undefined;
    pivotKeys: string[] | undefined;
    resultsData: ApiQueryResults | undefined;
    setPivotDimensions: React.Dispatch<
        React.SetStateAction<string[] | undefined>
    >;
    columnOrder: string[];
    explore: Explore | undefined;
};

const applyReferenceLines = (
    series: Series[],
    dirtyLayout: Partial<Partial<CompleteCartesianChartLayout>> | undefined,
    referenceLines: ReferenceLineField[],
): Series[] => {
    let appliedReferenceLines: string[] = []; // Don't apply the same reference line to multiple series
    return series.map((serie) => {
        const referenceLinesForSerie = referenceLines.filter(
            (referenceLine) => {
                if (referenceLine.fieldId === undefined) return false;
                if (appliedReferenceLines.includes(referenceLine.fieldId))
                    return false;
                return (
                    referenceLine.fieldId === serie.encode?.xRef.field ||
                    referenceLine.fieldId === serie.encode?.yRef.field
                );
            },
        );

        if (referenceLinesForSerie.length === 0) return serie;
        const markLineData: MarkLineData[] = referenceLinesForSerie.map(
            (line) => {
                if (line.fieldId === undefined) return line.data;
                const value = line.data.xAxis || line.data.yAxis;
                if (value === undefined) return line.data;
                appliedReferenceLines.push(line.fieldId);

                const axis = getMarkLineAxis(
                    dirtyLayout?.xField,
                    dirtyLayout?.flipAxes || false,
                    line.fieldId,
                );

                return {
                    ...line.data,
                    xAxis: undefined,
                    yAxis: undefined,
                    [axis]: value,
                };
            },
        );

        return {
            ...serie,
            markLine: {
                symbol: 'none',
                lineStyle: {
                    color: '#000',
                    width: 3,
                    type: 'solid',
                },
                data: markLineData,
            },
        };
    });
};

const useCartesianChartConfig = ({
    chartType,
    initialChartConfig,
    pivotKeys,
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
        const removePropertiesWithAuto = Object.entries(
            legend,
        ).reduce<EchartsLegend>((acc, [key, value]) => {
            if (value === 'auto') return acc;
            return { ...acc, [key]: value };
        }, {});

        setDirtyEchartsConfig((prevState) => {
            return {
                ...prevState,
                legend: removePropertiesWithAuto,
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

    const updateSeries = useCallback((series: Series[]) => {
        setDirtyEchartsConfig((prev) => {
            if (prev) {
                return {
                    ...prev,
                    series,
                };
            }
            return prev;
        });
    }, []);

    const setStacking = useCallback(
        (stack: boolean) => {
            const yFields = dirtyLayout?.yField || [];
            const isPivoted = pivotKeys && pivotKeys.length > 0;
            setIsStacked(stack);
            yFields.forEach((yField) => {
                updateAllGroupedSeries(yField, {
                    stack: stack
                        ? isPivoted
                            ? yField
                            : 'stack-all-series'
                        : undefined,
                });
            });
        },
        [dirtyLayout?.yField, updateAllGroupedSeries, pivotKeys],
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
        availableFields,
        availableDimensions,
        availableMetrics,
        availableTableCalculations,
        hasInitialValue,
        explore,
        setPivotDimensions,
        setType,
    ]);

    const selectedReferenceLines: ReferenceLineField[] = useMemo(() => {
        if (dirtyEchartsConfig?.series === undefined) return [];
        return dirtyEchartsConfig.series.reduce<ReferenceLineField[]>(
            (acc, serie) => {
                const data = serie.markLine?.data;
                if (data !== undefined) {
                    const referenceLine = data.map((markData) => {
                        const axis =
                            markData.xAxis !== undefined
                                ? dirtyLayout?.flipAxes
                                    ? serie.encode.yRef
                                    : serie.encode.xRef
                                : dirtyLayout?.flipAxes
                                ? serie.encode.xRef
                                : serie.encode.yRef;
                        return {
                            fieldId: axis.field,
                            data: {
                                label: serie.markLine?.label,
                                lineStyle: serie.markLine?.lineStyle,
                                ...markData,
                            },
                        };
                    });

                    return [...acc, ...referenceLine];
                }
                return acc;
            },
            [],
        );
    }, [dirtyEchartsConfig?.series, dirtyLayout?.flipAxes]);

    const [referenceLines, setReferenceLines] = useState<ReferenceLineField[]>(
        selectedReferenceLines,
    );
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
                let expectedSeriesMap = getExpectedSeriesMap({
                    defaultAreaStyle,
                    defaultCartesianType,
                    availableDimensions,
                    isStacked,
                    pivotKeys,
                    resultsData,
                    xField: dirtyLayout.xField,
                    yFields: dirtyLayout.yField,
                });
                let newSeries = mergeExistingAndExpectedSeries({
                    expectedSeriesMap,
                    existingSeries: prev?.series || [],
                });

                const seriesWithReferenceLines = applyReferenceLines(
                    newSeries,
                    dirtyLayout,
                    referenceLines,
                );

                return {
                    ...prev,
                    series: seriesWithReferenceLines,
                };
            });
        }
    }, [
        dirtyLayout,
        pivotKeys,
        resultsData,
        availableDimensions,
        isStacked,
        referenceLines,
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
        updateSeries,
        referenceLines,
        setReferenceLines,
    };
};

export default useCartesianChartConfig;
