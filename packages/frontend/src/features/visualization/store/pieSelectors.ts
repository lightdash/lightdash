import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
} from '@lightdash/common';
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
import { type VisualizationInputs } from './inputs';
import { selectPendingFieldIds } from './pendingFields';
import { selectPieEditor } from './selectors';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsResults = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData;
const inputsIsLoading = (_: State, inputs: VisualizationInputs) =>
    !inputs.resultsData;
const inputsParameters = (_: State, inputs: VisualizationInputs) =>
    inputs.parameters;
const inputsColorPalette = (_: State, inputs: VisualizationInputs) =>
    inputs.colorPalette;

// A repaired list that equals the stored one keeps the stored identity
const keepIfEqual = <T>(stored: T, repaired: T) =>
    isEqual(stored, repaired) ? stored : repaired;

export const selectPieFieldPools = createSelector(
    [inputsItemsMap],
    (itemsMap) => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericMetrics: { ...metrics, ...tableCalculations },
        };
    },
);
const selectDimensionIds = createSelector([selectPieFieldPools], (pools) =>
    Object.keys(pools.dimensions),
);
const selectNumericMetricIds = createSelector([selectPieFieldPools], (pools) =>
    Object.keys(pools.numericMetrics),
);
// The pools only know the last run; a field just added from the config
// picker must not be dropped before its results land.
const selectPendingDimensionIds = createSelector(
    [(_: State, inputs: VisualizationInputs) => inputs.unsavedMetricQuery],
    (unsavedMetricQuery) => new Set(unsavedMetricQuery?.dimensions),
);

/** Stored group fields minus the ones the results no longer have */
export const selectPieGroupFieldIds = createSelector(
    [
        (state: State) => selectPieEditor(state).groupFieldIds,
        selectDimensionIds,
        selectPendingDimensionIds,
        inputsIsLoading,
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
        inputsIsLoading,
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

export const selectPieGroupLabels = createSelector([selectPieData], (data) =>
    data.map(({ name }) => name),
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
