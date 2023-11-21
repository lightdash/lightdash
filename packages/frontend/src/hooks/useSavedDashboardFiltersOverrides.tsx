import { DashboardFilterRule, DashboardFilters } from '@lightdash/common';
import { useReducer } from 'react';
import { useLocation } from 'react-router-dom';

export const hasSavedFiltersOverrides = (
    overrides: DashboardFilters | undefined,
) =>
    !!(
        overrides &&
        (overrides.dimensions?.length > 0 || overrides.metrics?.length > 0)
    );

export const applyDimensionOverrides = (
    dashboardFilters: DashboardFilters,
    overrides: DashboardFilters | DashboardFilterRule[],
    keepTileTargets = false,
) =>
    dashboardFilters.dimensions.map((dimension) => {
        if (overrides instanceof Array) {
            const override = overrides.find(
                (overrideDimension) => overrideDimension.id === dimension.id,
            );
            if (override && keepTileTargets) {
                if (override.disabled) delete override.disabled;
                return {
                    ...override,
                    tileTargets: dimension.tileTargets,
                };
            }
            return dimension;
        } else {
            const override = overrides.dimensions.find(
                (overrideDimension) => overrideDimension.id === dimension.id,
            );
            return override || dimension;
        }
    });

const ADD_SAVED_FILTER_OVERRIDE = 'ADD_SAVED_FILTER_OVERRIDE';
const REMOVE_SAVED_FILTER_OVERRIDE = 'REMOVE_SAVED_FILTER_OVERRIDE';

interface AddSavedFilterOverrideAction {
    type: typeof ADD_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRule;
}

interface RemoveSavedFilterOverrideAction {
    type: typeof REMOVE_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRule;
}

type Action = AddSavedFilterOverrideAction | RemoveSavedFilterOverrideAction;

const reducer = (state: DashboardFilters, action: Action) => {
    let newDimensions = [...state.dimensions];
    const { type, payload } = action;

    switch (type) {
        case ADD_SAVED_FILTER_OVERRIDE:
            newDimensions = state.dimensions.some(
                (dim) => dim.id === payload.id,
            )
                ? state.dimensions.map((dim) =>
                      dim.id === payload.id ? payload : dim,
                  )
                : [...state.dimensions, payload];
            return { ...state, dimensions: newDimensions };

        case REMOVE_SAVED_FILTER_OVERRIDE:
            newDimensions = state.dimensions.filter(
                (dim) => dim.id !== payload.id,
            );
            return { ...state, dimensions: newDimensions };

        default:
            return state;
    }
};

export const useSavedDashboardFiltersOverrides = () => {
    const { search } = useLocation();
    const searchParams = new URLSearchParams(search);
    const overridesForSavedDashboardFiltersParam = searchParams.get('filters');

    const [state, dispatch] = useReducer(
        reducer,
        overridesForSavedDashboardFiltersParam
            ? JSON.parse(overridesForSavedDashboardFiltersParam)
            : { dimensions: [], metrics: [] },
    );

    const addSavedFilterOverride = (item: DashboardFilterRule) => {
        dispatch({ type: ADD_SAVED_FILTER_OVERRIDE, payload: item });
    };

    const removeSavedFilterOverride = (item: DashboardFilterRule) => {
        dispatch({ type: REMOVE_SAVED_FILTER_OVERRIDE, payload: item });
    };

    return {
        overridesForSavedDashboardFilters: state,
        addSavedFilterOverride,
        removeSavedFilterOverride,
    };
};
