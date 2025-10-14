import {
    deepEqual,
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useMemo } from 'react';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';
import {
    explorerActions,
    selectIsEditMode,
    selectIsResultsExpanded,
    selectMetricQuery,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import { useExplorerQueryManager } from './useExplorerQueryManager';
import { useFeatureFlag } from './useFeatureFlagEnabled';

/**
 * Effects layer for Explorer query orchestration
 *
 * This hook handles:
 * - Auto-fetch logic when state changes
 * - Unpivoted query setup for pivot tables
 * - Parameter change detection
 *
 * Should be called ONCE at the Explorer root component.
 * Child components should use useExplorerQuery() instead.
 */
export const useExplorerQueryEffects = () => {
    // Get all state and runQuery from manager (single source of truth)
    const { runQuery, query, validQueryArgs, explore, parameters } =
        useExplorerQueryManager();

    const dispatch = useExplorerDispatch();
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isResultsOpen = useExplorerSelector(selectIsResultsExpanded);
    const metricQuery = useExplorerSelector(selectMetricQuery);

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Get merged version with chartConfig and pivotConfig from Context
    const mergedUnsavedChartVersion = useExplorerContext(
        (context) => context.state.mergedUnsavedChartVersion,
    );

    // Auto-fetch configuration
    const [autoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    // Check if we need unpivoted data for results table
    const needsUnpivotedData = useMemo(() => {
        if (!useSqlPivotResults?.enabled || !explore) return false;

        const items = getFieldsFromMetricQuery(metricQuery, explore);
        const pivotConfiguration = derivePivotConfigurationFromChart(
            mergedUnsavedChartVersion,
            metricQuery,
            items,
        );

        return !!pivotConfiguration;
    }, [
        useSqlPivotResults?.enabled,
        explore,
        metricQuery,
        mergedUnsavedChartVersion,
    ]);

    // Effect 1: Setup unpivoted query args when needed
    useEffect(() => {
        if (!validQueryArgs) {
            dispatch(explorerActions.setUnpivotedQueryArgs(null));
            return;
        }

        if (needsUnpivotedData && isResultsOpen) {
            dispatch(
                explorerActions.setUnpivotedQueryArgs({
                    ...validQueryArgs,
                    pivotConfiguration: undefined,
                    pivotResults: false,
                }),
            );
        } else {
            dispatch(explorerActions.setUnpivotedQueryArgs(null));
        }
    }, [validQueryArgs, needsUnpivotedData, isResultsOpen, dispatch]);

    // Parameter change detection
    const parametersChanged = useMemo(() => {
        if (
            !query.isFetched ||
            !parameters ||
            Object.keys(parameters).length === 0
        ) {
            return false;
        }

        const currentParams = validQueryArgs?.parameters ?? {};
        return !deepEqual(currentParams, parameters);
    }, [query.isFetched, validQueryArgs?.parameters, parameters]);

    // Effect 2: Auto-fetch logic
    // Run query automatically when state changes (respects auto-fetch setting in edit mode)
    useEffect(() => {
        // If auto-fetch is disabled or the query hasn't been fetched yet, don't run the query
        // This will stop auto-fetching until the first query is run
        if (
            (!autoFetchEnabled || !query.isFetched || !parametersChanged) &&
            isEditMode
        )
            return;

        // Call runQuery - depends on individual state values, not the callback itself
        // This prevents infinite loops when manual fetches occur
        runQuery();
    }, [
        autoFetchEnabled,
        isEditMode,
        parametersChanged,
        query.isFetched,
        runQuery,
    ]);

    // No return - this hook just orchestrates effects
};
