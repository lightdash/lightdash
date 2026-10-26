import {
    getSeriesId,
    type CartesianChart,
    type ConditionalFormattingConfig,
    type MarkLineData,
    type RowLimit,
    type Series,
    type SeriesMetadata,
    type StackType,
    type TableCalculationMetadata,
    type TooltipSortBy,
    type XAxis,
} from '@lightdash/common';
import {
    applyCartesianStacking,
    applyCartesianType,
    EMPTY_CARTESIAN_CHART_CONFIG,
    getReferenceLinesFromSeries,
    isCartesianStacked,
    isColorByCategoryEligible,
    isConditionalFormattingEligible,
    isStackTypeStacked,
    repairCartesianLayout,
    toStackType,
    type CartesianTypeOptions,
    type getAvailableCartesianFields,
    type ReferenceLineField,
} from '@lightdash/visualization/editor';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { editorCaseReducers } from './editorSlice';

type Layout = Partial<CartesianChart['layout']>;
type EchartsConfig = Partial<CartesianChart['eChartsConfig']>;
type YAxis = NonNullable<EchartsConfig['yAxis']>[number];

export type CartesianEditorState = {
    columnLimit: number | undefined;
    dirtyLayout: Layout | undefined;
    dirtyMetadata: CartesianChart['metadata'] | undefined;
    conditionalFormattings: ConditionalFormattingConfig[];
    dirtyEchartsConfig: EchartsConfig | undefined;
    isStacked: boolean;
    rowLimit: RowLimit | undefined;
    referenceLines: ReferenceLineField[];
    tooltip: string | undefined;
    tooltipSort: TooltipSortBy | undefined;
};

export const buildCartesianEditorState = (
    initialChartConfig: CartesianChart | undefined,
): CartesianEditorState => {
    const dirtyEchartsConfig = initialChartConfig?.eChartsConfig
        ? {
              ...EMPTY_CARTESIAN_CHART_CONFIG.eChartsConfig,
              ...initialChartConfig.eChartsConfig,
          }
        : initialChartConfig?.eChartsConfig;
    return {
        columnLimit: initialChartConfig?.columnLimit,
        dirtyLayout: initialChartConfig?.layout,
        dirtyMetadata: initialChartConfig?.metadata,
        conditionalFormattings:
            initialChartConfig?.conditionalFormattings ?? [],
        dirtyEchartsConfig,
        isStacked: isCartesianStacked(
            initialChartConfig?.layout?.stack,
            dirtyEchartsConfig?.series,
        ),
        rowLimit: initialChartConfig?.rowLimit,
        referenceLines: getReferenceLinesFromSeries(
            dirtyEchartsConfig?.series,
            initialChartConfig?.layout?.flipAxes,
        ),
        tooltip: dirtyEchartsConfig?.tooltip,
        tooltipSort: dirtyEchartsConfig?.tooltipSort,
    };
};

type AxisPatch =
    | { axis: 'xAxis'; index: number; patch: Partial<XAxis> }
    | { axis: 'yAxis'; index: number; patch: Partial<YAxis> };

/** What the layout fallbacks read: the fields of the query behind the results */
export type CartesianRepairInputs = Omit<
    ReturnType<typeof getAvailableCartesianFields>,
    'sortedDimensions'
> & {
    pendingFieldIds: string[] | undefined;
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined;
};

const matchesReferenceLine = (data: MarkLineData, lineId: string) =>
    data.uuid === lineId || data.value === lineId || data.name === lineId;

export type ReferenceLineUpdate = {
    lineId: string;
    fieldId: string;
    isNumericField: boolean;
    value: string | undefined;
    label: string | undefined;
    lineColor: string;
    dynamicValue: 'average' | undefined;
    labelPosition: 'start' | 'middle' | 'end' | undefined;
};

