import { getSeriesId } from '@lightdash/common';
import {
    buildValidCartesianConfig,
    getAvailableCartesianFields,
    getCartesianChartType,
    getPendingFieldIds,
    hasCartesianCustomColorsStacking,
    isColorByCategoryEligible,
    isConditionalFormattingEligible,
    repairConditionalFormattings,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { type CartesianReconcileInputs } from './cartesianEditorSlice';
import { type VisualizationInputs } from './inputs';
import { selectCartesianEditor } from './selectors';

type State = VisualizationStoreState;
const inputsMetricQuery = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData?.metricQuery;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsColumnOrder = (_: State, inputs: VisualizationInputs) =>
    inputs.columnOrder;
const inputsPivotKeys = (_: State, inputs: VisualizationInputs) =>
    inputs.pivotDimensions;

export const selectCartesianLayout = (state: State) =>
    selectCartesianEditor(state).dirtyLayout;
export const selectCartesianEchartsConfig = (state: State) =>
    selectCartesianEditor(state).dirtyEchartsConfig;
export const selectCartesianSeries = (state: State) =>
    selectCartesianEditor(state).dirtyEchartsConfig?.series;
const selectYFields = (state: State) =>
    selectCartesianEditor(state).dirtyLayout?.yField;
const selectLayoutStack = (state: State) =>
    selectCartesianEditor(state).dirtyLayout?.stack;

export const selectCartesianAvailableFields = createSelector(
    [inputsMetricQuery, inputsItemsMap, inputsColumnOrder],
    (metricQuery, itemsMap, columnOrder) =>
        getAvailableCartesianFields({ metricQuery, itemsMap, columnOrder }),
);

// The available fields only know the last run; a field just added from a
// config picker must not be stripped before its results land.
export const selectCartesianPendingFieldIds = createSelector(
    [(_: State, inputs: VisualizationInputs) => inputs.unsavedMetricQuery],
    getPendingFieldIds,
);

/** The inputs the results-driven repairs depend on; stable while the chart is edited */
export const selectCartesianReconcileInputs = createSelector(
    [
        selectCartesianAvailableFields,
        selectCartesianPendingFieldIds,
        (_: State, inputs: VisualizationInputs) =>
            inputs.tableCalculationsMetadata,
        inputsPivotKeys,
        (_: State, inputs: VisualizationInputs) => inputs.resultsData,
        inputsItemsMap,
    ],
    (
        { availableFields, availableDimensions, availableMetrics },
        pendingFieldIds,
        tableCalculationsMetadata,
        pivotKeys,
        resultsData,
        itemsMap,
    ): CartesianReconcileInputs => ({
        availableFields,
        availableDimensions,
        availableMetrics,
        pendingFieldIds,
        tableCalculationsMetadata,
        pivotKeys,
        resultsData,
        itemsMap,
    }),
);

export const selectCartesianDirtyChartType = createSelector(
    [selectCartesianSeries],
    getCartesianChartType,
);

/** Series visibility as a string, so it compares by value */
export const selectCartesianSeriesHiddenKey = createSelector(
    [selectCartesianSeries],
    (series) =>
        JSON.stringify(
            series?.map((s) => ({ id: getSeriesId(s), hidden: !!s.hidden })) ??
                [],
        ),
);

export const selectCartesianHasCustomColorsStacking = createSelector(
    [selectCartesianSeries, selectLayoutStack],
    hasCartesianCustomColorsStacking,
);

export const selectIsCartesianConditionalFormattingAllowed = createSelector(
    [selectCartesianSeries, inputsPivotKeys],
    isConditionalFormattingEligible,
);

export const selectIsCartesianColorByCategoryAllowed = createSelector(
    [selectCartesianSeries, inputsPivotKeys, selectCartesianLayout],
    (series, pivotKeys, layout) =>
        isColorByCategoryEligible({ series, pivotKeys, layout }),
);

/** Stored configs, retargeted at the first y field when theirs is gone */
export const selectCartesianConditionalFormattings = createSelector(
    [
        (state: State) => selectCartesianEditor(state).conditionalFormattings,
        selectIsCartesianConditionalFormattingAllowed,
        selectYFields,
        selectCartesianHasCustomColorsStacking,
    ],
    (conditionalFormattings, isAllowed, yFields, hasCustomColorsStacking) =>
        isAllowed && yFields?.[0]
            ? repairConditionalFormattings({
                  conditionalFormattings,
                  yFields,
                  hasCustomColorsStacking,
              })
            : conditionalFormattings,
);

export const selectCartesianValidConfig = createSelector(
    [selectCartesianEditor, selectCartesianConditionalFormattings],
    (editor, conditionalFormattings) =>
        buildValidCartesianConfig({
            layout: editor.dirtyLayout,
            eChartsConfig: editor.dirtyEchartsConfig,
            conditionalFormattings,
            metadata: editor.dirtyMetadata,
            tooltip: editor.tooltip,
            tooltipSort: editor.tooltipSort,
            rowLimit: editor.rowLimit,
            columnLimit: editor.columnLimit,
        }),
);
