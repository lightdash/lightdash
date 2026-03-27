import {
    type DashboardFilterRule,
    type DashboardFilterRuleOverride,
    type DashboardFilters,
} from '@lightdash/common';
import { useEffect, useReducer, useRef } from 'react';
import { useLocation } from 'react-router';
import useToaster from './toaster/useToaster';

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

type FilterCategory = 'dimensions' | 'metrics';

interface AddSavedFilterOverrideAction {
    type: typeof ADD_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRuleOverride;
    category: FilterCategory;
}

interface RemoveSavedFilterOverrideAction {
    type: typeof REMOVE_SAVED_FILTER_OVERRIDE;
    payload: DashboardFilterRuleOverride;
    category: FilterCategory;
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
    const { type, payload } = action;

    switch (type) {
        case ADD_SAVED_FILTER_OVERRIDE: {
            const key = action.category;
            const existing = state[key];
            const updated = existing.some((item) => item.id === payload.id)
                ? existing.map((item) =>
                      item.id === payload.id ? payload : item,
                  )
                : [...existing, payload];
            return { ...state, [key]: updated };
        }

        case REMOVE_SAVED_FILTER_OVERRIDE: {
            const key = action.category;
            return {
                ...state,
                [key]: state[key].filter((item) => item.id !== payload.id),
            };
        }

        case RESET_SAVED_FILTER_OVERRIDES:
            return { ...state, dimensions: [], metrics: [] };

        default:
            return state;
    }
};

export const useSavedDashboardFiltersOverrides = () => {
    const { search } = useLocation();
    const { showToastWarning } = useToaster();
    const searchParams = new URLSearchParams(search);
    const overridesForSavedDashboardFiltersParam = searchParams.get('filters');
    const parseErrorRef = useRef(false);

    const [state, dispatch] = useReducer(
        reducer,
        overridesForSavedDashboardFiltersParam,
        (param) => {
            if (!param) return { dimensions: [], metrics: [] };
            try {
                return JSON.parse(param);
            } catch {
                parseErrorRef.current = true;
                return { dimensions: [], metrics: [] };
            }
        },
    );

    useEffect(() => {
        if (parseErrorRef.current) {
            showToastWarning({
                title: 'Could not restore filters from URL',
                subtitle:
                    'The link appears to be incomplete. Please ask for it to be shared again.',
            });
        }
    }, [showToastWarning]);

    const addSavedFilterOverride = (
        { tileTargets, ...item }: DashboardFilterRule,
        category: FilterCategory = 'dimensions',
    ) => {
        dispatch({
            type: ADD_SAVED_FILTER_OVERRIDE,
            payload: item,
            category,
        });
    };

    const removeSavedFilterOverride = (
        { tileTargets, ...item }: DashboardFilterRule,
        category: FilterCategory = 'dimensions',
    ) => {
        dispatch({
            type: REMOVE_SAVED_FILTER_OVERRIDE,
            payload: item,
            category,
        });
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
