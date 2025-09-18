// import { type FieldId } from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import type { ExplorerStoreState } from '.';

// Base selectors
const selectExplorerState = (state: ExplorerStoreState) => state.explorer;

const selectUnsavedChartVersion = createSelector(
    [selectExplorerState],
    (explorer) => explorer.unsavedChartVersion,
);

const selectMetricQuery = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.metricQuery,
);

export const selectExpandedSections = createSelector(
    [selectExplorerState],
    (explorer) => explorer.expandedSections,
);

// export const selectPreviouslyFetchedState = createSelector(
//     [selectExplorerState],
//     (explorer) => explorer.previouslyFetchedState,
// );
//
// export const selectIsVisualizationConfigOpen = createSelector(
//     [selectExplorerState],
//     (explorer) => explorer.isVisualizationConfigOpen,
// );

// FiltersCard specific selectors
export const selectFilters = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.filters,
);

// export const selectTableName = createSelector(
//     [selectUnsavedChartVersion],
//     (unsavedChartVersion) => unsavedChartVersion.tableName,
// );

export const selectAdditionalMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.additionalMetrics || [],
);

export const selectCustomDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.customDimensions || [],
);

export const selectTableCalculations = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.tableCalculations,
);
