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

// Core metric query field selectors
export const selectDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.dimensions,
);

export const selectMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.metrics,
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

export const selectParameterReferences = createSelector(
    [selectExplorerState],
    (explorer) => explorer.parameterReferences,
);

// TODO: REDUX-MIGRATION - Add missingRequiredParameters as a computed selector once all dependencies are in Redux
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

// Query limit selector
export const selectQueryLimit = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.limit,
);

// Timezone selector
export const selectTimezone = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.timezone,
);

// Query execution selectors
const selectQueryExecution = createSelector(
    [selectExplorerState],
    (explorer) => explorer.queryExecution,
);

export const selectValidQueryArgs = createSelector(
    [selectQueryExecution],
    (queryExecution) => queryExecution.validQueryArgs,
);

export const selectUnpivotedQueryArgs = createSelector(
    [selectQueryExecution],
    (queryExecution) => queryExecution.unpivotedQueryArgs,
);

export const selectQueryUuidHistory = createSelector(
    [selectQueryExecution],
    (queryExecution) => queryExecution.queryUuidHistory,
);

export const selectUnpivotedQueryUuidHistory = createSelector(
    [selectQueryExecution],
    (queryExecution) => queryExecution.unpivotedQueryUuidHistory,
);

// Navigation context selectors
export const selectFromDashboard = createSelector(
    [selectExplorerState],
    (explorer) => explorer.fromDashboard,
);

export const selectPreviouslyFetchedState = createSelector(
    [selectExplorerState],
    (explorer) => explorer.previouslyFetchedState,
);

export const selectPivotConfig = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.pivotConfig,
);
