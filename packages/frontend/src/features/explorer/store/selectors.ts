// import { type FieldId } from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import type { ExplorerStoreState } from '.';
import { ExplorerSection } from '../../../providers/Explorer/types';

// Base selectors
const selectExplorerState = (state: ExplorerStoreState) => state.explorer;

const selectUnsavedChartVersion = createSelector(
    [selectExplorerState],
    (explorer) => explorer.unsavedChartVersion,
);

export const selectMetricQuery = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.metricQuery,
);

const selectExpandedSections = createSelector(
    [selectExplorerState],
    (explorer) => explorer.expandedSections,
);

// Component-specific selectors to prevent unnecessary re-renders
export const selectIsFiltersExpanded = createSelector(
    [selectExpandedSections],
    (expandedSections) => expandedSections.includes(ExplorerSection.FILTERS),
);

export const selectIsParametersExpanded = createSelector(
    [selectExpandedSections],
    (expandedSections) => expandedSections.includes(ExplorerSection.PARAMETERS),
);

export const selectIsVisualizationExpanded = createSelector(
    [selectExpandedSections],
    (expandedSections) =>
        expandedSections.includes(ExplorerSection.VISUALIZATION),
);

export const selectIsSqlExpanded = createSelector(
    [selectExpandedSections],
    (expandedSections) => expandedSections.includes(ExplorerSection.SQL),
);

export const selectIsResultsExpanded = createSelector(
    [selectExpandedSections],
    (expandedSections) => expandedSections.includes(ExplorerSection.RESULTS),
);

export const selectIsVisualizationConfigOpen = createSelector(
    [selectExplorerState],
    (explorer) => explorer.isVisualizationConfigOpen,
);

// FiltersCard specific selectors
export const selectFilters = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.filters,
);

export const selectTableName = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.tableName,
);

export const selectIsEditMode = createSelector(
    [selectExplorerState],
    (explorer) => explorer.isEditMode ?? true, // Default to true for Explorer page
);

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

// Parameter selectors
export const selectParameters = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.parameters || {},
);

export const selectParameterDefinitions = createSelector(
    [selectExplorerState],
    (explorer) => explorer.parameterDefinitions,
);

// TODO: REDUX-MIGRATION - Add missingRequiredParameters as a computed selector once all dependencies are in Redux
// TODO: REDUX-MIGRATION - Add selectParameterReferences once ParametersCard uses Redux for parameterReferences
// Currently missingRequiredParameters is computed state in Context, not stored in Redux

// ResultsCard specific selectors
export const selectSorts = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.sorts,
);

export const selectColumnOrder = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.tableConfig.columnOrder,
);
