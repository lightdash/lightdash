// Subtotals are server state, so the tree itself is built in useTreemapChartConfig
import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TreemapChart,
} from '@lightdash/common';
import {
    getTreemapMetricItem,
    getValidTreemapGroupFieldIds,
    repairTreemapSizeMetricId,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectTreemapEditor } from './selectors';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsIsLoading = (_: State, inputs: VisualizationInputs) =>
    !inputs.resultsData;

// A repaired list that equals the stored one keeps the stored identity
const keepIfEqual = <T>(stored: T, repaired: T) =>
    isEqual(stored, repaired) ? stored : repaired;

export const selectTreemapFieldPools = createSelector(
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
const selectDimensionIds = createSelector([selectTreemapFieldPools], (pools) =>
    Object.keys(pools.dimensions),
);
const selectNumericMetricIds = createSelector(
    [selectTreemapFieldPools],
    (pools) => Object.keys(pools.numericMetrics),
);

/** Stored group fields when they match the query's dimensions, else every dimension */
export const selectTreemapGroupFieldIds = createSelector(
    [
        (state: State) => selectTreemapEditor(state).groupFieldIds,
        selectDimensionIds,
    ],
    (groupFieldIds, dimensionIds) =>
        keepIfEqual(
            groupFieldIds,
            getValidTreemapGroupFieldIds(groupFieldIds, dimensionIds),
        ),
);

/** Stored size metric, or the first available one when it is unset or gone */
export const selectTreemapSizeMetricId = createSelector(
    [
        (state: State) => selectTreemapEditor(state).sizeMetricId,
        selectNumericMetricIds,
        inputsIsLoading,
    ],
    (sizeMetricId, allNumericMetricIds, isLoading) => {
        // Renames are applied to the stored id by the slice
        const repaired = repairTreemapSizeMetricId({
            sizeMetricId,
            allNumericMetricIds,
            isLoading,
            tableCalculationsMetadata: undefined,
        });
        return repaired === undefined ? sizeMetricId : repaired;
    },
);

export const selectTreemapSelectedSizeMetric = createSelector(
    [inputsItemsMap, selectTreemapSizeMetricId],
    getTreemapMetricItem,
);

export const selectTreemapSelectedColorMetric = createSelector(
    [
        inputsItemsMap,
        (state: State) => selectTreemapEditor(state).colorMetricId,
    ],
    getTreemapMetricItem,
);

export const selectTreemapValidConfig = createSelector(
    [
        selectTreemapEditor,
        selectTreemapGroupFieldIds,
        selectTreemapSizeMetricId,
    ],
    (editor, groupFieldIds, sizeMetricId): TreemapChart => ({
        visibleMin: editor.visibleMin,
        leafDepth: editor.leafDepth,
        groupFieldIds,
        sizeMetricId: sizeMetricId ?? undefined,
        useDynamicColors: editor.useDynamicColors,
        colorMetricId: editor.colorMetricId ?? undefined,
        startColor: editor.startColor,
        endColor: editor.endColor,
        startColorThreshold: editor.startColorThreshold,
        endColorThreshold: editor.endColorThreshold,
    }),
);
