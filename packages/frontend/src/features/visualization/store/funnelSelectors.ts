import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type TableCalculation,
} from '@lightdash/common';
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
import { selectFunnelEditor } from './selectors';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;
const inputsResults = (_: State, inputs: VisualizationInputs) =>
    inputs.resultsData;

export const selectFunnelFieldPools = createSelector(
    [inputsItemsMap],
    (itemsMap) => {
        const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
        const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);
        const numericTableCalculations = Object.keys(tableCalculations).reduce<
            Record<string, TableCalculation>
        >((acc, key) => {
            if (isNumericItem(tableCalculations[key])) {
                acc[key] = tableCalculations[key];
            }
            return acc;
        }, {});
        return {
            dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
            numericFields: { ...metrics, ...numericTableCalculations },
        };
    },
);
const selectNumericFieldIds = createSelector(
    [selectFunnelFieldPools],
    (pools) => Object.keys(pools.numericFields),
);

/** Stored field, a renamed table calculation's new name, or the first numeric field when it is gone */
export const selectFunnelFieldId = createSelector(
    [
        (state: State) => selectFunnelEditor(state).fieldId,
        selectNumericFieldIds,
        inputsResults,
        (_: State, inputs: VisualizationInputs) =>
            inputs.tableCalculationsMetadata,
    ],
    (fieldId, allNumericFieldIds, resultsData, tableCalculationsMetadata) => {
        if (!resultsData) return fieldId;
        // Twice: a renamed table calculation whose new name is not numeric falls back too
        const repair = (id: string | null) =>
            resolveFunnelFieldId({
                fieldId: id,
                allNumericFieldIds,
                tableCalculationsMetadata,
            });
        return repair(repair(fieldId));
    },
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
    [
        selectFunnelData,
        (_: State, inputs: VisualizationInputs) => inputs.colorPalette,
    ],
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
