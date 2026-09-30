import {
    assertUnreachable,
    CartesianSeriesType,
    DimensionType,
    getItemType,
    hashFieldReference,
    isCompleteEchartsConfig,
    isCompleteLayout,
    isNumericItem,
    isUnambiguousTemporalString,
    MetricType,
    StackType,
    TableCalculationType,
    XAxisSort,
    XAxisSortType,
    type CartesianChart,
    type CompleteCartesianChartLayout,
    type ConditionalFormattingConfig,
    type ItemsMap,
    type MarkLineData,
    type MetricQuery,
    type PivotReference,
    type Series,
    type TableCalculationMetadata,
    type TooltipSortBy,
    type XAxis,
} from '@lightdash/common';
import { getMergeDefaultYAxisIndexByField } from '../merge/defaultYAxisIndex';
import { type VisualizationResults } from '../types';
import {
    getExpectedSeriesMap,
    isPivotSeriesOrderDeterminedByQuery,
    mergeExistingAndExpectedSeries,
    sortDimensions,
} from './series';

export const EMPTY_X_AXIS = 'empty_x_axis';

export type CartesianTypeOptions = {
    type: CartesianSeriesType;
    flipAxes: boolean;
    hasAreaStyle: boolean;
};

export type ReferenceLineField = {
    fieldId?: string;
    fieldRef?: PivotReference;
    data: MarkLineData;
};

/** Which ECharts axis a reference line on `fieldId` belongs to. */
export const getMarkLineAxis = (
    xField: string | undefined,
    flipAxes: boolean | undefined,
    fieldId: string,
): string => {
    const isDefaultXAxis = xField === fieldId;
    if (flipAxes) {
        return isDefaultXAxis ? 'yAxis' : 'xAxis';
    }
    return isDefaultXAxis ? 'xAxis' : 'yAxis';
};

const getReferenceLineKey = ({ fieldId, fieldRef, data }: ReferenceLineField) =>
    [
        fieldRef ? hashFieldReference(fieldRef) : undefined,
        fieldId,
        data.uuid,
        data.value,
        data.name,
        data.type,
        data.dynamicValue,
        data.xAxis,
        data.yAxis,
        data.label?.formatter,
        data.label?.position,
        data.lineStyle?.color,
    ]
        .map((value) => value ?? '')
        .join('|');

const getReferenceFieldId = (referenceLine: ReferenceLineField) =>
    referenceLine.fieldRef?.field ?? referenceLine.fieldId;

const getReferenceKey = (reference: PivotReference) =>
    hashFieldReference(reference);

const getReferenceLineSeriesKey = (referenceLine: ReferenceLineField) =>
    referenceLine.fieldRef
        ? getReferenceKey(referenceLine.fieldRef)
        : undefined;

const doesReferenceMatchSeries = (
    referenceLine: ReferenceLineField,
    serie: Series,
) => {
    const referenceKey = getReferenceLineSeriesKey(referenceLine);
    if (!serie.encode) return false;

    if (referenceKey) {
        return (
            referenceKey === getReferenceKey(serie.encode.xRef) ||
            referenceKey === getReferenceKey(serie.encode.yRef)
        );
    }

    const fieldId = referenceLine.fieldId;
    if (fieldId === undefined) return false;
    return (
        fieldId === serie.encode.xRef.field ||
        fieldId === serie.encode.yRef.field
    );
};

