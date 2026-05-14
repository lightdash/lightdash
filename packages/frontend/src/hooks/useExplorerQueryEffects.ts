import {
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    assertUnreachable,
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
    selectMetricQuery,
    selectPendingFetch,
    selectSavedChart,
    selectTableName,
    selectUnsavedChartVersion,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import useHealth from './health/useHealth';
import { useExplorerQueryManager } from './useExplorerQueryManager';
import { usePreAggregateCacheEnabled } from './usePreAggregateCacheEnabled';
import { usePreAggregateCheck } from './usePreAggregateCheck';
import { useProjectUuid } from './useProjectUuid';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

/**
 * Effects layer for Explorer query orchestration
 *
 * This hook handles:
 * - Auto-fetch logic:
 *   1. Initial fetch: Always runs once for saved charts, dashboards, or pivot configs
 *   2. Reactive fetch: Runs when state changes (dimensions, metrics, filters, params)
 *      if auto-fetch is enabled
 * - Unpivoted query setup for pivot tables
 * - Pre-aggregate match computation (dispatched to Redux for consumers)
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

    const { data: useSqlPivotResults } = useServerFeatureFlag(
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

    // Pre-aggregate preview: checked on backend and dispatched to Redux for all consumers
    const { data: health } = useHealth();
    const isPreAggregateFeatureEnabled = health?.preAggregates?.enabled;
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const projectUuid = useProjectUuid();
    const [preAggCacheEnabled] = usePreAggregateCacheEnabled();

    const hasSelectedFields =
        metricQuery.dimensions.length > 0 ||
        metricQuery.metrics.length > 0 ||
        metricQuery.tableCalculations.length > 0;

    const hasConfiguredPreAggregates =
        !!explore?.preAggregates && explore.preAggregates.length > 0;
    const isPreAggregateSupported =
        isPreAggregateFeatureEnabled === true && hasConfiguredPreAggregates;

    const unavailableReason = useMemo<
        'feature_disabled' | 'no_configured_pre_aggregates' | null
    >(() => {
        if (isPreAggregateFeatureEnabled === false) {
            return 'feature_disabled';
        }

        if (
            isPreAggregateFeatureEnabled === true &&
            explore &&
            !hasConfiguredPreAggregates
        ) {
            return 'no_configured_pre_aggregates';
        }

        return null;
    }, [hasConfiguredPreAggregates, explore, isPreAggregateFeatureEnabled]);

    const preAggregateCheckQuery = usePreAggregateCheck({
        projectUuid,
        exploreName: tableName,
        metricQuery,
        usePreAggregateCache: preAggCacheEnabled,
        enabled: isPreAggregateSupported && hasSelectedFields,
    });

    const preAggregateCheck = useMemo(() => {
        if (unavailableReason) {
            return {
                status: 'unavailable' as const,
                reason: unavailableReason,
            };
        }

        if (isPreAggregateFeatureEnabled === undefined || !explore) {
            return {
                status: 'loading' as const,
            };
        }

        if (!hasSelectedFields) {
            return {
                status: 'idle' as const,
            };
        }

        switch (preAggregateCheckQuery.status) {
            case 'error':
                return {
                    status: 'error' as const,
                    message:
                        preAggregateCheckQuery.error.error.message ||
                        'Failed to evaluate pre-aggregate match',
                };
            case 'loading':
                return {
                    status: 'loading' as const,
                };
            case 'success':
                return {
                    status: 'ready' as const,
                    result: preAggregateCheckQuery.data,
                };
            default:
                return assertUnreachable(
                    preAggregateCheckQuery,
                    'Unknown query status',
                );
        }
    }, [
        explore,
        hasSelectedFields,
        isPreAggregateFeatureEnabled,
        unavailableReason,
        preAggregateCheckQuery,
    ]);

    useEffect(() => {
        dispatch(explorerActions.setPreAggregateCheck(preAggregateCheck));
    }, [preAggregateCheck, dispatch]);

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
            const dispatched = runQuery();
            if (dispatched) {
                dispatch(explorerActions.clearPendingFetch());
            }
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

    // No return - this hook just orchestrates effects
};
