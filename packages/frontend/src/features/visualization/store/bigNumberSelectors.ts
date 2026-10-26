import { getGranularityMapFromItems, type BigNumber } from '@lightdash/common';
import {
    buildBigNumberModel,
    getAvailableBigNumberFieldIds,
    resolveBigNumberSelectedField,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectBigNumberEditor } from './selectors';

type State = VisualizationStoreState;
const inputsItemsMap = (_: State, inputs: VisualizationInputs) =>
    inputs.itemsMap;

const selectAvailableFieldIds = createSelector(
    [inputsItemsMap],
    getAvailableBigNumberFieldIds,
);

/** Stored field, a renamed table calculation's new name, or the first available field when it is gone */
export const selectBigNumberSelectedField = createSelector(
    [
        (state: State) => selectBigNumberEditor(state).selectedField,
        inputsItemsMap,
        selectAvailableFieldIds,
        (_: State, inputs: VisualizationInputs) =>
            inputs.tableCalculationsMetadata,
    ],
    (selectedField, itemsMap, availableFieldsIds, tableCalculationsMetadata) =>
        resolveBigNumberSelectedField({
            selectedField,
            configSelectedField: selectedField,
            itemsMap,
            availableFieldsIds,
            tableCalculationsMetadata,
        }) ?? selectedField,
);

export const selectBigNumberComparisonFieldItem = createSelector(
    [
        (state: State) => selectBigNumberEditor(state).comparisonField,
        inputsItemsMap,
    ],
    (comparisonField, itemsMap) =>
        comparisonField ? itemsMap?.[comparisonField] : undefined,
);

export const selectBigNumberGranularityFields = createSelector(
    [inputsItemsMap],
    (itemsMap) => Object.keys(getGranularityMapFromItems(itemsMap)),
);

export const selectBigNumberValidConfig = createSelector(
    [selectBigNumberEditor, selectBigNumberSelectedField],
    (editor, selectedField): BigNumber => ({
        label: editor.bigNumberLabel,
        style: editor.bigNumberStyle,
        selectedField,
        showBigNumberLabel: editor.showBigNumberLabel,
        showTableNamesInLabel: editor.showTableNamesInLabel,
        showComparison: editor.showComparison,
        comparisonFormat: editor.comparisonFormat,
        flipColors: editor.flipColors,
        comparisonLabel: editor.comparisonLabel,
        conditionalFormattings: editor.conditionalFormattings,
        comparisonField: editor.comparisonField,
    }),
);

export const selectBigNumberModel = createSelector(
    [
        (_: State, inputs: VisualizationInputs) => inputs.resultsData,
        inputsItemsMap,
        (_: State, inputs: VisualizationInputs) => inputs.parameters,
        selectBigNumberValidConfig,
        (state: State) => selectBigNumberEditor(state).bigNumberComparisonStyle,
    ],
    (resultsData, itemsMap, parameters, chartConfig, comparisonStyle) =>
        buildBigNumberModel({
            resultsData,
            itemsMap,
            parameters,
            chartConfig,
            comparisonStyle,
        }),
);

export const selectBigNumberShowStyle = (
    state: State,
    inputs: VisualizationInputs,
) => selectBigNumberModel(state, inputs).showStyle;

export const selectBigNumberDefaultLabel = (
    state: State,
    inputs: VisualizationInputs,
) => selectBigNumberModel(state, inputs).defaultLabel;
