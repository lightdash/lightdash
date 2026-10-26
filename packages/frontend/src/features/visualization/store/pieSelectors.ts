import {
    buildValidPieConfig,
    getPieChartData,
    getPieGroupColorDefaults,
    getPieSelectedMetric,
    getSortedPieGroupLabels,
    isPieValueOptionOverridden,
    repairPieGroupFieldIds,
    repairPieMetricId,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { type VisualizationStoreState } from '.';
import {
    inputsColorPalette,
    inputsHasNoResults,
    inputsItemsMap,
    inputsParameters,
    inputsResults,
    inputsUnsavedMetricQuery,
    keepIfEqual,
    selectDimensionsAndNumericMetrics,
} from './inputSelectors';
import { selectPendingFieldIds } from './pendingFields';
import { selectPieEditor } from './selectors';

type State = VisualizationStoreState;

export const selectPieFieldPools = selectDimensionsAndNumericMetrics;
const selectDimensionIds = createSelector([selectPieFieldPools], (pools) =>
    Object.keys(pools.dimensions),
);
const selectNumericMetricIds = createSelector([selectPieFieldPools], (pools) =>
    Object.keys(pools.numericMetrics),
);
// The pools only know the last run; a field just added from the config
// picker must not be dropped before its results land.
const selectPendingDimensionIds = createSelector(
    [inputsUnsavedMetricQuery],
    (unsavedMetricQuery) => new Set(unsavedMetricQuery?.dimensions),
);

/** Stored group fields minus the ones the results no longer have */
export const selectPieGroupFieldIds = createSelector(
    [
        (state: State) => selectPieEditor(state).groupFieldIds,
        selectDimensionIds,
        selectPendingDimensionIds,
        inputsHasNoResults,
    ],
    (groupFieldIds, dimensionIds, pendingDimensionIds, isLoading) =>
        isLoading || dimensionIds.length === 0
            ? groupFieldIds
            : keepIfEqual(
                  groupFieldIds,
                  repairPieGroupFieldIds({
                      groupFieldIds,
                      dimensionIds,
                      pendingDimensionIds,
                  }),
              ),
);

/** Stored metric, or the first available one when it is gone */
export const selectPieMetricId = createSelector(
    [
        (state: State) => selectPieEditor(state).metricId,
        selectNumericMetricIds,
        selectPendingFieldIds,
        inputsHasNoResults,
    ],
    (metricId, allNumericMetricIds, pendingMetricIds, isLoading) =>
        isLoading || allNumericMetricIds.length === 0
            ? metricId
            : repairPieMetricId({
                  metricId,
                  allNumericMetricIds,
                  pendingMetricIds,
              }),
);

export const selectPieSelectedMetric = createSelector(
    [inputsItemsMap, selectPieMetricId],
    getPieSelectedMetric,
);

export const selectPieData = createSelector(
    [
        inputsResults,
        selectPieGroupFieldIds,
        selectPieMetricId,
        selectPieSelectedMetric,
        inputsParameters,
    ],
    (resultsData, groupFieldIds, metricId, selectedMetric, parameters) =>
        getPieChartData({
            resultsData,
            groupFieldIds,
            metricId,
            selectedMetric,
            parameters,
        }),
);

// Equal labels keep their identity, so a replaced but equal results object keeps the config
export const selectPieGroupLabels = createSelector(
    [selectPieData],
    (data) => data.map(({ name }) => name),
    { memoizeOptions: { resultEqualityCheck: isEqual } },
);

export const selectPieSortedGroupLabels = createSelector(
    [
        (state: State) => selectPieEditor(state).groupSortOverrides,
        selectPieGroupLabels,
    ],
    getSortedPieGroupLabels,
);

export const selectPieGroupColorDefaults = createSelector(
    [selectPieGroupLabels, inputsColorPalette],
    getPieGroupColorDefaults,
);

export const selectPieValueOptionOverrideFlags = createSelector(
    [(state: State) => selectPieEditor(state).groupValueOptionOverrides],
    (overrides) => ({
        isValueLabelOverriden: isPieValueOptionOverridden(
            overrides,
            'valueLabel',
        ),
        isShowValueOverriden: isPieValueOptionOverridden(
            overrides,
            'showValue',
        ),
        isShowPercentageOverriden: isPieValueOptionOverridden(
            overrides,
            'showPercentage',
        ),
    }),
);

export const selectPieValidConfig = createSelector(
    [
        selectPieEditor,
        selectPieGroupFieldIds,
        selectPieMetricId,
        selectPieGroupLabels,
    ],
    (editor, groupFieldIds, metricId, groupLabels) =>
        buildValidPieConfig({
            ...editor,
            groupFieldIds,
            metricId,
            groupLabels,
        }),
);
