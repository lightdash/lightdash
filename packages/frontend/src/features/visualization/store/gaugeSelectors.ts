import { type GaugeChart, type ItemsMap } from '@lightdash/common';
import {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
} from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { inputsItemsMap } from './inputSelectors';
import { selectGaugeEditor } from './selectors';

const selectGaugeAvailableFieldIds = createSelector(
    [inputsItemsMap],
    getAvailableGaugeFieldIds,
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

export const getGaugeItem = (
    itemsMap: ItemsMap | undefined,
    fieldId: string | undefined,
) => (fieldId ? itemsMap?.[fieldId] : undefined);

export const selectGaugeValidConfig = createSelector(
    [selectGaugeEditor, selectGaugeSelectedField],
    (editor, selectedField): GaugeChart => ({ ...editor, selectedField }),
);
