import { buildCustomVisualizationData } from '@lightdash/visualization/editor';
import { createSelector } from '@reduxjs/toolkit';
import { type VisualizationStoreState } from '.';
import { type VisualizationInputs } from './inputs';
import { selectCustomEditor } from './selectors';

/** The rows as the raw series and field ids a Vega spec plots */
export const selectCustomVisualizationData = createSelector(
    [
        (_: VisualizationStoreState, inputs: VisualizationInputs) =>
            inputs.resultsData?.rows,
    ],
    (rows) => buildCustomVisualizationData(rows ? { rows } : undefined),
);

export const selectCustomValidConfig = createSelector(
    [
        (state: VisualizationStoreState) =>
            selectCustomEditor(state).visSpecObject,
    ],
    (spec) => ({ spec }),
);
