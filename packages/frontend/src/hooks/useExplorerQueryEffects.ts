import {
    derivePivotConfigurationFromChart,
    ExploreType,
    FeatureFlags,
    getFieldsFromMetricQuery,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useMemo, useRef } from 'react';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';
import {
    explorerActions,
    selectFromDashboard,
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
    const pendingSemanticAutoFetch = useRef(false);
    const SEMANTIC_LAYER_AUTO_FETCH_DEBOUNCE_MS = 800;

    useEffect(() => {
        dispatch(explorerActions.setIsMinimal(minimal));
    }, [minimal, dispatch]);

    // Get all state and runQuery from manager (single source of truth)
    const { runQuery, query, validQueryArgs, explore } =
        useExplorerQueryManager();

    const isResultsOpen = useExplorerSelector(selectIsResultsExpanded);
    const fromDashboard = useExplorerSelector(selectFromDashboard);
    const isExploreFromHere = useExplorerSelector(selectIsExploreFromHere);

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const isSemanticLayerExplore = explore?.type === ExploreType.SEMANTIC_LAYER;

    // Auto-fetch configuration
    const [autoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    const savedChart = useExplorerSelector(selectSavedChart);
    const isSavedChart = !!savedChart;

    // Check if we need unpivoted data for results table
    const needsUnpivotedData = useMemo(() => {
        if (
            !useSqlPivotResults?.enabled ||
            !explore ||
            explore.type === ExploreType.SEMANTIC_LAYER
        ) {
            return false;
        }

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

    const shouldAutoFetch =
        autoFetchEnabled ||
        ((isSavedChart || fromDashboard || isExploreFromHere) &&
            !query.isFetched);

    // Effect 1: Auto-fetch logic
    // Handles both initial fetch and reactive auto-fetch
    useEffect(() => {
        if (!shouldAutoFetch) return;

        if (!isSemanticLayerExplore) {
            runQuery();
            return;
        }

        const timeout = window.setTimeout(() => {
            if (query.isFetching) {
                pendingSemanticAutoFetch.current = true;
                return;
            }
            runQuery();
        }, SEMANTIC_LAYER_AUTO_FETCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeout);
    }, [shouldAutoFetch, runQuery, query.isFetching, isSemanticLayerExplore]);

    useEffect(() => {
        if (!shouldAutoFetch || !isSemanticLayerExplore) return;
        if (!query.isFetching && pendingSemanticAutoFetch.current) {
            pendingSemanticAutoFetch.current = false;
            runQuery();
        }
    }, [shouldAutoFetch, isSemanticLayerExplore, query.isFetching, runQuery]);

    // Effect 2: Handle explicit query execution requests (works regardless of auto-fetch setting)
    const pendingFetch = useExplorerSelector(selectPendingFetch);

    useEffect(() => {
        if (pendingFetch) {
            if (isSemanticLayerExplore && query.isFetching) {
                pendingSemanticAutoFetch.current = true;
            } else {
                runQuery();
            }
            dispatch(explorerActions.clearPendingFetch());
        }
    }, [
        pendingFetch,
        runQuery,
        dispatch,
        isSemanticLayerExplore,
        query.isFetching,
    ]);

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
