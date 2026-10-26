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
import { type CartesianRepairInputs } from './cartesianEditorSlice';
import {
    inputsColumnOrder,
    inputsItemsMap,
    inputsMetricQuery,
    inputsPivotDimensions,
    inputsTableCalculationsMetadata,
    inputsUnsavedMetricQuery,
} from './inputSelectors';
import { selectCartesianEditor } from './selectors';

type State = VisualizationStoreState;

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

const selectCartesianAvailableFields = createSelector(
    [inputsMetricQuery, inputsItemsMap, inputsColumnOrder],
    (metricQuery, itemsMap, columnOrder) =>
        getAvailableCartesianFields({ metricQuery, itemsMap, columnOrder }),
);

// A field just added from a picker must not be stripped before its results land
const selectCartesianPendingFieldIds = createSelector(
    [inputsUnsavedMetricQuery],
    (unsavedMetricQuery) => {
        const ids = getPendingFieldIds(unsavedMetricQuery);
        return ids && [...ids];
    },
);

/** What the layout fallbacks follow; a new results object for the same query keeps this reference */
export const selectCartesianRepairInputs = createSelector(
    [
        selectCartesianAvailableFields,
        selectCartesianPendingFieldIds,
        inputsTableCalculationsMetadata,
        // Unread, but a pivot change re-runs the fallbacks, as it did before the store
        inputsPivotDimensions,
    ],
    (
        { availableFields, availableDimensions, availableMetrics },
        pendingFieldIds,
        tableCalculationsMetadata,
    ): CartesianRepairInputs => ({
        availableFields,
        availableDimensions,
        availableMetrics,
        pendingFieldIds,
        tableCalculationsMetadata,
    }),
);

export const selectCartesianDirtyChartType = createSelector(
    [selectCartesianSeries],
    getCartesianChartType,
);

/** Series visibility as a string, so it compares by value */
const selectCartesianSeriesHiddenKey = createSelector(
    [selectCartesianSeries],
    (series) =>
        JSON.stringify(
            series?.map((s) => ({ id: getSeriesId(s), hidden: !!s.hidden })) ??
                [],
        ),
);

const selectCartesianHasCustomColorsStacking = createSelector(
    [selectCartesianSeries, selectLayoutStack],
    hasCartesianCustomColorsStacking,
);

const selectIsCartesianConditionalFormattingAllowed = createSelector(
    [selectCartesianSeries, inputsPivotDimensions],
    isConditionalFormattingEligible,
);

const selectIsCartesianColorByCategoryAllowed = createSelector(
    [selectCartesianSeries, inputsPivotDimensions, selectCartesianLayout],
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

/** Changes whenever an edit can change the series the results imply */
export const selectCartesianReconcileTrigger = createSelector(
    [
        selectCartesianLayout,
        (state: State) => selectCartesianEditor(state).isStacked,
        (state: State) => selectCartesianEditor(state).referenceLines,
        (state: State) => selectCartesianEditor(state).columnLimit,
        selectCartesianSeriesHiddenKey,
        selectIsCartesianConditionalFormattingAllowed,
        selectIsCartesianColorByCategoryAllowed,
    ],
    (...trigger) => trigger,
);
