// Subtotals are server state, so the tree itself is built in useTreemapChartConfig
import { type TreemapChart } from '@lightdash/common';
import {
    getTreemapMetricItem,
    getValidTreemapGroupFieldIds,
    repairTreemapSizeMetricId,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import {
    inputsHasNoResults,
    inputsItemsMap,
    keepIfEqual,
    selectDimensionsAndNumericMetrics,
} from './inputSelectors';
import { keepPendingField, selectPendingFieldIds } from './pendingFields';
import { selectTreemapEditor } from './selectors';

type State = VisualizationStoreState;

const selectDimensionIds = createSelector(
    [selectDimensionsAndNumericMetrics],
    (pools) => Object.keys(pools.dimensions),
);
const selectNumericMetricIds = createSelector(
    [selectDimensionsAndNumericMetrics],
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
        inputsHasNoResults,
        selectPendingFieldIds,
    ],
    (sizeMetricId, allNumericMetricIds, isLoading, pendingFieldIds) =>
        keepPendingField(
            sizeMetricId,
            pendingFieldIds,
            () =>
                repairTreemapSizeMetricId({
                    sizeMetricId,
                    allNumericMetricIds,
                    isLoading,
                    tableCalculationsMetadata: undefined,
                }) ?? sizeMetricId,
        ),
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
