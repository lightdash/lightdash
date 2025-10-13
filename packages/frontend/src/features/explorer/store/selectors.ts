import {
    convertFieldRefToFieldId,
    getAllReferences,
    getItemId,
    getTotalFilterRules,
    getVisibleFields,
    isCustomBinDimension,
    isCustomSqlDimension,
    type AdditionalMetric,
    type CustomDimension,
    type Explore,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
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

// Stable empty arrays to prevent unnecessary re-renders
const EMPTY_ADDITIONAL_METRICS: AdditionalMetric[] = [];
const EMPTY_CUSTOM_DIMENSIONS: CustomDimension[] = [];

export const selectAdditionalMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.additionalMetrics ?? EMPTY_ADDITIONAL_METRICS,
);

export const selectCustomDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.customDimensions ?? EMPTY_CUSTOM_DIMENSIONS,
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

export const selectMetricOverrides = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.metricOverrides || {},
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

// Stable empty Set to prevent unnecessary re-renders
const EMPTY_ACTIVE_FIELDS_SET: Set<string> = new Set();

// Active fields selector - computed from dimensions, metrics, and table calculations
// Returns a Set of all selected field IDs
export const selectActiveFields = createSelector(
    [selectDimensions, selectMetrics, selectTableCalculations],
    (dimensions, metrics, tableCalculations) => {
        if (
            dimensions.length === 0 &&
            metrics.length === 0 &&
            tableCalculations.length === 0
        ) {
            return EMPTY_ACTIVE_FIELDS_SET;
        }

        return new Set([
            ...dimensions,
            ...metrics,
            ...tableCalculations.map(({ name }) => name),
        ]);
    },
);

// Stable empty arrays to prevent unnecessary re-renders
const EMPTY_MISSING_CUSTOM_METRICS: AdditionalMetric[] = [];
const EMPTY_MISSING_CUSTOM_DIMENSIONS: CustomDimension[] = [];
const EMPTY_MISSING_FIELDS: string[] = [];

// Missing fields selectors - compute fields that are selected but no longer available
export const selectMissingCustomMetrics = createSelector(
    [
        selectAdditionalMetrics,
        (_state: ExplorerStoreState, explore: Explore | undefined) => explore,
    ],
    (additionalMetrics, explore) => {
        if (!explore || !additionalMetrics || additionalMetrics.length === 0) {
            return EMPTY_MISSING_CUSTOM_METRICS;
        }

        const missing = additionalMetrics.filter((metric) => {
            const table = explore.tables[metric.table];
            return (
                !table ||
                (metric.baseDimensionName &&
                    !table.dimensions[metric.baseDimensionName])
            );
        });

        return missing.length > 0 ? missing : EMPTY_MISSING_CUSTOM_METRICS;
    },
);

export const selectMissingCustomDimensions = createSelector(
    [
        selectCustomDimensions,
        selectAdditionalMetrics,
        (_state: ExplorerStoreState, explore: Explore | undefined) => explore,
    ],
    (customDimensions, additionalMetrics, explore) => {
        if (!explore || !customDimensions || customDimensions.length === 0) {
            return EMPTY_MISSING_CUSTOM_DIMENSIONS;
        }

        const visibleFields = getVisibleFields(explore);
        const allFields = [
            ...visibleFields,
            ...(additionalMetrics || []),
            ...(customDimensions || []),
        ];
        const fieldIds = allFields.map((field) => getItemId(field));

        const missing = customDimensions.filter((customDimension) => {
            const isCustomBinDimensionMissing =
                isCustomBinDimension(customDimension) &&
                !fieldIds.includes(customDimension.dimensionId);

            const isCustomSqlDimensionMissing =
                isCustomSqlDimension(customDimension) &&
                getAllReferences(customDimension.sql)
                    .map((ref) => convertFieldRefToFieldId(ref))
                    .some((refFieldId) => !fieldIds.includes(refFieldId));

            return isCustomBinDimensionMissing || isCustomSqlDimensionMissing;
        });

        return missing.length > 0 ? missing : EMPTY_MISSING_CUSTOM_DIMENSIONS;
    },
);

// Selector for all missing field IDs (dimensions/metrics that are selected but not in explore)
export const selectMissingFieldIds = createSelector(
    [
        selectDimensions,
        selectMetrics,
        selectAdditionalMetrics,
        selectCustomDimensions,
        (_state: ExplorerStoreState, explore: Explore | undefined) => explore,
    ],
    (dimensions, metrics, additionalMetrics, customDimensions, explore) => {
        if (!explore) return EMPTY_MISSING_FIELDS;

        const selectedFields = [...dimensions, ...metrics];
        if (selectedFields.length === 0) return EMPTY_MISSING_FIELDS;

        const visibleFields = getVisibleFields(explore);
        const allFields = [
            ...visibleFields,
            ...(additionalMetrics || []),
            ...(customDimensions || []),
        ];
        const fieldIds = allFields.map((field) => getItemId(field));

        const missing = selectedFields.filter(
            (node) => !fieldIds.includes(node),
        );
        return missing.length > 0 ? missing : EMPTY_MISSING_FIELDS;
    },
);

// Item-level active/selected selector for TreeSingleNode performance
export const selectIsFieldActive = createSelector(
    [
        selectDimensions,
        selectMetrics,
        selectTableCalculations,
        (_state: ExplorerStoreState, fieldId: string) => fieldId,
    ],
    (dimensions, metrics, tableCalculations, fieldId) => {
        if (dimensions.includes(fieldId) || metrics.includes(fieldId)) {
            return true;
        }
        return tableCalculations.some((tc) => tc.name === fieldId);
    },
);

// Is valid query selector - true if there are any active fields AND a table is selected
export const selectIsValidQuery = createSelector(
    [selectActiveFields, selectTableName],
    (activeFields, tableName) => activeFields.size > 0 && !!tableName,
);

// Modal selectors
const selectModals = createSelector(
    [selectExplorerState],
    (explorer) => explorer.modals,
);

export const selectItemDetailModal = createSelector(
    [selectModals],
    (modals) => modals?.itemDetail ?? { isOpen: false },
);
