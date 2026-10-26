import {
    buildValidSankeyConfig,
    getSankeyData,
    getSankeyFields,
    resolveSankeyMetricFieldId,
    resolveSankeySourceFieldId,
    resolveSankeyTargetFieldId,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import {
    inputsHasNoResults,
    inputsItemsMap,
    inputsResults,
} from './inputSelectors';
import { keepPendingField, selectPendingFieldIds } from './pendingFields';
import { selectSankeyEditor } from './selectors';

type State = VisualizationStoreState;
const storedSourceFieldId = (state: State) =>
    selectSankeyEditor(state).sourceFieldId;

export const selectSankeyFieldPools = createSelector(
    [inputsItemsMap],
    getSankeyFields,
);
const selectDimensionIds = createSelector([selectSankeyFieldPools], (pools) =>
    Object.keys(pools.dimensions),
);
const selectNumericFieldIds = createSelector(
    [selectSankeyFieldPools],
    (pools) => Object.keys(pools.numericFields),
);

/** Stored source, or the first dimension when it is unset or gone */
export const selectSankeySourceFieldId = createSelector(
    [
        storedSourceFieldId,
        selectDimensionIds,
        inputsHasNoResults,
        selectPendingFieldIds,
    ],
    (sourceFieldId, dimensionIds, isLoading, pendingFieldIds) =>
        keepPendingField(sourceFieldId, pendingFieldIds, () =>
            resolveSankeySourceFieldId({
                sourceFieldId,
                dimensionIds,
                isLoading,
            }),
        ),
);

// Resolved against the stored source, as the effects and headless render did
export const selectSankeyTargetFieldId = createSelector(
    [
        (state: State) => selectSankeyEditor(state).targetFieldId,
        storedSourceFieldId,
        selectDimensionIds,
        inputsHasNoResults,
        selectPendingFieldIds,
    ],
    (targetFieldId, sourceFieldId, dimensionIds, isLoading, pendingFieldIds) =>
        keepPendingField(targetFieldId, pendingFieldIds, () =>
            resolveSankeyTargetFieldId({
                targetFieldId,
                sourceFieldId,
                dimensionIds,
                isLoading,
            }),
        ),
);

/** Stored metric, or the first numeric field when it is unset or gone */
export const selectSankeyMetricFieldId = createSelector(
    [
        (state: State) => selectSankeyEditor(state).metricFieldId,
        selectNumericFieldIds,
        inputsHasNoResults,
        selectPendingFieldIds,
    ],
    (metricFieldId, numericFieldIds, isLoading, pendingFieldIds) =>
        keepPendingField(metricFieldId, pendingFieldIds, () =>
            resolveSankeyMetricFieldId({
                metricFieldId,
                numericFieldIds,
                isLoading,
            }),
        ),
);

export const selectSankeyData = createSelector(
    [
        inputsResults,
        selectSankeySourceFieldId,
        selectSankeyTargetFieldId,
        selectSankeyMetricFieldId,
        (state: State) => selectSankeyEditor(state).nodeLayout,
    ],
    (resultsData, sourceFieldId, targetFieldId, metricFieldId, nodeLayout) =>
        getSankeyData({
            resultsData,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeLayout,
        }),
);

export const selectSankeyValidConfig = createSelector(
    [
        selectSankeyEditor,
        selectSankeySourceFieldId,
        selectSankeyTargetFieldId,
        selectSankeyMetricFieldId,
    ],
    (editor, sourceFieldId, targetFieldId, metricFieldId) =>
        buildValidSankeyConfig({
            ...editor,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
        }),
);

export const selectSankeyHasCycle = createSelector(
    [selectSankeyData],
    (data) => data.hasCycle,
);
