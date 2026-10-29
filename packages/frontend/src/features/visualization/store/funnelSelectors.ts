import { getDimensionsFromItemsMap } from '@lightdash/common';
import {
    buildValidFunnelConfig,
    getFunnelChartData,
    getFunnelColorDefaults,
    getFunnelSelectedField,
    resolveFunnelFieldId,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import {
    inputsColorPalette,
    inputsItemsMap,
    inputsResults,
    selectNumericMetricsAndTableCalculations,
} from './inputSelectors';
import { keepPendingField, selectPendingFieldIds } from './pendingFields';
import { selectFunnelEditor } from './selectors';

type State = VisualizationStoreState;

export const selectFunnelFieldPools = createSelector(
    [inputsItemsMap, selectNumericMetricsAndTableCalculations],
    (itemsMap, numericFields) => ({
        dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
        numericFields,
    }),
);
const selectNumericFieldIds = createSelector(
    [selectFunnelFieldPools],
    (pools) => Object.keys(pools.numericFields),
);

/** Stored field, or the first numeric field when it is gone */
export const selectFunnelFieldId = createSelector(
    [
        (state: State) => selectFunnelEditor(state).fieldId,
        selectNumericFieldIds,
        inputsResults,
        selectPendingFieldIds,
    ],
    (fieldId, allNumericFieldIds, resultsData, pendingFieldIds) =>
        resultsData
            ? keepPendingField(fieldId, pendingFieldIds, () =>
                  resolveFunnelFieldId({ fieldId, allNumericFieldIds }),
              )
            : fieldId,
);

export const selectFunnelSelectedField = createSelector(
    [inputsItemsMap, selectFunnelFieldId],
    getFunnelSelectedField,
);

const selectFunnelChartData = createSelector(
    [
        inputsResults,
        selectFunnelFieldId,
        selectFunnelSelectedField,
        (state: State) => selectFunnelEditor(state).dataInput,
        selectNumericFieldIds,
        inputsItemsMap,
    ],
    (
        resultsData,
        fieldId,
        selectedField,
        dataInput,
        allNumericFieldIds,
        itemsMap,
    ) =>
        getFunnelChartData({
            resultsData,
            fieldId,
            selectedField,
            dataInput,
            allNumericFieldIds,
            itemsMap,
        }),
);

export const selectFunnelData = (state: State, inputs: VisualizationInputs) =>
    selectFunnelChartData(state, inputs).data;

export const selectFunnelMaxValue = (
    state: State,
    inputs: VisualizationInputs,
) => selectFunnelChartData(state, inputs).maxValue;

export const selectFunnelColorDefaults = createSelector(
    [selectFunnelData, inputsColorPalette],
    getFunnelColorDefaults,
);

export const selectFunnelValidConfig = createSelector(
    [selectFunnelEditor, selectFunnelFieldId],
    (editor, fieldId) =>
        buildValidFunnelConfig({
            dataInput: editor.dataInput,
            fieldId,
            labels: editor.labels,
            labelOverrides: editor.labelOverrides,
            colorOverrides: editor.colorOverrides,
            showLegend: editor.showLegend,
            legendPosition: editor.legendPosition,
        }),
);
