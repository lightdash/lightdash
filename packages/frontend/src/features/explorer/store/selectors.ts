import { createSelector } from '@reduxjs/toolkit';
import { getTotalFilterRules } from '@lightdash/common';
import type { ExplorerStoreState } from '.';
import { ExplorerSection } from '../../../providers/Explorer/types';

// Base selectors
const selectExplorerState = (state: ExplorerStoreState) => state.explorer;

export const selectUnsavedChartVersion = createSelector(
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

export const selectIsFieldFiltered = createSelector(
    [selectFilters, (_state: ExplorerStoreState, fieldId: string) => fieldId],
    (filters, fieldId) => {
        if (!filters) return false;

        const allFilterRules = getTotalFilterRules(filters);
        return allFilterRules.some((rule) => rule.target.fieldId === fieldId);
    },
);

export const selectTableName = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.tableName,
);

export const selectIsEditMode = createSelector(
    [selectExplorerState],
    (explorer) => explorer.isEditMode ?? true, // Default to true for Explorer page
);

// Cached additional metrics with stable reference
let cachedAdditionalMetrics: any[] | null = null;
let cachedAdditionalMetricsKey: string | null = null;

export const selectAdditionalMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => {
        const metrics = metricQuery.additionalMetrics ?? [];
        const key = metrics
            .map((m) => m.uuid || m.name)
            .sort()
            .join(',');

        if (cachedAdditionalMetricsKey === key && cachedAdditionalMetrics) {
            return cachedAdditionalMetrics;
        }

        cachedAdditionalMetricsKey = key;
        cachedAdditionalMetrics = metrics;
        return cachedAdditionalMetrics;
    },
);

// Cached custom dimensions with stable reference
let cachedCustomDimensions: any[] | null = null;
let cachedCustomDimensionsKey: string | null = null;

export const selectCustomDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => {
        const dimensions = metricQuery.customDimensions ?? [];
        const key = dimensions
            .map((d) => d.id || d.name)
            .sort()
            .join(',');

        if (cachedCustomDimensionsKey === key && cachedCustomDimensions) {
            return cachedCustomDimensions;
        }

        cachedCustomDimensionsKey = key;
        cachedCustomDimensions = dimensions;
        return cachedCustomDimensions;
    },
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

// Active fields selector - computed from dimensions, metrics, and table calculations
// Returns a Set of all selected field IDs
let cachedActiveFieldsSet: Set<string> | null = null;
let cachedActiveFieldsKey: string | null = null;

export const selectActiveFields = createSelector(
    [selectDimensions, selectMetrics, selectTableCalculations],
    (dimensions, metrics, tableCalculations) => {
        const activeFieldsArray = [
            ...dimensions,
            ...metrics,
            ...tableCalculations.map(({ name }) => name),
        ];

        // Create stable key by sorting - same contents = same key regardless of order
        const activeFieldsKey = [...activeFieldsArray].sort().join(',');

        // Check if contents changed by comparing keys
        if (
            cachedActiveFieldsKey === activeFieldsKey &&
            cachedActiveFieldsSet
        ) {
            // Contents haven't changed - return cached Set with same reference
            return cachedActiveFieldsSet;
        }

        // Contents changed - create new Set and cache it
        cachedActiveFieldsKey = activeFieldsKey;
        cachedActiveFieldsSet = new Set(activeFieldsArray);
        return cachedActiveFieldsSet;
    },
);

// Item-level active/selected selector for TreeSingleNode performance
// This allows each node to subscribe only to its own selection status,
// preventing re-renders of all nodes when a single field is toggled
export const selectIsFieldActive = createSelector(
    [
        selectDimensions,
        selectMetrics,
        selectTableCalculations,
        (_state: ExplorerStoreState, fieldId: string) => fieldId,
    ],
    (dimensions, metrics, tableCalculations, fieldId) => {
        // Check if fieldId exists in dimensions or metrics
        if (dimensions.includes(fieldId) || metrics.includes(fieldId)) {
            return true;
        }
        // Check if fieldId matches a table calculation name
        return tableCalculations.some((tc) => tc.name === fieldId);
    },
);

// Is valid query selector - true if there are any active fields
export const selectIsValidQuery = createSelector(
    [selectActiveFields],
    (activeFields) => activeFields.size > 0,
);

// Modal selectors
const selectModals = createSelector(
    [selectExplorerState],
    (explorer) => explorer.modals,
);

export const selectItemDetailModal = createSelector(
    [selectModals],
    (modals) => modals.itemDetail,
);
