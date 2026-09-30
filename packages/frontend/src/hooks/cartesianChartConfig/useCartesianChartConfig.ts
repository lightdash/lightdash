import {
    getSeriesId,
    isCompleteLayout,
    isNumericItem,
    type CartesianChart,
    type ConditionalFormattingConfig,
    type EchartsGrid,
    type EchartsLegend,
    type ItemsMap,
    type MergeFieldOrigins,
    type MetricQuery,
    type RowLimit,
    type Series,
    type SeriesMetadata,
    type StackType,
    type TableCalculationMetadata,
    type TooltipSortBy,
    type XAxisSort,
} from '@lightdash/common';
import {
    applyCartesianStacking,
    applyCartesianType,
    applyReferenceLines,
    buildCartesianSeries,
    buildValidCartesianConfig,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    getAvailableCartesianFields,
    getCartesianChartType,
    getPendingFieldIds,
    getReferenceLinesFromSeries,
    getXAxisSortConfig,
    hasCartesianCustomColorsStacking,
    isCartesianStacked,
    isColorByCategoryEligible,
    isConditionalFormattingEligible,
    isStackTypeStacked,
    repairCartesianLayout,
    repairConditionalFormattings,
    type CartesianTypeOptions,
    type ReferenceLineField,
} from '@lightdash/visualization';
import { produce } from 'immer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InfiniteQueryResults } from '../useQueryResults';

export {
    applyReferenceLines,
    EMPTY_CARTESIAN_CHART_CONFIG,
    EMPTY_X_AXIS,
    type CartesianTypeOptions,
};

type Args = {
    initialChartConfig: CartesianChart | undefined;
    pivotKeys: string[] | undefined;
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
              fieldOrigins?: MergeFieldOrigins;
          })
        | undefined;
    columnOrder: string[];
    itemsMap: ItemsMap | undefined;
    stacking: boolean | StackType | undefined;
    cartesianType: CartesianTypeOptions | undefined;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    /** The not-yet-run metric query; its fields count as valid layout
     *  references so a just-added field survives until results land. */
    unsavedMetricQuery?: MetricQuery;
};

/**
 * The explorer's editable cartesian config. Every derivation (default
 * layout, expected series, eligibility repairs, the valid config) runs
 * through `@lightdash/visualization`; this hook only holds the editor
 * state and its mutators.
 */
