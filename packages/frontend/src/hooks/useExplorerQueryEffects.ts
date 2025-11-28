import {
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
    selectFromDashboard,
    selectIsEditMode,
    selectIsExploreFromHere,
    selectIsResultsExpanded,
    selectPendingFetch,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplorerQueryManager } from './useExplorerQueryManager';
import { useFeatureFlag } from './useFeatureFlagEnabled';

/**
 * Effects layer for Explorer query orchestration
 *
 * This hook handles:
 * - Auto-fetch logic:
 *   1. Initial fetch: Always runs once for saved charts, dashboards, or pivot configs
 *   2. Reactive fetch: Runs when state changes (dimensions, metrics, filters, params)
 *      if auto-fetch is enabled
 * - Unpivoted query setup for pivot tables
 *
 * Should be called ONCE at the Explorer root component.
 * Child components should use useExplorerQuery() instead.
 */
export const useExplorerQueryEffects = ({
    minimal = false,
}: { minimal?: boolean } = {}) => {
    const dispatch = useExplorerDispatch();

    useEffect(() => {
        dispatch(explorerActions.setIsMinimal(minimal));
    }, [minimal, dispatch]);

    // Get all state and runQuery from manager (single source of truth)
    const { runQuery, query, validQueryArgs, explore } =
        useExplorerQueryManager();

    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isResultsOpen = useExplorerSelector(selectIsResultsExpanded);
    const fromDashboard = useExplorerSelector(selectFromDashboard);
    const isExploreFromHere = useExplorerSelector(selectIsExploreFromHere);

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    // Auto-fetch configuration
    const [autoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    const savedChart = useExplorerSelector(selectSavedChart);
    const isSavedChart = !!savedChart;

    // Check if we need unpivoted data for results table
    const needsUnpivotedData = useMemo(() => {
        if (!useSqlPivotResults?.enabled || !explore) return false;

        const items = getFieldsFromMetricQuery(
            unsavedChartVersion.metricQuery,
            explore,
        );
        const pivotConfiguration = derivePivotConfigurationFromChart(
            unsavedChartVersion,
            unsavedChartVersion.metricQuery,
            items,
        );

        return !!pivotConfiguration;
    }, [useSqlPivotResults?.enabled, explore, unsavedChartVersion]);

    // Effect 1: Auto-fetch logic
    // Handles both initial fetch and reactive auto-fetch
    useEffect(() => {
        if (
            autoFetchEnabled ||
            ((isSavedChart || fromDashboard || isExploreFromHere) &&
                !query.isFetched)
        ) {
            runQuery();
        }
    }, [
        autoFetchEnabled,
        isSavedChart,
        fromDashboard,
        runQuery,
        query.isFetched,
        isEditMode,
        isExploreFromHere,
    ]);

    // Effect 2: Handle explicit query execution requests (works regardless of auto-fetch setting)
    const pendingFetch = useExplorerSelector(selectPendingFetch);

    useEffect(() => {
        if (pendingFetch) {
            runQuery();
            dispatch(explorerActions.clearPendingFetch());
        }
    }, [pendingFetch, runQuery, dispatch]);

    // Effect 3: Setup unpivoted query args when needed
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

    // Effect 4: Sync complete column order when query results change
    const { queryResults } = useExplorerQueryManager();

    useEffect(() => {
        if (queryResults.columns) {
            dispatch(
                explorerActions.setCompleteColumnOrder(queryResults.columns),
            );
        }
    }, [queryResults.columns, dispatch]);

    // No return - this hook just orchestrates effects
};
