import { createSelector } from '@reduxjs/toolkit';
import { type RootState } from '.';

const selectSelectedDimensions = (state: RootState) =>
    state.semanticViewer.selectedDimensions;
const selectSelectedMetrics = (state: RootState) =>
    state.semanticViewer.selectedMetrics;
const selectSelectedTimeDimensions = (state: RootState) =>
    state.semanticViewer.selectedTimeDimensions;

export const selectSelectedFieldsByKind = createSelector(
    [
        selectSelectedDimensions,
        selectSelectedMetrics,
        selectSelectedTimeDimensions,
    ],
    (dimensions, timeDimensions, metrics) => ({
        dimensions,
        timeDimensions,
        metrics,
    }),
);

export const selectAllSelectedFields = createSelector(
    [selectSelectedFieldsByKind],
    ({ dimensions, metrics, timeDimensions }) => {
        return [...dimensions, ...metrics, ...timeDimensions];
    },
);
