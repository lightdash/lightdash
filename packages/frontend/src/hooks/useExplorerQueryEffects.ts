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
    selectIsResultsExpanded,
    selectMetricQueryForApi,
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
    const metricQuery = useExplorerSelector(selectMetricQueryForApi);

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

    // Check if this is a saved chart or has pivot config from Context
    const isSavedChart = useExplorerContext(
        (context) => !!context.state.savedChart,
    );

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

    // Effect 1: Auto-fetch logic
    // Handles both initial fetch and reactive auto-fetch
    useEffect(() => {
        if (
            autoFetchEnabled ||
            ((isSavedChart || fromDashboard) &&
                !isEditMode &&
                !query.isFetched) ||
            (isEditMode && !query.isFetched && (isSavedChart || fromDashboard))
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
    ]);

    // Effect 2: Setup unpivoted query args when needed
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

    // No return - this hook just orchestrates effects
};
