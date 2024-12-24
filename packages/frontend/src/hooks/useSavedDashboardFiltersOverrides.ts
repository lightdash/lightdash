import {
    type DashboardFilterRule,
    type DashboardFilterRuleOverride,
    type DashboardFilters,
} from '@lightdash/common';
import { useReducer } from 'react';
import { useLocation } from 'react-router-dom';

export const hasSavedFiltersOverrides = (
    overrides: DashboardFilters | undefined,
) =>
    !!(
        overrides &&
        (overrides.dimensions?.length > 0 || overrides.metrics?.length > 0)
    );

const ADD_SAVED_FILTER_OVERRIDE = 'ADD_SAVED_FILTER_OVERRIDE';
const REMOVE_SAVED_FILTER_OVERRIDE = 'REMOVE_SAVED_FILTER_OVERRIDE';
const RESET_SAVED_FILTER_OVERRIDES = 'RESET_SAVED_FILTER_OVERRIDES';

interface AddSavedFilterOverrideAction {
    type: typeof ADD_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRuleOverride;
}

interface RemoveSavedFilterOverrideAction {
    type: typeof REMOVE_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRuleOverride;
}

interface ResetSavedFilterOverridesAction {
    type: typeof RESET_SAVED_FILTER_OVERRIDES;
    payload: null;
}

type Action =
    | AddSavedFilterOverrideAction
    | RemoveSavedFilterOverrideAction
    | ResetSavedFilterOverridesAction;

const reducer = (
    state: Record<keyof DashboardFilters, DashboardFilterRuleOverride[]>,
    action: Action,
) => {
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

        case RESET_SAVED_FILTER_OVERRIDES:
            return { ...state, dimensions: [], metrics: [] };

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

    const addSavedFilterOverride = ({
        tileTargets,
        ...item
    }: DashboardFilterRule) => {
        dispatch({ type: ADD_SAVED_FILTER_OVERRIDE, payload: item });
    };

    const removeSavedFilterOverride = ({
        tileTargets,
        ...item
    }: DashboardFilterRule) => {
        dispatch({ type: REMOVE_SAVED_FILTER_OVERRIDE, payload: item });
    };

    const resetSavedFilterOverrides = () => {
        dispatch({ type: RESET_SAVED_FILTER_OVERRIDES, payload: null });
    };

    return {
        overridesForSavedDashboardFilters: state,
        addSavedFilterOverride,
        removeSavedFilterOverride,
        resetSavedFilterOverrides,
    };
};