const useCartesianChartConfig = ({
    initialChartConfig,
    pivotKeys,
    resultsData,
    columnOrder,
    itemsMap,
    stacking,
    cartesianType,
    tableCalculationsMetadata,
    unsavedMetricQuery,
}: Args) => {
    const [columnLimit, setColumnLimit] = useState<number | undefined>(
        initialChartConfig?.columnLimit,
    );

    const [dirtyLayout, setDirtyLayout] = useState<
        Partial<CartesianChart['layout']> | undefined
    >(initialChartConfig?.layout);
    const [dirtyMetadata, setDirtyMetadata] = useState<
        CartesianChart['metadata'] | undefined
    >(initialChartConfig?.metadata);
    const [conditionalFormattings, setConditionalFormattings] = useState<
        ConditionalFormattingConfig[]
    >(initialChartConfig?.conditionalFormattings ?? []);

    const [dirtyEchartsConfig, setDirtyEchartsConfig] = useState<
        Partial<CartesianChart['eChartsConfig']> | undefined
    >(
        initialChartConfig?.eChartsConfig
            ? {
                  ...EMPTY_CARTESIAN_CHART_CONFIG.eChartsConfig,
                  ...initialChartConfig.eChartsConfig,
              }
            : initialChartConfig?.eChartsConfig,
    );

    const isInitiallyStacked = useMemo(
        () =>
            isCartesianStacked(
                initialChartConfig?.layout?.stack,
                dirtyEchartsConfig?.series,
            ),
        [dirtyEchartsConfig?.series, initialChartConfig?.layout?.stack],
    );

    const [isStacked, setIsStacked] = useState<boolean>(isInitiallyStacked);

    const [rowLimit, setRowLimit] = useState<RowLimit | undefined>(
        initialChartConfig?.rowLimit,
    );

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

    const setYMinInterval = useCallback(
        (index: number, value: number | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    yAxis: [
                        prevState?.yAxis?.[0] || {},
                        prevState?.yAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index
                            ? { ...axis, minInterval: value }
                            : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXMinValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    xAxis: [
                        prevState?.xAxis?.[0] || {},
                        prevState?.xAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index ? { ...axis, min: value } : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXMinInterval = useCallback(
        (index: number, value: number | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    xAxis: [
                        prevState?.xAxis?.[0] || {},
                        prevState?.xAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index
                            ? { ...axis, minInterval: value }
                            : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXMinOffsetValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    xAxis: [
                        prevState?.xAxis?.[0] || {},
                        prevState?.xAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index
                            ? { ...axis, minOffset: value }
                            : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXMaxValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    xAxis: [
                        prevState?.xAxis?.[0] || {},
                        prevState?.xAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index ? { ...axis, max: value } : axis,
                    ),
                };
            });
        },
        [],
    );

    const setXMaxOffsetValue = useCallback(
        (index: number, value: string | undefined) => {
            setDirtyEchartsConfig((prevState) => {
                return {
                    ...prevState,
                    xAxis: [
                        prevState?.xAxis?.[0] || {},
                        prevState?.xAxis?.[1] || {},
                    ].map((axis, axisIndex) =>
                        axisIndex === index
                            ? { ...axis, maxOffset: value }
                            : axis,
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
    const setShowXAxis = useCallback((hide: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showXAxis: hide,
        }));
    }, []);
    const setShowYAxis = useCallback((hide: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showYAxis: hide,
        }));
    }, []);
    const setShowLeftYAxis = useCallback((show: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showLeftYAxis: show,
        }));
    }, []);
    const setShowRightYAxis = useCallback((show: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            showRightYAxis: show,
        }));
    }, []);
    const setShowAxisTicks = useCallback((show: boolean) => {
        setDirtyEchartsConfig((prev) => ({
            ...prev,
            showAxisTicks: show,
        }));
    }, []);

    const setConnectNulls = useCallback((connect: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            connectNulls: connect,
        }));
    }, []);

    const setColorByCategory = useCallback((enabled: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            colorByCategory: enabled,
        }));
    }, []);

    const setCategoryColorOverride = useCallback(
        (categoryValue: string, color: string) => {
            setDirtyLayout((prev) => ({
                ...prev,
                categoryColorOverrides: {
                    ...prev?.categoryColorOverrides,
                    [categoryValue]: color,
                },
            }));
        },
        [],
    );

    const setAllCategoryColorOverrides = useCallback(
        (overrides: Record<string, string>) => {
            setDirtyLayout((prev) => ({
                ...prev,
                categoryColorOverrides: overrides,
            }));
        },
        [],
    );

    const onSetConditionalFormattings = useCallback(
        (configs: ConditionalFormattingConfig[]) => {
            setConditionalFormattings(configs);

            if (configs.length > 0) {
                setDirtyLayout((prev) => ({
                    ...prev,
                    colorByCategory: undefined,
                }));
            }
        },
        [],
    );

    const setAxisLabelFontSize = useCallback((fontSize: number | undefined) => {
        setDirtyEchartsConfig((prev) => ({
            ...prev,
            axisLabelFontSize: fontSize,
        }));
    }, []);

    const setAxisTitleFontSize = useCallback((fontSize: number | undefined) => {
        setDirtyEchartsConfig((prev) => ({
            ...prev,
            axisTitleFontSize: fontSize,
        }));
    }, []);

    const setXAxisSort = useCallback((sort: XAxisSort) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            const { inverse, sortType } = getXAxisSortConfig(sort);
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, inverse, sortType }, ...axes],
            };
        });
    }, []);
    const setXAxisLabelRotation = useCallback((rotation: number) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, rotate: rotation }, ...axes],
            };
        });
    }, []);
    const setScrollableChart = useCallback((enableDataZoom: boolean) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, enableDataZoom }, ...axes],
            };
        });
    }, []);
    const setXAxisTreatAsCategory = useCallback((treatAsCategory: boolean) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, treatAsCategory }, ...axes],
            };
        });
    }, []);
    const setDataZoomAnchor = useCallback((dataZoomAnchor: 'start' | 'end') => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, dataZoomAnchor }, ...axes],
            };
        });
    }, []);
    const setDataZoomItemCount = useCallback((dataZoomItemCount: number) => {
        setDirtyEchartsConfig((prevState) => {
            const [firstAxis, ...axes] = prevState?.xAxis || [];
            return {
                ...prevState,
                xAxis: [{ ...firstAxis, dataZoomItemCount }, ...axes],
            };
        });
    }, []);
    const addSingleSeries = useCallback((yField: string) => {
        setDirtyLayout((prev) => ({
            ...prev,
            yField: [...(prev?.yField || []), yField],
            // Color by category only works for single-series; clear when adding another
            ...((prev?.yField?.length ?? 0) >= 1 && {
                colorByCategory: undefined,
                categoryColorOverrides: undefined,
            }),
        }));
        setConditionalFormattings((prev) => (prev.length > 0 ? [] : prev));
    }, []);

    const removeSingleSeries = useCallback((index: number) => {
        setDirtyEchartsConfig((prev) => {
            /**
             * Clean up any color data assigned to this series, to prevent confusing
             * behaviors around reordering and deleting/re-adding series.
             */
            if (prev?.series && prev.series[index]) {
                const newSeries = [...prev.series];
                newSeries[index] = {
                    ...newSeries[index],
                    color: undefined,
                };

                return {
                    ...prev,
                    series: newSeries,
                };
            }

            return prev;
        });
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

    const updateYField = useCallback((index: number, fieldId: string) => {
        setDirtyLayout((prev) => ({
            ...prev,
            yField: prev?.yField?.map((field, i) => {
                return i === index ? fieldId : field;
            }),
        }));
    }, []);

    const setType = useCallback(
        (type: Series['type'], flipAxes: boolean, hasAreaStyle: boolean) => {
            const options: CartesianTypeOptions = {
                type,
                flipAxes,
                hasAreaStyle,
            };
            setDirtyLayout(
                (prev) => applyCartesianType(prev, undefined, options).layout,
            );
            setDirtyEchartsConfig(
                (prevState) =>
                    applyCartesianType(undefined, prevState, options)
                        .eChartsConfig,
            );
        },
        [],
    );

    useEffect(() => {
        if (cartesianType !== undefined) {
            setType(
                cartesianType.type,
                cartesianType.flipAxes,
                cartesianType.hasAreaStyle,
            );
        }
    }, [cartesianType, setType]);

    const setFlipAxis = useCallback((flipAxes: boolean) => {
        setDirtyLayout((prev) => ({
            ...prev,
            flipAxes,
        }));
    }, []);

    const updateAllGroupedSeries = useCallback(
        (fieldKey: string, updateSeries: Partial<Series>) =>
            setDirtyEchartsConfig(
                produce((draft) => {
                    if (!draft) return;

                    draft.series = draft.series?.map((series) =>
                        series.encode.yRef.field === fieldKey
                            ? { ...series, ...updateSeries }
                            : series,
                    );
                }),
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

    const getSingleSeries = useCallback(
        (series: Series) =>
            dirtyEchartsConfig?.series?.find(
                (s) => getSeriesId(s) === getSeriesId(series),
            ),
        [dirtyEchartsConfig?.series],
    );

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
        (stack: boolean | StackType) => {
            // The y fields the stack applies to are read once, from the
            // layout at call time, as they always were.
            const layoutWithYFields = { yField: dirtyLayout?.yField };

            setIsStacked(isStackTypeStacked(stack));

            // Store the stack type in the layout
            setDirtyLayout(
                (prev) =>
                    applyCartesianStacking(
                        { ...prev, ...layoutWithYFields },
                        undefined,
                        stack,
                        pivotKeys,
                    ).layout,
            );

            setDirtyEchartsConfig(
                (prevState) =>
                    applyCartesianStacking(
                        layoutWithYFields,
                        prevState,
                        stack,
                        pivotKeys,
                    ).eChartsConfig,
            );
        },
        [dirtyLayout?.yField, pivotKeys],
    );

    useEffect(() => {
        // If the xField is a table calculation and its type is a number, do not stack
        // This is computed on first load and also when the table calculation is updated in edit mode
        if (stacking === false) return;
        const tableCalculation =
            resultsData?.metricQuery?.tableCalculations?.find(
                (tc) => tc.name === dirtyLayout?.xField,
            );
        if (tableCalculation) {
            const isNumber = isNumericItem(tableCalculation);
            if (isNumber) setStacking(false);
        }
    }, [
        dirtyLayout?.xField,
        resultsData?.metricQuery?.tableCalculations,
        stacking,
        setStacking,
    ]);

    useEffect(() => {
        if (stacking !== undefined) {
            setStacking(stacking);
        }
    }, [stacking, setStacking]);

    const { availableFields, availableDimensions, availableMetrics } = useMemo(
        () =>
            getAvailableCartesianFields({
                metricQuery: resultsData?.metricQuery,
                itemsMap,
                columnOrder,
            }),
        [resultsData?.metricQuery, itemsMap, columnOrder],
    );

    // `availableFields` only knows the last run; a field just added from a
    // config picker must not be stripped before its results land.
    const pendingFieldIds = useMemo(
        () => getPendingFieldIds(unsavedMetricQuery),
        [unsavedMetricQuery],
    );

    // Set fallout layout values
    // https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
    useEffect(() => {
        if (availableFields.length > 0) {
            setDirtyLayout((prev) =>
                repairCartesianLayout({
                    layout: prev,
                    availableFields,
                    availableDimensions,
                    availableMetrics,
                    tableCalculationsMetadata,
                    pendingFieldIds,
                }),
            );
        }
    }, [
        availableDimensions,
        availableFields,
        availableMetrics,
        pivotKeys,
        tableCalculationsMetadata,
        pendingFieldIds,
        itemsMap,
    ]);

    const selectedReferenceLines: ReferenceLineField[] = useMemo(
        () =>
            getReferenceLinesFromSeries(
                dirtyEchartsConfig?.series,
                dirtyLayout?.flipAxes,
            ),
        [dirtyEchartsConfig?.series, dirtyLayout?.flipAxes],
    );

    const [referenceLines, setReferenceLines] = useState<ReferenceLineField[]>(
        selectedReferenceLines,
    );

    const [tooltip, setTooltip] = useState<string | undefined>(
        dirtyEchartsConfig?.tooltip,
    );

    const [tooltipSort, setTooltipSort] = useState<TooltipSortBy | undefined>(
        dirtyEchartsConfig?.tooltipSort,
    );

    // Track series hidden states to trigger reference line redistribution
    const seriesHiddenStatesKey = useMemo(() => {
        const hiddenStates =
            dirtyEchartsConfig?.series?.map((s) => ({
                id: getSeriesId(s),
                hidden: !!s.hidden,
            })) || [];
        // Use JSON.stringify for stable comparison
        return JSON.stringify(hiddenStates);
    }, [dirtyEchartsConfig?.series]);

    // Generate expected series
    useEffect(() => {
        if (isCompleteLayout(dirtyLayout) && resultsData?.hasFetchedAllRows) {
            setDirtyEchartsConfig((prev) => ({
                ...prev,
                series: buildCartesianSeries({
                    layout: dirtyLayout,
                    existingSeries: prev?.series,
                    isStacked,
                    pivotKeys,
                    resultsData,
                    itemsMap,
                    columnLimit,
                    referenceLines,
                }),
            }));
        }
    }, [
        dirtyLayout,
        pivotKeys,
        resultsData,
        availableDimensions,
        isStacked,
        referenceLines,
        itemsMap,
        seriesHiddenStatesKey, // Re-run when series hidden states change
        columnLimit,
    ]);

    const dirtyChartType = useMemo(
        () => getCartesianChartType(dirtyEchartsConfig?.series),
        [dirtyEchartsConfig?.series],
    );

    const hasCustomColorsStacking = useMemo(
        () =>
            hasCartesianCustomColorsStacking(
                dirtyEchartsConfig?.series,
                dirtyLayout?.stack,
            ),
        [dirtyEchartsConfig?.series, dirtyLayout?.stack],
    );

    const isConditionalFormattingAllowed = useMemo(
        () =>
            isConditionalFormattingEligible(
                dirtyEchartsConfig?.series,
                pivotKeys,
            ),
        [dirtyEchartsConfig?.series, pivotKeys],
    );

    const isColorByCategoryAllowed = useMemo(
        () =>
            isColorByCategoryEligible({
                series: dirtyEchartsConfig?.series,
                pivotKeys,
                layout: dirtyLayout,
            }),
        [dirtyEchartsConfig?.series, pivotKeys, dirtyLayout],
    );

    useEffect(() => {
        if (isColorByCategoryAllowed) return;

        if (
            !dirtyLayout?.colorByCategory &&
            !dirtyLayout?.categoryColorOverrides
        ) {
            return;
        }

        setDirtyLayout((prev) => ({
            ...prev,
            colorByCategory: undefined,
            categoryColorOverrides: undefined,
        }));
    }, [
        isColorByCategoryAllowed,
        dirtyLayout?.colorByCategory,
        dirtyLayout?.categoryColorOverrides,
    ]);

    useEffect(() => {
        if (isConditionalFormattingAllowed) return;

        setConditionalFormattings((prev) => (prev.length === 0 ? prev : []));
    }, [isConditionalFormattingAllowed]);

    // Repair configs whose target no longer exists on the chart (e.g. the
    // metric was swapped or removed) by pointing them at the first metric.
    useEffect(() => {
        if (!isConditionalFormattingAllowed) return;

        const yFields = dirtyLayout?.yField ?? [];
        if (!yFields[0]) return;

        setConditionalFormattings((prev) =>
            repairConditionalFormattings({
                conditionalFormattings: prev,
                yFields,
                hasCustomColorsStacking,
            }),
        );
    }, [
        isConditionalFormattingAllowed,
        hasCustomColorsStacking,
        dirtyLayout?.yField,
    ]);

    const validConfig: CartesianChart = useMemo(
        () =>
            buildValidCartesianConfig({
                layout: dirtyLayout,
                eChartsConfig: dirtyEchartsConfig,
                conditionalFormattings,
                metadata: dirtyMetadata,
                tooltip,
                tooltipSort,
                rowLimit,
                columnLimit,
            }),
        [
            dirtyLayout,
            dirtyEchartsConfig,
            conditionalFormattings,
            dirtyMetadata,
            tooltip,
            tooltipSort,
            rowLimit,
            columnLimit,
        ],
    );

    const updateMetadata = useCallback(
        (metadata: Record<string, SeriesMetadata>) => {
            setDirtyMetadata(metadata);
        },
        [],
    );

    return {
        validConfig,
        dirtyChartType,
        dirtyLayout,
        dirtyEchartsConfig,
        dirtyMetadata,
        setXField,
        setType,
        setXAxisName,
        setYAxisName,
        setStacking,
        isStacked,
        addSingleSeries,
        updateSingleSeries,
        getSingleSeries,
        removeSingleSeries,
        updateAllGroupedSeries,
        updateYField,
        setFlipAxis,
        setYMinValue,
        setYMaxValue,
        setYMinInterval,
        setXMinValue,
        setXMinInterval,
        setXMinOffsetValue,
        setXMaxValue,
        setXMaxOffsetValue,
        setLegend,
        setGrid,
        setShowGridX,
        setShowGridY,
        setShowXAxis,
        setShowYAxis,
        setShowLeftYAxis,
        setShowRightYAxis,
        setShowAxisTicks,
        setConnectNulls,
        setColorByCategory,
        setCategoryColorOverride,
        setAllCategoryColorOverrides,
        conditionalFormattings,
        onSetConditionalFormattings,
        setAxisLabelFontSize,
        setAxisTitleFontSize,
        setXAxisSort,
        setXAxisLabelRotation,
        setScrollableChart,
        setXAxisTreatAsCategory,
        setDataZoomAnchor,
        setDataZoomItemCount,
        updateSeries,
        referenceLines,
        setReferenceLines,
        tooltip,
        setTooltip,
        tooltipSort,
        setTooltipSort,
        updateMetadata,
        rowLimit,
        setRowLimit,
        columnLimit,
        setColumnLimit,
    };
};

export default useCartesianChartConfig;