const cartesianEditorSlice = createSlice({
    name: 'cartesianEditor',
    initialState: null as CartesianEditorState | null,
    reducers: {
        ...editorCaseReducers<CartesianEditorState>(),
        layoutMerge: (state, action: PayloadAction<Layout>) => {
            if (!state) return;
            state.dirtyLayout = { ...state.dirtyLayout, ...action.payload };
        },
        echartsMerge: (state, action: PayloadAction<EchartsConfig>) => {
            if (!state) return;
            state.dirtyEchartsConfig = {
                ...state.dirtyEchartsConfig,
                ...action.payload,
            };
        },
        // Patches the first x axis, keeping any others as they are
        firstXAxisMerge: (state, action: PayloadAction<Partial<XAxis>>) => {
            if (!state) return;
            const [firstAxis, ...axes] = state.dirtyEchartsConfig?.xAxis || [];
            state.dirtyEchartsConfig = {
                ...state.dirtyEchartsConfig,
                xAxis: [{ ...firstAxis, ...action.payload }, ...axes],
            };
        },
        // Patches one of the two axes, materialising both
        axisMerge: (state, action: PayloadAction<AxisPatch>) => {
            if (!state) return;
            const { axis, index, patch } = action.payload;
            const prev = state.dirtyEchartsConfig?.[axis];
            state.dirtyEchartsConfig = {
                ...state.dirtyEchartsConfig,
                [axis]: [prev?.[0] || {}, prev?.[1] || {}].map(
                    (current, axisIndex) =>
                        axisIndex === index
                            ? { ...current, ...patch }
                            : current,
                ),
            };
        },
        categoryColorOverrideSet: (
            state,
            action: PayloadAction<{ categoryValue: string; color: string }>,
        ) => {
            if (!state) return;
            state.dirtyLayout = {
                ...state.dirtyLayout,
                categoryColorOverrides: {
                    ...state.dirtyLayout?.categoryColorOverrides,
                    [action.payload.categoryValue]: action.payload.color,
                },
            };
        },
        conditionalFormattingsSet: (
            state,
            action: PayloadAction<ConditionalFormattingConfig[]>,
        ) => {
            if (!state) return;
            state.conditionalFormattings = action.payload;
            if (action.payload.length > 0) {
                state.dirtyLayout = {
                    ...state.dirtyLayout,
                    colorByCategory: undefined,
                };
            }
        },
        singleSeriesAdd: (state, action: PayloadAction<string>) => {
            if (!state) return;
            const prev = state.dirtyLayout;
            state.dirtyLayout = {
                ...prev,
                yField: [...(prev?.yField || []), action.payload],
                // Color by category only works for single-series; clear when adding another
                ...((prev?.yField?.length ?? 0) >= 1 && {
                    colorByCategory: undefined,
                    categoryColorOverrides: undefined,
                }),
            };
            if (state.conditionalFormattings.length > 0) {
                state.conditionalFormattings = [];
            }
        },
        singleSeriesRemove: (state, action: PayloadAction<number>) => {
            if (!state) return;
            const index = action.payload;
            // Drop the colour of the removed series so a re-added one starts clean
            const series = state.dirtyEchartsConfig?.series;
            if (series && series[index]) {
                series[index] = { ...series[index], color: undefined };
            }
            const prev = state.dirtyLayout;
            state.dirtyLayout = {
                ...prev,
                yField: prev?.yField
                    ? [
                          ...prev.yField.slice(0, index),
                          ...prev.yField.slice(index + 1),
                      ]
                    : [],
            };
        },
        yFieldUpdate: (
            state,
            action: PayloadAction<{ index: number; fieldId: string }>,
        ) => {
            if (!state) return;
            const { index, fieldId } = action.payload;
            state.dirtyLayout = {
                ...state.dirtyLayout,
                yField: state.dirtyLayout?.yField?.map((field, i) =>
                    i === index ? fieldId : field,
                ),
            };
        },
        typeApply: (state, action: PayloadAction<CartesianTypeOptions>) => {
            if (!state) return;
            state.dirtyLayout = applyCartesianType(
                state.dirtyLayout,
                undefined,
                action.payload,
            ).layout;
            state.dirtyEchartsConfig = applyCartesianType(
                undefined,
                state.dirtyEchartsConfig,
                action.payload,
            ).eChartsConfig;
        },
        groupedSeriesUpdateAll: (
            state,
            action: PayloadAction<{
                fieldKey: string;
                updateSeries: Partial<Series>;
            }>,
        ) => {
            if (!state?.dirtyEchartsConfig) return;
            const { fieldKey, updateSeries } = action.payload;
            state.dirtyEchartsConfig.series =
                state.dirtyEchartsConfig.series?.map((series) =>
                    series.encode.yRef.field === fieldKey
                        ? { ...series, ...updateSeries }
                        : series,
                );
        },
        singleSeriesUpdate: (state, action: PayloadAction<Series>) => {
            if (!state) return;
            const updated = action.payload;
            state.dirtyEchartsConfig = {
                ...state.dirtyEchartsConfig,
                series: (state.dirtyEchartsConfig?.series || []).map(
                    (current) =>
                        getSeriesId(current) === getSeriesId(updated)
                            ? { ...current, ...updated }
                            : current,
                ),
            };
        },
        seriesSet: (state, action: PayloadAction<Series[]>) => {
            if (!state?.dirtyEchartsConfig) return;
            state.dirtyEchartsConfig.series = action.payload;
        },
        // The query's fields changed: rename, drop or fall back to valid fields
        inputsChanged: (
            state,
            action: PayloadAction<CartesianRepairInputs>,
        ) => {
            if (!state || action.payload.availableFields.length === 0) return;
            const { pendingFieldIds, ...fields } = action.payload;
            const repaired = repairCartesianLayout({
                ...fields,
                layout: state.dirtyLayout,
                pendingFieldIds: pendingFieldIds && new Set(pendingFieldIds),
            });
            if (!isEqual(repaired, state.dirtyLayout)) {
                state.dirtyLayout = repaired;
            }
        },
        // The series the results imply, and the resets they make necessary
        seriesReconciled: (
            state,
            action: PayloadAction<{
                expectedSeries: Series[] | undefined;
                pivotKeys: string[] | undefined;
            }>,
        ) => {
            if (!state) return;
            const { expectedSeries, pivotKeys } = action.payload;
            if (
                expectedSeries &&
                (!state.dirtyEchartsConfig ||
                    !isEqual(expectedSeries, state.dirtyEchartsConfig.series))
            ) {
                state.dirtyEchartsConfig = {
                    ...state.dirtyEchartsConfig,
                    series: expectedSeries,
                };
            }
            const series = state.dirtyEchartsConfig?.series;
            const layout = state.dirtyLayout;
            if (
                (layout?.colorByCategory || layout?.categoryColorOverrides) &&
                !isColorByCategoryEligible({ series, pivotKeys, layout })
            ) {
                state.dirtyLayout = {
                    ...layout,
                    colorByCategory: undefined,
                    categoryColorOverrides: undefined,
                };
            }
            if (
                state.conditionalFormattings.length > 0 &&
                !isConditionalFormattingEligible(series, pivotKeys)
            ) {
                state.conditionalFormattings = [];
            }
        },
        gridMerge: (
            state,
            action: PayloadAction<NonNullable<EchartsConfig['grid']>>,
        ) => {
            if (!state) return;
            state.dirtyEchartsConfig = {
                ...state.dirtyEchartsConfig,
                grid: { ...state.dirtyEchartsConfig?.grid, ...action.payload },
            };
        },
        metadataMerge: (
            state,
            action: PayloadAction<Record<string, SeriesMetadata>>,
        ) => {
            if (!state) return;
            state.dirtyMetadata = { ...state.dirtyMetadata, ...action.payload };
        },
        referenceLineAdd: (state, action: PayloadAction<string>) => {
            if (!state) return;
            state.referenceLines.push({ data: { uuid: action.payload } });
        },
        referenceLineRemove: (state, action: PayloadAction<string>) => {
            if (!state) return;
            const lineId = action.payload;
            const series = state.dirtyEchartsConfig?.series;
            if (!state.dirtyEchartsConfig || !series) return;
            state.dirtyEchartsConfig.series = series.map((serie) => ({
                ...serie,
                markLine: {
                    ...serie.markLine,
                    data:
                        serie.markLine?.data.filter(
                            (data) => !matchesReferenceLine(data, lineId),
                        ) || [],
                },
            }));
            state.referenceLines = state.referenceLines.filter(
                (line) => !matchesReferenceLine(line.data, lineId),
            );
        },
        referenceLineUpdate: (
            state,
            action: PayloadAction<ReferenceLineUpdate>,
        ) => {
            if (!state) return;
            const {
                lineId,
                fieldId,
                isNumericField,
                value,
                label,
                lineColor,
                dynamicValue,
                labelPosition,
            } = action.payload;
            const isXField = state.dirtyLayout?.xField === fieldId;
            const hasSeries = state.dirtyEchartsConfig?.series?.some(
                (serie) =>
                    (isXField ? serie.encode.xRef : serie.encode.yRef).field ===
                    fieldId,
            );
            if (!hasSeries) return;
            const useAverage = dynamicValue === 'average' && isNumericField;
            const data: MarkLineData = {
                name: label,
                type: useAverage ? 'average' : undefined,
                uuid: lineId,
                lineStyle: { color: lineColor },
                label: {
                    position: labelPosition || 'end',
                    formatter: label
                        ? `${label}${useAverage ? ': {c}' : ''}`
                        : undefined,
                },
                xAxis: isXField ? value || '' : undefined,
                yAxis: isXField || useAverage ? undefined : value || '',
            };
            state.referenceLines = state.referenceLines.map((line) =>
                matchesReferenceLine(line.data, lineId)
                    ? {
                          fieldId,
                          fieldRef:
                              useAverage && line.fieldRef?.field === fieldId
                                  ? line.fieldRef
                                  : undefined,
                          data,
                      }
                    : line,
            );
        },
        stackingApply: (
            state,
            action: PayloadAction<{
                stack: boolean | StackType;
                yFields: string[] | undefined;
                pivotKeys: string[] | undefined;
            }>,
        ) => {
            if (!state) return;
            const { stack, yFields, pivotKeys } = action.payload;
            state.isStacked = isStackTypeStacked(stack);
            state.dirtyLayout = {
                ...state.dirtyLayout,
                stack: toStackType(stack),
            };
            state.dirtyEchartsConfig = applyCartesianStacking(
                { yField: yFields },
                state.dirtyEchartsConfig,
                stack,
                pivotKeys,
            ).eChartsConfig;
        },
    },
});

export const cartesianEditorActions = cartesianEditorSlice.actions;
export const cartesianEditorReducer = cartesianEditorSlice.reducer;
