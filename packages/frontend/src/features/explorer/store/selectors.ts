import { type FieldId } from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import type { ExplorerStoreState } from '.';

// Base selectors
export const selectExplorerState = (state: ExplorerStoreState) =>
    state.explorer;

export const selectUnsavedChartVersion = createSelector(
    [selectExplorerState],
    (explorer) => explorer.unsavedChartVersion,
);

export const selectMetricQuery = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.metricQuery,
);

export const selectChartConfig = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.chartConfig,
);

export const selectTableConfig = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.tableConfig,
);

export const selectPivotConfig = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.pivotConfig,
);

export const selectModals = createSelector(
    [selectExplorerState],
    (explorer) => explorer.modals,
);

export const selectExpandedSections = createSelector(
    [selectExplorerState],
    (explorer) => explorer.expandedSections,
);

export const selectParameterReferences = createSelector(
    [selectExplorerState],
    (explorer) => explorer.parameterReferences,
);

export const selectParameterDefinitions = createSelector(
    [selectExplorerState],
    (explorer) => explorer.parameterDefinitions,
);

export const selectPreviouslyFetchedState = createSelector(
    [selectExplorerState],
    (explorer) => explorer.previouslyFetchedState,
);

export const selectIsVisualizationConfigOpen = createSelector(
    [selectExplorerState],
    (explorer) => explorer.isVisualizationConfigOpen,
);

// Computed selectors
export const selectActiveFields = createSelector(
    [selectMetricQuery],
    (metricQuery): Set<FieldId> => {
        const fieldIds = [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...(metricQuery.tableCalculations?.map((tc) => tc.name) || []),
            ...(metricQuery.additionalMetrics?.map((am) => am.name) || []),
            ...(metricQuery.customDimensions?.map((cd) => cd.name) || []),
        ];
        return new Set(fieldIds);
    },
);

export const selectIsValidQuery = createSelector(
    [selectActiveFields],
    (activeFields): boolean => {
        return activeFields.size > 0;
    },
);

export const selectHasUnsavedChanges = createSelector(
    [selectMetricQuery, selectPreviouslyFetchedState],
    (metricQuery, previouslyFetchedState): boolean => {
        if (!previouslyFetchedState) return false;

        // Simple deep comparison - in production you might want to use a more optimized approach
        return (
            JSON.stringify(metricQuery) !==
            JSON.stringify(previouslyFetchedState)
        );
    },
);

// Field-specific selectors
export const selectDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.dimensions,
);

export const selectMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.metrics,
);

export const selectSorts = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.sorts,
);

export const selectFilters = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.filters,
);

export const selectTableCalculations = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.tableCalculations,
);

export const selectAdditionalMetrics = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.additionalMetrics || [],
);

export const selectCustomDimensions = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.customDimensions || [],
);

export const selectParameters = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.parameters || {},
);

export const selectLimit = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.limit,
);

export const selectTimezone = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.timezone,
);

// Missing parameters selector (computed from parameter references and definitions)
export const selectMissingRequiredParameters = createSelector(
    [selectParameterReferences, selectParameterDefinitions, selectParameters],
    (
        parameterReferences,
        parameterDefinitions,
        parameters,
    ): string[] | null => {
        if (parameterReferences === null) {
            // Can't calculate missing parameters
            return null;
        }

        const missingRequired: string[] = [];

        for (const parameterName of parameterReferences) {
            const definition = parameterDefinitions[parameterName];
            const hasValue =
                parameters[parameterName] !== undefined &&
                parameters[parameterName] !== null;

            // Required if no default value and no provided value
            if (definition && !definition.default && !hasValue) {
                missingRequired.push(parameterName);
            }
        }

        return missingRequired;
    },
);

// Chart-specific selectors
export const selectChartType = createSelector(
    [selectChartConfig],
    (chartConfig) => chartConfig.type,
);

export const selectColumnOrder = createSelector(
    [selectTableConfig],
    (tableConfig) => tableConfig.columnOrder,
);

// Modal selectors
export const selectAdditionalMetricModal = createSelector(
    [selectModals],
    (modals) => modals.additionalMetric,
);

export const selectCustomDimensionModal = createSelector(
    [selectModals],
    (modals) => modals.customDimension,
);

export const selectFormatModal = createSelector(
    [selectModals],
    (modals) => modals.format,
);

export const selectWriteBackModal = createSelector(
    [selectModals],
    (modals) => modals.writeBack,
);

// Table name selector
export const selectTableName = createSelector(
    [selectUnsavedChartVersion],
    (unsavedChartVersion) => unsavedChartVersion.tableName,
);

export const selectExploreName = createSelector(
    [selectMetricQuery],
    (metricQuery) => metricQuery.exploreName,
);
