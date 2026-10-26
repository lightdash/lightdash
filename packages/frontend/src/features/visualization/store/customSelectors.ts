import { buildCustomVisualizationData } from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { inputsRows } from './inputSelectors';
import { selectCustomEditor } from './selectors';

/** The rows as the raw series and field ids a Vega spec plots */
export const selectCustomVisualizationData = createSelector(
    [inputsRows],
    (rows) => buildCustomVisualizationData(rows ? { rows } : undefined),
);

export const selectCustomValidConfig = createSelector(
    [
        (state: VisualizationStoreState) =>
            selectCustomEditor(state).visSpecObject,
    ],
    (spec) => ({ spec }),
);
