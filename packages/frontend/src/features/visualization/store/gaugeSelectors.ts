import {
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type GaugeChart,
    type ItemsMap,
} from '@lightdash/common';
import {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import pickBy from 'lodash/pickBy';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectGaugeEditor } from './selectors';

const inputsItemsMap = (
    _: VisualizationStoreState,
    inputs: VisualizationInputs,
) => inputs.itemsMap;

export const selectGaugeAvailableFieldIds = createSelector(
    [inputsItemsMap],
    getAvailableGaugeFieldIds,
);

/** Numeric metrics and table calculations the gauge can bind */
export const selectGaugeNumericMetrics = createSelector(
    [inputsItemsMap],
    (itemsMap): ItemsMap => ({
        ...getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem),
        ...pickBy(getTableCalculationsFromItemsMap(itemsMap), isNumericItem),
    }),
);

/** Stored field, or the first available one when none is stored */
export const selectGaugeSelectedField = createSelector(
    [
        (state: VisualizationStoreState) =>
            selectGaugeEditor(state).selectedField,
        selectGaugeAvailableFieldIds,
    ],
    getEffectiveGaugeSelectedField,
);

export const selectGaugeValidConfig = createSelector(
    [selectGaugeEditor, selectGaugeSelectedField],
    (editor, selectedField): GaugeChart => ({ ...editor, selectedField }),
);
