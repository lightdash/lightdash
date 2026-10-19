import {
    getMissingRequiredDashboardParameters,
    stripOverridesForLockedFiltersOnTab,
    type DashboardFilters,
    type ParametersValuesMap,
} from '@lightdash/common';
import { createSelector } from '@reduxjs/toolkit';
import { type DashboardStoreState } from '.';
import { applyParameterLabelOverrides } from '../../../providers/Dashboard/parameterLabelOverrides';

export type TemporaryFilterLocks = {
    /** Saved filters of the query-loaded dashboard (embeds have none) */
    savedFilters: DashboardFilters;
    hasTabs: boolean;
};

// Filters
export const selectDashboardFilters = (state: DashboardStoreState) =>
    state.filters.dashboardFilters;
export const selectRawTemporaryFilters = (state: DashboardStoreState) =>
    state.filters.temporaryFilters;
export const selectHaveFiltersChanged = (state: DashboardStoreState) =>
    state.filters.haveFiltersChanged;
export const selectSavedFilterOverrides = (state: DashboardStoreState) =>
    state.filters.savedFilterOverrides;

/**
 * Strips temporary filters that conflict with a filter locked on the active
 * tab. Derived at read time so they reappear on tabs where nothing is locked.
 */
export const getSafeTemporaryFilters = (
    temporaryFilters: DashboardFilters,
    locks: TemporaryFilterLocks | undefined,
    activeTabUuid: string | undefined,
): { filters: DashboardFilters; droppedCount: number } =>
    locks
        ? stripOverridesForLockedFiltersOnTab(
              locks.savedFilters,
              temporaryFilters,
              activeTabUuid,
              locks.hasTabs,
          )
        : { filters: temporaryFilters, droppedCount: 0 };

export const combineDashboardFilters = (
    dashboardFilters: DashboardFilters,
    temporaryFilters: DashboardFilters,
): DashboardFilters => ({
    dimensions: [
        ...dashboardFilters.dimensions,
        ...temporaryFilters.dimensions,
    ],
    metrics: [...dashboardFilters.metrics, ...temporaryFilters.metrics],
    tableCalculations: [
        ...dashboardFilters.tableCalculations,
        ...temporaryFilters.tableCalculations,
    ],
});

// Parameters
export const selectSavedParameters = (state: DashboardStoreState) =>
    state.parameters.savedParameters;
export const selectDashboardParameters = (state: DashboardStoreState) =>
    state.parameters.parameters;
export const selectParametersHaveChanged = (state: DashboardStoreState) =>
    state.parameters.parametersHaveChanged;
export const selectPinnedParameters = (state: DashboardStoreState) =>
    state.parameters.pinnedParameters;
export const selectHavePinnedParametersChanged = (state: DashboardStoreState) =>
    state.parameters.havePinnedParametersChanged;
export const selectParameterOrder = (state: DashboardStoreState) =>
    state.parameters.parameterOrder;
export const selectHasParameterOrderChanged = (state: DashboardStoreState) =>
    state.parameters.hasParameterOrderChanged;
export const selectTileParameterReferences = (state: DashboardStoreState) =>
    state.parameters.tileParameterReferences;
const selectTileChartSavedParameters = (state: DashboardStoreState) =>
    state.parameters.tileChartSavedParameters;
const selectRawParameterDefinitions = (state: DashboardStoreState) =>
    state.parameters.parameterDefinitions;
const selectParameterLabelOverrides = (state: DashboardStoreState) =>
    state.parameters.parameterLabelOverrides;

/** Applied values, without empty ones */
export const selectParameterValues = createSelector(
    [selectDashboardParameters],
    (parameters) =>
        Object.entries(parameters).reduce<ParametersValuesMap>(
            (acc, [key, parameter]) => {
                if (
                    parameter.value !== null &&
                    parameter.value !== undefined &&
                    parameter.value !== ''
                ) {
                    acc[key] = parameter.value;
                }
                return acc;
            },
            {},
        ),
);

const selectSavedParameterValues = createSelector(
    [selectSavedParameters],
    (savedParameters): ParametersValuesMap =>
        Object.fromEntries(
            Object.entries(savedParameters).map(([key, parameter]) => [
                key,
                parameter.value,
            ]),
        ),
);

/** Tile queries run with the saved values under the current ones, so labels must too */
export const selectAppliedParameterValues = createSelector(
    [selectSavedParameterValues, selectParameterValues],
    (savedParameterValues, parameterValues): ParametersValuesMap => ({
        ...savedParameterValues,
        ...parameterValues,
    }),
);

export const selectDashboardParameterDefinitions = createSelector(
    [selectRawParameterDefinitions, selectParameterLabelOverrides],
    (parameterDefinitions, parameterLabelOverrides) =>
        applyParameterLabelOverrides(
            parameterDefinitions,
            parameterLabelOverrides,
        ),
);

export const selectDashboardParameterReferences = createSelector(
    [selectTileParameterReferences],
    (tileParameterReferences) =>
        new Set(Object.values(tileParameterReferences).flat()),
);

export const selectMissingRequiredParameters = createSelector(
    [
        selectTileParameterReferences,
        selectTileChartSavedParameters,
        selectAppliedParameterValues,
        selectDashboardParameterDefinitions,
    ],
    (
        tileParameterReferences,
        tileChartSavedParameters,
        appliedParameterValues,
        parameterDefinitions,
    ) =>
        getMissingRequiredDashboardParameters({
            tiles: Object.entries(tileParameterReferences).map(
                ([tileUuid, parameterReferences]) => ({
                    parameterReferences,
                    chartSavedValues: tileChartSavedParameters[tileUuid] ?? {},
                }),
            ),
            dashboardValues: appliedParameterValues,
            definitions: parameterDefinitions,
        }),
);