const dedupeReferenceLines = (referenceLines: ReferenceLineField[]) => {
    const seen = new Set<string>();

    return referenceLines.filter((referenceLine) => {
        const key = getReferenceLineKey(referenceLine);
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
};

const isTemporalReferenceField = (
    item: ItemsMap[string] | undefined,
): boolean => {
    if (!item) return false;
    const type = getItemType(item);
    return [
        DimensionType.DATE,
        DimensionType.TIMESTAMP,
        MetricType.DATE,
        MetricType.TIMESTAMP,
        TableCalculationType.DATE,
        TableCalculationType.TIMESTAMP,
    ].includes(type);
};

const resolveReferenceLineFieldId = (
    referenceLine: ReferenceLineField,
    dirtyLayout: Partial<Partial<CompleteCartesianChartLayout>> | undefined,
    mappingContext:
        | {
              itemsMap: ItemsMap | undefined;
              resolvedTimezone: string | undefined;
          }
        | undefined,
): string | undefined => {
    const fieldId = getReferenceFieldId(referenceLine);
    if (
        mappingContext?.resolvedTimezone === undefined ||
        referenceLine.fieldRef ||
        !fieldId
    ) {
        return fieldId;
    }
    const timeFieldId = dirtyLayout?.xField;
    if (!timeFieldId || timeFieldId === fieldId || !mappingContext.itemsMap) {
        return fieldId;
    }
    const timeField = mappingContext.itemsMap[timeFieldId];
    const attributedField = mappingContext.itemsMap[fieldId];
    if (
        !isTemporalReferenceField(timeField) ||
        !isNumericItem(attributedField)
    ) {
        return fieldId;
    }
    const raw = referenceLine.data.xAxis ?? referenceLine.data.yAxis;
    return isUnambiguousTemporalString(raw) ? timeFieldId : fieldId;
};

export const applyReferenceLines = (
    series: Series[],
    dirtyLayout: Partial<Partial<CompleteCartesianChartLayout>> | undefined,
    referenceLines: ReferenceLineField[],
    mappingContext?: {
        itemsMap: ItemsMap | undefined;
        resolvedTimezone: string | undefined;
    },
): Series[] => {
    // Track which reference lines have been applied to visible series
    let appliedReferenceLines: string[] = [];
    const uniqueReferenceLines = dedupeReferenceLines(referenceLines).map(
        (referenceLine) => {
            const fieldId = resolveReferenceLineFieldId(
                referenceLine,
                dirtyLayout,
                mappingContext,
            );
            return fieldId === getReferenceFieldId(referenceLine)
                ? referenceLine
                : { ...referenceLine, fieldId };
        },
    );

    return series.map((serie) => {
        // If series is filtered out or hidden, ensure it has no markLine
        // but DON'T mark the reference line as applied so another visible series can pick it up
        if (serie.isFilteredOut || serie.hidden) {
            return { ...serie, markLine: undefined };
        }

        const referenceLinesForSerie = uniqueReferenceLines.filter(
            (referenceLine) => {
                const appliedKey =
                    getReferenceLineSeriesKey(referenceLine) ??
                    getReferenceFieldId(referenceLine);
                if (appliedKey === undefined) return false;
                if (appliedReferenceLines.includes(appliedKey)) return false;
                return doesReferenceMatchSeries(referenceLine, serie);
            },
        );

        if (referenceLinesForSerie.length === 0)
            return { ...serie, markLine: undefined };

        const markLineData: MarkLineData[] = referenceLinesForSerie.map(
            (line) => {
                const fieldId = getReferenceFieldId(line);
                if (fieldId === undefined) return line.data;
                appliedReferenceLines.push(
                    getReferenceLineSeriesKey(line) ?? fieldId,
                );
                const value = line.data.xAxis || line.data.yAxis;
                if (value === undefined) return line.data;

                const axis = getMarkLineAxis(
                    dirtyLayout?.xField,
                    dirtyLayout?.flipAxes || false,
                    fieldId,
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

/**
 * The reference lines a chart's series carry, one per mark line, keyed to
 * the field the line sits on.
 */
export const getReferenceLinesFromSeries = (
    series: Series[] | undefined,
    flipAxes: boolean | undefined,
): ReferenceLineField[] => {
    if (series === undefined) return [];
    return dedupeReferenceLines(
        series.reduce<ReferenceLineField[]>((acc, serie) => {
            const data = serie.markLine?.data;
            if (data !== undefined) {
                const referenceLine = data.map((markData) => {
                    const axis =
                        markData.xAxis !== undefined
                            ? flipAxes
                                ? serie.encode.yRef
                                : serie.encode.xRef
                            : flipAxes
                              ? serie.encode.xRef
                              : serie.encode.yRef;
                    return {
                        fieldId: axis.field,
                        fieldRef:
                            markData.dynamicValue === 'average' ||
                            markData.type === 'average'
                                ? axis
                                : undefined,
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
        }, []),
    );
};

export function getXAxisSortConfig(
    sort: XAxisSort,
): Pick<XAxis, 'inverse' | 'sortType'> {
    switch (sort) {
        case XAxisSort.DEFAULT:
            return {
                inverse: false,
                sortType: XAxisSortType.DEFAULT,
            };
        case XAxisSort.DEFAULT_REVERSED:
            return {
                inverse: true,
                sortType: XAxisSortType.DEFAULT,
            };
        case XAxisSort.ASCENDING:
            return {
                inverse: false,
                sortType: XAxisSortType.CATEGORY,
            };
        case XAxisSort.DESCENDING:
            return {
                inverse: true,
                sortType: XAxisSortType.CATEGORY,
            };
        case XAxisSort.BAR_TOTALS_ASCENDING:
            return {
                inverse: false,
                sortType: XAxisSortType.BAR_TOTALS,
            };
        case XAxisSort.BAR_TOTALS_DESCENDING:
            return {
                inverse: true,
                sortType: XAxisSortType.BAR_TOTALS,
            };
        default:
            return assertUnreachable(sort, `Invalid sort ${sort}`);
    }
}

export const EMPTY_CARTESIAN_CHART_CONFIG: CartesianChart = {
    layout: {},
    eChartsConfig: {
        showAxisTicks: false, // New charts default to hiding tick lines
    },
};

type CartesianLayout = Partial<CartesianChart['layout']> | undefined;
type CartesianEchartsConfig =
    | Partial<CartesianChart['eChartsConfig']>
    | undefined;

/** Whether a chart is stacked: the layout's persisted stack setting, else any series with a stack. */
export const isCartesianStacked = (
    layoutStack: CartesianChart['layout']['stack'] | undefined,
    series: Series[] | undefined,
): boolean => {
    // First check the layout's stack property (persisted setting)
    if (layoutStack !== undefined) {
        return layoutStack !== StackType.NONE && layoutStack !== false;
    }
    // Fall back to checking if any series has stack property
    return (series || []).some((serie: Series) => serie.stack !== undefined);
};

/** Turns a series type change into the layout and series it implies. */
export const applyCartesianType = (
    layout: CartesianLayout,
    eChartsConfig: CartesianEchartsConfig,
    { type, flipAxes, hasAreaStyle }: CartesianTypeOptions,
): { layout: CartesianLayout; eChartsConfig: CartesianEchartsConfig } => ({
    layout: { ...layout, flipAxes },
    eChartsConfig: eChartsConfig && {
        ...eChartsConfig,
        series: eChartsConfig?.series?.map((series) => ({
            ...series,
            type,
            areaStyle: hasAreaStyle ? {} : undefined,
        })),
        xAxis: eChartsConfig?.xAxis?.map((axis) => ({
            ...axis,
            // If the chart is not a bar chart, and the xAxis is sorted by bar totals, set the sort type to default ( bar totals are not applied to non-bar charts )
            sortType:
                type !== CartesianSeriesType.BAR &&
                axis.sortType === XAxisSortType.BAR_TOTALS
                    ? XAxisSortType.DEFAULT
                    : axis.sortType,
        })),
    },
});

export const toStackType = (stack: boolean | StackType): StackType =>
    stack === true
        ? StackType.NORMAL
        : stack === false
          ? StackType.NONE
          : stack;

export const isStackTypeStacked = (stack: boolean | StackType): boolean =>
    stack === StackType.NORMAL || stack === StackType.PERCENT || stack === true;

/** Stacks or unstacks the y-field series: per pivot field when pivoted, in one stack otherwise. */
export const applyCartesianStacking = (
    layout: CartesianLayout,
    eChartsConfig: CartesianEchartsConfig,
    stack: boolean | StackType,
    pivotKeys: string[] | undefined,
): { layout: CartesianLayout; eChartsConfig: CartesianEchartsConfig } => {
    const yFields = layout?.yField || [];
    const isPivoted = pivotKeys && pivotKeys.length > 0;
    const stackBoolean = isStackTypeStacked(stack);

    return {
        layout: { ...layout, stack: toStackType(stack) },
        eChartsConfig: eChartsConfig && {
            ...eChartsConfig,
            series: eChartsConfig.series?.map((series) => {
                const { field } = series.encode.yRef;
                if (yFields.includes(field)) {
                    return {
                        ...series,
                        stack: stackBoolean
                            ? isPivoted
                                ? field
                                : 'stack-all-series'
                            : undefined,
                    };
                }
                return series;
            }),
        },
    };
};

export type AvailableCartesianFields = {
    sortedDimensions: string[];
    availableFields: string[];
    availableDimensions: string[];
    availableMetrics: string[];
};

/** The fields a cartesian layout may reference, from the metric query that produced the results. */
export const getAvailableCartesianFields = ({
    metricQuery,
    itemsMap,
    columnOrder,
}: {
    metricQuery: MetricQuery | undefined;
    itemsMap: ItemsMap | undefined;
    columnOrder: string[];
}): AvailableCartesianFields => {
    const sortedDimensions = sortDimensions(
        metricQuery?.dimensions || [],
        itemsMap,
        columnOrder,
    );
    const metrics = metricQuery?.metrics || [];
    const tableCalculations =
        metricQuery?.tableCalculations.map(({ name }) => name) || [];

    return {
        sortedDimensions,
        availableFields: [
            ...sortedDimensions,
            ...metrics,
            ...tableCalculations,
        ],
        availableDimensions: [...sortedDimensions],
        availableMetrics: metrics,
    };
};

/** Fields of a not-yet-run metric query; they count as valid until results land. */
export const getPendingFieldIds = (
    unsavedMetricQuery: MetricQuery | undefined,
): Set<string> | undefined =>
    unsavedMetricQuery
        ? new Set([
              ...unsavedMetricQuery.dimensions,
              ...unsavedMetricQuery.metrics,
              ...unsavedMetricQuery.tableCalculations.map(({ name }) => name),
          ])
        : undefined;

/**
 * When table calculations update, their name changes, so a field that is a
 * table calculation with the old name in the metadata becomes the new name.
 */
const renameTableCalculationField = (
    fieldId: string,
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined,
): string => {
    if (!tableCalculationsMetadata) return fieldId;
    const index = tableCalculationsMetadata.findIndex(
        (tc) => tc.oldName === fieldId,
    );
    return index !== -1 ? tableCalculationsMetadata[index].name : fieldId;
};

/**
 * Keeps a layout's fields valid for the results at hand: renames updated
 * table calculations, drops fields that no longer exist, and falls back to
 * the default chart configuration when nothing valid is left.
 * https://www.notion.so/lightdash/Default-chart-configurations-5d3001af990d4b6fa990dba4564540f6
 *
 * Returns the same object when nothing needs to change.
 */
export const repairCartesianLayout = ({
    layout: prev,
    availableFields,
    availableDimensions,
    availableMetrics,
    tableCalculationsMetadata,
    pendingFieldIds,
}: {
    layout: CartesianLayout;
    tableCalculationsMetadata?: TableCalculationMetadata[];
    pendingFieldIds?: Set<string>;
} & Omit<AvailableCartesianFields, 'sortedDimensions'>): CartesianLayout => {
    if (availableFields.length === 0) return prev;

    /**
     * Get the fields with the current table calculation names when they are a table calculation with the old name
     * otherwise keep the fields as they are
     */
    const xField = prev?.xField
        ? renameTableCalculationField(prev.xField, tableCalculationsMetadata)
        : prev?.xField;
    const yFields = prev?.yField?.map((yField) =>
        renameTableCalculationField(yField, tableCalculationsMetadata),
    );

    const isValidFieldReference = (fieldId: string) =>
        availableFields.includes(fieldId) ||
        Boolean(tableCalculationsMetadata?.some((tc) => tc.name === fieldId)) ||
        pendingFieldIds?.has(fieldId) === true;

    const isCurrentXFieldValid: boolean =
        xField === EMPTY_X_AXIS || (!!xField && isValidFieldReference(xField));

    const currentValidYFields = yFields
        ? yFields.filter(isValidFieldReference)
        : [];

    const isCurrentYFieldsValid: boolean = currentValidYFields.length > 0;

    // current configuration is still valid
    if (isCurrentXFieldValid && isCurrentYFieldsValid) {
        return {
            ...prev,
            xField,
            yField: currentValidYFields,
        };
    }

    // try to fix partially invalid configuration
    if (
        (isCurrentXFieldValid && !isCurrentYFieldsValid) ||
        (!isCurrentXFieldValid && isCurrentYFieldsValid)
    ) {
        const usedFields: string[] = [];

        if (isCurrentXFieldValid && xField) {
            usedFields.push(xField);
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
                xField,
                yField: [fallbackYFields],
            };
        }
    }

    let newXField: string | undefined = undefined;
    let newYFields: string[] = [];

    // one metric , one dimension
    if (availableMetrics.length === 1 && availableDimensions.length === 1) {
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
    }

    // 1+ metrics, one dimension
    else if (availableMetrics.length > 1 && availableDimensions.length === 1) {
        //Max 4 metrics in Y-axis
        newXField = availableDimensions[0];
        newYFields = availableMetrics.slice(0, 4);
    }

    // 2+ dimensions and 1+ metrics
    else if (availableMetrics.length >= 1 && availableDimensions.length >= 2) {
        //Max 4 metrics in Y-axis
        newXField = availableDimensions[0];
        newYFields = availableMetrics.slice(0, 4);
    }

    // 2+ metrics with no dimensions
    else if (availableMetrics.length >= 2 && availableDimensions.length === 0) {
        newXField = availableMetrics[0];
        newYFields = [availableMetrics[1]];
    }

    // 2+ dimensions with no metrics
    else if (availableMetrics.length === 0 && availableDimensions.length >= 2) {
        newXField = availableDimensions[0];
        newYFields = [availableDimensions[1]];
    }

    // Don't update if we don't have a valid configuration
    // This prevents infinite loops when insufficient fields are selected
    if (!newXField || newYFields.length === 0) {
        return prev;
    }

    return {
        ...prev,
        xField: newXField,
        yField: newYFields,
    };
};

/**
 * The series a complete layout needs for these results: one per y field
 * (per pivot value when pivoted), keeping what the existing series already
 * configured, with reference lines placed on the visible series.
 */
export const buildCartesianSeries = ({
    layout,
    existingSeries,
    isStacked,
    pivotKeys,
    resultsData,
    itemsMap,
    columnLimit,
    referenceLines,
}: {
    layout: CompleteCartesianChartLayout;
    existingSeries: Series[] | undefined;
    isStacked: boolean;
    pivotKeys: string[] | undefined;
    resultsData: VisualizationResults;
    itemsMap: ItemsMap | undefined;
    columnLimit: number | undefined;
    referenceLines: ReferenceLineField[];
}): Series[] => {
    const defaultCartesianType =
        existingSeries?.[0]?.type || CartesianSeriesType.BAR;
    const defaultAreaStyle =
        defaultCartesianType === CartesianSeriesType.LINE
            ? existingSeries?.[0]?.areaStyle
            : undefined;
    const defaultSmooth = existingSeries?.[0]?.smooth;
    const defaultLabel = existingSeries?.[0]?.label;
    const defaultStackLabel = existingSeries?.[0]?.stackLabel;

    const defaultShowSymbol = existingSeries?.[0]?.showSymbol;
    const expectedSeriesMap = getExpectedSeriesMap({
        defaultSmooth,
        defaultShowSymbol,
        defaultAreaStyle,
        defaultCartesianType,
        isStacked,
        pivotKeys,
        resultsData,
        xField: layout.xField,
        yFields: layout.yField,
        defaultLabel,
        defaultStackLabel,
        itemsMap,
        columnLimit,
        existingSeries,
        defaultYAxisIndexByField: getMergeDefaultYAxisIndexByField({
            yFields: layout.yField,
            itemsMap,
            fieldOrigins: resultsData.fieldOrigins,
        }),
    });
    const sortedByPivot = isPivotSeriesOrderDeterminedByQuery(
        pivotKeys,
        layout.yField,
        resultsData?.metricQuery?.sorts,
    );

    const newSeries = mergeExistingAndExpectedSeries({
        expectedSeriesMap,
        existingSeries: existingSeries || [],
        sortedByPivot,
    });

    const seriesWithReferenceLines = applyReferenceLines(
        newSeries,
        layout,
        referenceLines,
        {
            itemsMap,
            resolvedTimezone: resultsData.resolvedTimezone,
        },
    );

    return seriesWithReferenceLines.map((serie) => ({
        ...serie,
        // NOTE: Addresses old chart configs where yAxisIndex was not set
        ...(!serie.yAxisIndex && {
            yAxisIndex: 0,
        }),
    }));
};

/** The chart type the first series implies; a line with an area style is an area chart. */
export const getCartesianChartType = (
    series: Series[] | undefined,
): CartesianSeriesType => {
    const firstSeriesType = series?.[0]?.type || CartesianSeriesType.BAR;
    const firstSeriesAreaStyle = series?.[0]?.areaStyle;
    return firstSeriesType === CartesianSeriesType.LINE && firstSeriesAreaStyle
        ? CartesianSeriesType.AREA
        : firstSeriesType;
};

export const hasCartesianCustomColorsStacking = (
    series: Series[] | undefined,
    layoutStack: CartesianChart['layout']['stack'] | undefined,
): boolean =>
    Boolean(series?.some((serie) => Boolean(serie.stack))) ||
    (layoutStack !== undefined && layoutStack !== StackType.NONE);

/**
 * Conditional formatting: all-bar charts without pivots, regardless of
 * metric count or stacking. Mixed bar/line charts are excluded since
 * formatting only renders on bars.
 */
export const isConditionalFormattingEligible = (
    series: Series[] | undefined,
    pivotKeys: string[] | undefined,
): boolean =>
    getCartesianChartType(series) === CartesianSeriesType.BAR &&
    (series ?? []).every((serie) => serie.type === CartesianSeriesType.BAR) &&
    !pivotKeys?.length;

/** Color by category: only single-metric non-stacked bar charts. */
export const isColorByCategoryEligible = ({
    series,
    pivotKeys,
    layout,
}: {
    series: Series[] | undefined;
    pivotKeys: string[] | undefined;
    layout: CartesianLayout;
}): boolean =>
    isConditionalFormattingEligible(series, pivotKeys) &&
    !hasCartesianCustomColorsStacking(series, layout?.stack) &&
    (layout?.yField?.length ?? 0) <= 1;

/**
 * Repairs configs whose target no longer exists on the chart (e.g. the
 * metric was swapped or removed) by pointing them at the first metric; a
 * stacked chart keeps every config on one target. Returns the same array
 * when nothing changes.
 */
export const repairConditionalFormattings = ({
    conditionalFormattings: prev,
    yFields,
    hasCustomColorsStacking,
}: {
    conditionalFormattings: ConditionalFormattingConfig[];
    yFields: string[];
    hasCustomColorsStacking: boolean;
}): ConditionalFormattingConfig[] => {
    const firstYField = yFields[0];
    if (!firstYField) return prev;

    const repairedConfigs = prev.map((config) =>
        config.target?.fieldId && yFields.includes(config.target.fieldId)
            ? config
            : {
                  ...config,
                  target: { fieldId: firstYField },
              },
    );

    const withSingleTarget = hasCustomColorsStacking
        ? repairedConfigs.map((config, index) =>
              index === 0 ||
              config.target?.fieldId === repairedConfigs[0].target?.fieldId
                  ? config
                  : {
                        ...config,
                        target: repairedConfigs[0].target,
                    },
          )
        : repairedConfigs;

    const hasChanges = withSingleTarget.some(
        (config, index) =>
            config.target?.fieldId !== prev[index].target?.fieldId,
    );

    return hasChanges ? withSingleTarget : prev;
};

/**
 * The config a cartesian chart renders from: the layout and ECharts config
 * when complete, the empty config otherwise.
 */
export const buildValidCartesianConfig = ({
    layout,
    eChartsConfig,
    conditionalFormattings,
    metadata,
    tooltip,
    tooltipSort,
    rowLimit,
    columnLimit,
}: {
    layout: CartesianLayout;
    eChartsConfig: CartesianEchartsConfig;
    conditionalFormattings: ConditionalFormattingConfig[];
    metadata: CartesianChart['metadata'];
    tooltip: string | undefined;
    tooltipSort: TooltipSortBy | undefined;
    rowLimit: CartesianChart['rowLimit'];
    columnLimit: number | undefined;
}): CartesianChart => ({
    layout: isCompleteLayout(layout)
        ? layout
        : EMPTY_CARTESIAN_CHART_CONFIG.layout,
    eChartsConfig: isCompleteEchartsConfig(eChartsConfig)
        ? {
              ...eChartsConfig,
              series: eChartsConfig.series.filter(
                  (serie) => !serie.isFilteredOut,
              ),
              tooltip,
              tooltipSort,
          }
        : EMPTY_CARTESIAN_CHART_CONFIG.eChartsConfig,
    conditionalFormattings,
    metadata,
    rowLimit,
    columnLimit,
});

export type ResolveCartesianChartConfigArgs = {
    chartConfig: CartesianChart | undefined;
    resultsData: VisualizationResults | undefined;
    itemsMap: ItemsMap | undefined;
    /** The pivot dimensions the results were pivoted by. */
    pivotKeys: string[] | undefined;
    columnOrder: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    /** The not-yet-run metric query; its fields count as valid layout references. */
    unsavedMetricQuery?: MetricQuery;
    /** A stacking override, as the explorer's toolbar applies one. */
    stacking?: boolean | StackType;
    /** A series type override, as the explorer's toolbar applies one. */
    cartesianType?: CartesianTypeOptions;
};

/**
 * Resolves a saved cartesian chart config against query results, the way
 * the explorer does when it first mounts a chart: fills in missing layout
 * fields, expands series for every y field and pivot value, places
 * reference lines, and clears settings the chart is no longer eligible for.
 *
 * The frontend's `useCartesianChartConfig` runs the same steps inside its
 * effects; this is the one-shot equivalent for headless rendering.
 */
export const resolveCartesianChartConfig = ({
    chartConfig: initialChartConfig,
    resultsData,
    itemsMap,
    pivotKeys,
    columnOrder,
    tableCalculationsMetadata,
    unsavedMetricQuery,
    stacking,
    cartesianType,
}: ResolveCartesianChartConfigArgs): CartesianChart => {
    let layout: CartesianLayout = initialChartConfig?.layout;
    let eChartsConfig: CartesianEchartsConfig =
        initialChartConfig?.eChartsConfig
            ? {
                  ...EMPTY_CARTESIAN_CHART_CONFIG.eChartsConfig,
                  ...initialChartConfig.eChartsConfig,
              }
            : initialChartConfig?.eChartsConfig;
    let conditionalFormattings =
        initialChartConfig?.conditionalFormattings ?? [];
    let isStacked = isCartesianStacked(
        initialChartConfig?.layout?.stack,
        eChartsConfig?.series,
    );
    const columnLimit = initialChartConfig?.columnLimit;

    if (cartesianType !== undefined) {
        ({ layout, eChartsConfig } = applyCartesianType(
            layout,
            eChartsConfig,
            cartesianType,
        ));
    }

    // If the xField is a table calculation and its type is a number, do not stack
    const xTableCalculation = resultsData?.metricQuery?.tableCalculations?.find(
        (tc) => tc.name === layout?.xField,
    );
    const stackOverride =
        stacking !== undefined
            ? stacking
            : xTableCalculation && isNumericItem(xTableCalculation)
              ? false
              : undefined;
    if (stackOverride !== undefined) {
        isStacked = isStackTypeStacked(stackOverride);
        ({ layout, eChartsConfig } = applyCartesianStacking(
            layout,
            eChartsConfig,
            stackOverride,
            pivotKeys,
        ));
    }

    const { availableFields, availableDimensions, availableMetrics } =
        getAvailableCartesianFields({
            metricQuery: resultsData?.metricQuery,
            itemsMap,
            columnOrder,
        });
    layout = repairCartesianLayout({
        layout,
        availableFields,
        availableDimensions,
        availableMetrics,
        tableCalculationsMetadata,
        pendingFieldIds: getPendingFieldIds(unsavedMetricQuery),
    });

    const referenceLines = getReferenceLinesFromSeries(
        eChartsConfig?.series,
        layout?.flipAxes,
    );

    if (
        isCompleteLayout(layout) &&
        resultsData &&
        resultsData.hasFetchedAllRows !== false
    ) {
        eChartsConfig = {
            ...eChartsConfig,
            series: buildCartesianSeries({
                layout,
                existingSeries: eChartsConfig?.series,
                isStacked,
                pivotKeys,
                resultsData,
                itemsMap,
                columnLimit,
                referenceLines,
            }),
        };
    }

    if (
        !isColorByCategoryEligible({
            series: eChartsConfig?.series,
            pivotKeys,
            layout,
        }) &&
        (layout?.colorByCategory || layout?.categoryColorOverrides)
    ) {
        layout = {
            ...layout,
            colorByCategory: undefined,
            categoryColorOverrides: undefined,
        };
    }

    if (!isConditionalFormattingEligible(eChartsConfig?.series, pivotKeys)) {
        conditionalFormattings = [];
    } else {
        conditionalFormattings = repairConditionalFormattings({
            conditionalFormattings,
            yFields: layout?.yField ?? [],
            hasCustomColorsStacking: hasCartesianCustomColorsStacking(
                eChartsConfig?.series,
                layout?.stack,
            ),
        });
    }

    return buildValidCartesianConfig({
        layout,
        eChartsConfig,
        conditionalFormattings,
        metadata: initialChartConfig?.metadata,
        tooltip: eChartsConfig?.tooltip,
        tooltipSort: eChartsConfig?.tooltipSort,
        rowLimit: initialChartConfig?.rowLimit,
        columnLimit,
    });
};
