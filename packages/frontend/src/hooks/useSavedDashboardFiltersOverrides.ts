import {
    type DashboardFilterRule,
    type DashboardFilterRuleOverride,
    type DashboardFilters,
} from '@lightdash/common';
import { useEffect, useReducer, useRef } from 'react';
import { useLocation } from 'react-router';
import useToaster from './toaster/useToaster';

// Lock state is metadata of the saved dashboard, not something the URL
// should be able to assert. Strip `lockedTabUuids` from URL-provided
// override rules so a stale shared link can't keep a filter "locked"
// after an editor has removed the lock from the saved dashboard.
const sanitizeOverrideRule = (
    rule: DashboardFilterRuleOverride & { lockedTabUuids?: string[] },
): DashboardFilterRuleOverride => {
    const { lockedTabUuids: _, ...rest } = rule;
    return rest;
};

const sanitizeOverrideState = (state: {
    dimensions?: (DashboardFilterRuleOverride & {
        lockedTabUuids?: string[];
    })[];
    metrics?: (DashboardFilterRuleOverride & {
        lockedTabUuids?: string[];
    })[];
    tableCalculations?: (DashboardFilterRuleOverride & {
        lockedTabUuids?: string[];
    })[];
}): Record<keyof DashboardFilters, DashboardFilterRuleOverride[]> => ({
    dimensions: (state.dimensions ?? []).map(sanitizeOverrideRule),
    metrics: (state.metrics ?? []).map(sanitizeOverrideRule),
    tableCalculations: (state.tableCalculations ?? []).map(
        sanitizeOverrideRule,
    ),
});

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
            const empty = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            if (!param) return empty;
            try {
                return sanitizeOverrideState(JSON.parse(param));
            } catch {
                parseErrorRef.current = true;
                return empty;
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
        { tileTargets, lockedTabUuids, ...item }: DashboardFilterRule,
        category: FilterCategory = 'dimensions',
    ) => {
        dispatch({
            type: ADD_SAVED_FILTER_OVERRIDE,
            payload: item,
            category,
        });
    };

    const removeSavedFilterOverride = (
        { tileTargets, lockedTabUuids, ...item }: DashboardFilterRule,
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
