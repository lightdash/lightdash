import {
    applyDimensionOverrides,
    applyMetricOverrides,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import isEqual from 'lodash/isEqual';
import { hasSavedFilterValueChanged } from '../../dashboardFilters/FilterConfiguration/utils';
import {
    addSavedFilterOverride,
    emptySavedFilterOverrides,
    reconcileSavedFilterOverrideIds,
    removeSavedFilterOverride,
    resetSavedFilterOverrides,
    type SavedFilterOverrideCategory,
    type SavedFilterOverrides,
} from './savedFilterOverrides';

// Identity matters: the load logic treats `dashboardFilters === emptyDashboardFilters`
// as "not applied yet", exactly like the provider's previous useState sentinel.
export const emptyDashboardFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

export type DashboardFiltersState = {
    dashboardFilters: DashboardFilters;
    /** Unstripped; read through the lock-aware temporary-filter hooks. */
    temporaryFilters: DashboardFilters;
    haveFiltersChanged: boolean;
    /** Viewer overrides of saved filters, mirrored in the `filters` URL param. */
    savedFilterOverrides: SavedFilterOverrides;
};

export const initialDashboardFiltersState: DashboardFiltersState = {
    dashboardFilters: emptyDashboardFilters,
    temporaryFilters: emptyDashboardFilters,
    haveFiltersChanged: false,
    savedFilterOverrides: emptySavedFilterOverrides,
};

type FilterCategory = SavedFilterOverrideCategory;

export const dashboardFiltersActions = {
    setDashboardFilters: createAction<DashboardFilters>(
        'dashboardFilters/setDashboardFilters',
    ),
    setTemporaryFilters: createAction<DashboardFilters>(
        'dashboardFilters/setTemporaryFilters',
    ),
    setHaveFiltersChanged: createAction<boolean>(
        'dashboardFilters/setHaveFiltersChanged',
    ),
    addFilter: createAction<{
        filter: DashboardFilterRule;
        isTemporary: boolean;
        category: FilterCategory;
    }>('dashboardFilters/addFilter'),
    updateFilter: createAction<{
        filter: DashboardFilterRule;
        index: number;
        isTemporary: boolean;
        isInEditMode: boolean;
        /** Whether the rule exists in the saved dashboard's filters */
        isFilterSaved: boolean;
        /** Saved rule at the same index, to detect a revert */
        originalFilter: DashboardFilterRule | undefined;
        category: FilterCategory;
    }>('dashboardFilters/updateFilter'),
    removeFilter: createAction<{
        index: number;
        isTemporary: boolean;
        category: FilterCategory;
    }>('dashboardFilters/removeFilter'),
    resetFilters: createAction<DashboardFilters>(
        'dashboardFilters/resetFilters',
    ),
    reconcileSavedFilterOverrideIds: createAction<DashboardFilters>(
        'dashboardFilters/reconcileSavedFilterOverrideIds',
    ),
    /** Re-applies URL overrides (already stripped of locked rules) onto the filters */
    applySavedFilterOverrides: createAction<DashboardFilters>(
        'dashboardFilters/applySavedFilterOverrides',
    ),
};

const updateTarget = (
    state: DashboardFiltersState,
    isTemporary: boolean,
    update: (filters: DashboardFilters) => DashboardFilters,
): DashboardFiltersState =>
    isTemporary
        ? { ...state, temporaryFilters: update(state.temporaryFilters) }
        : { ...state, dashboardFilters: update(state.dashboardFilters) };

const replaceAt = <T>(items: T[], index: number, item: T): T[] => [
    ...items.slice(0, index),
    item,
    ...items.slice(index + 1),
];

const removeAt = <T>(items: T[], index: number): T[] => [
    ...items.slice(0, index),
    ...items.slice(index + 1),
];

// Tile queries and the URL send filters as JSON; re-applying an override an
// edit already applied only adds undefined keys, which JSON drops
const isSameOnTheWire = (a: DashboardFilters, b: DashboardFilters) =>
    isEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

// Plain reducer rather than createSlice: Immer would deep-freeze the react-query
// dashboard objects stored here and break any code that still mutates them.
export const dashboardFiltersReducer = (
    state: DashboardFiltersState = initialDashboardFiltersState,
    action: UnknownAction,
): DashboardFiltersState => {
    if (dashboardFiltersActions.setDashboardFilters.match(action)) {
        return state.dashboardFilters === action.payload
            ? state
            : { ...state, dashboardFilters: action.payload };
    }
    if (dashboardFiltersActions.setTemporaryFilters.match(action)) {
        return state.temporaryFilters === action.payload
            ? state
            : { ...state, temporaryFilters: action.payload };
    }
    if (dashboardFiltersActions.setHaveFiltersChanged.match(action)) {
        return state.haveFiltersChanged === action.payload
            ? state
            : { ...state, haveFiltersChanged: action.payload };
    }
    if (dashboardFiltersActions.addFilter.match(action)) {
        const { filter, isTemporary, category } = action.payload;
        return {
            ...updateTarget(state, isTemporary, (filters) => ({
                ...filters,
                [category]: [...filters[category], filter],
            })),
            haveFiltersChanged: true,
        };
    }
    if (dashboardFiltersActions.updateFilter.match(action)) {
        const {
            filter,
            index,
            isTemporary,
            isInEditMode,
            isFilterSaved,
            originalFilter,
            category,
        } = action.payload;
        let { savedFilterOverrides } = state;
        if (!isTemporary) {
            if (isInEditMode) {
                savedFilterOverrides = removeSavedFilterOverride(
                    savedFilterOverrides,
                    filter,
                    category,
                );
            } else {
                const isReverted =
                    originalFilter &&
                    !hasSavedFilterValueChanged(originalFilter, filter);
                if (isReverted) {
                    savedFilterOverrides = removeSavedFilterOverride(
                        savedFilterOverrides,
                        filter,
                        category,
                    );
                } else if (
                    isFilterSaved &&
                    hasSavedFilterValueChanged(
                        state.dashboardFilters[category][index],
                        filter,
                    )
                ) {
                    savedFilterOverrides = addSavedFilterOverride(
                        savedFilterOverrides,
                        filter,
                        category,
                    );
                }
            }
        }
        return {
            ...updateTarget(state, isTemporary, (filters) => ({
                ...filters,
                [category]: replaceAt(filters[category], index, filter),
            })),
            savedFilterOverrides,
            haveFiltersChanged: true,
        };
    }
    if (dashboardFiltersActions.removeFilter.match(action)) {
        const { index, isTemporary, category } = action.payload;
        const removedRule = state.dashboardFilters[category][index];
        return {
            ...updateTarget(state, isTemporary, (filters) => ({
                ...filters,
                [category]: removeAt(filters[category], index),
            })),
            savedFilterOverrides:
                !isTemporary && removedRule
                    ? removeSavedFilterOverride(
                          state.savedFilterOverrides,
                          removedRule,
                          category,
                      )
                    : state.savedFilterOverrides,
            haveFiltersChanged: true,
        };
    }
    if (dashboardFiltersActions.resetFilters.match(action)) {
        return {
            ...state,
            dashboardFilters: action.payload,
            temporaryFilters: emptyDashboardFilters,
            savedFilterOverrides: resetSavedFilterOverrides(
                state.savedFilterOverrides,
            ),
        };
    }
    if (dashboardFiltersActions.reconcileSavedFilterOverrideIds.match(action)) {
        const savedFilterOverrides = reconcileSavedFilterOverrideIds(
            state.savedFilterOverrides,
            action.payload,
        );
        return savedFilterOverrides === state.savedFilterOverrides
            ? state
            : { ...state, savedFilterOverrides };
    }
    if (dashboardFiltersActions.applySavedFilterOverrides.match(action)) {
        const overrides = action.payload;
        const previous = state.dashboardFilters;
        const dashboardFilters: DashboardFilters = {
            ...previous,
            dimensions: applyDimensionOverrides(previous, overrides),
        };
        if (overrides.metrics?.length > 0) {
            dashboardFilters.metrics = applyMetricOverrides(
                previous,
                overrides,
            );
        }
        return isSameOnTheWire(dashboardFilters, previous)
            ? state
            : { ...state, dashboardFilters };
    }
    return state;
};
