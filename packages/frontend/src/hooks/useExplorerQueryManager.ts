import { getMissingRequiredParameters, type FieldId } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import useEmbed from '../ee/providers/Embed/useEmbed';
import {
    explorerActions,
    selectIsEditMode,
    selectIsMinimal,
    selectMetricQuery,
    selectParameterDefinitions,
    selectParameterReferences,
    selectParameters,
    selectQueryUuidHistory,
    selectTableName,
    selectUnpivotedQueryArgs,
    selectUnpivotedQueryUuidHistory,
    selectUnsavedChartVersion,
    selectValidQueryArgs,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useQueryExecutor } from '../providers/Explorer/useQueryExecutor';
import { buildQueryArgs } from './explorer/buildQueryArgs';
import { useExploreByProjectUuid } from './useExplore';
import { useDateZoomGranularitySearch } from './useExplorerRoute';
import { usePreAggregateCacheEnabled } from './usePreAggregateCacheEnabled';

type ExplorerQueryManagerArgs = {
    projectUuid?: string;
    savedQueryUuid?: string;
};

/**
 * Manager hook for Explorer query state
 *
 * This hook provides:
 * - Query state from Redux and TanStack Query
 * - Computed state (active fields, loading state, etc.)
 * - Single source of truth for runQuery function
 *
 * NOTE: This hook does NOT contain effects. For auto-fetch and other effects,
 * use useExplorerQueryEffects at the root component.
 *
 * Child components should use useExplorerQuery() for the full public API.
 */
export const useExplorerQueryManager = ({
    projectUuid: explicitProjectUuid,
    savedQueryUuid: explicitSavedQueryUuid,
}: ExplorerQueryManagerArgs = {}) => {
    // Get state from Redux selectors
    const dispatch = useExplorerDispatch();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const tableName = useExplorerSelector(selectTableName);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const minimal = useExplorerSelector(selectIsMinimal);
    const parameterDefinitions = useExplorerSelector(
        selectParameterDefinitions,
    );
    const parameterReferences = useExplorerSelector(selectParameterReferences);

    // Get query execution state from Redux
    const validQueryArgs = useExplorerSelector(selectValidQueryArgs);
    const unpivotedQueryArgs = useExplorerSelector(selectUnpivotedQueryArgs);
    const queryUuidHistory = useExplorerSelector(selectQueryUuidHistory);
    const unpivotedQueryUuidHistory = useExplorerSelector(
        selectUnpivotedQueryUuidHistory,
    );

    const embed = useEmbed();
    const params = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const savedQueryUuid =
        explicitSavedQueryUuid ||
        embed?.savedQueryUuid ||
        params.savedQueryUuid;
    const projectUuid =
        explicitProjectUuid || embed?.projectUuid || params.projectUuid!;
    const viewModeQueryArgs = useMemo(() => {
        return savedQueryUuid ? { chartUuid: savedQueryUuid } : undefined;
    }, [savedQueryUuid]);

    const dateZoomGranularity = useDateZoomGranularitySearch();

    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    const chartConfigForQuery = useMemo(
        () => ({
            chartConfig: unsavedChartVersion.chartConfig,
            pivotConfig: unsavedChartVersion.pivotConfig,
        }),
        [unsavedChartVersion.chartConfig, unsavedChartVersion.pivotConfig],
    );

    // Get explore data and pivot configuration
    const { data: explore } = useExploreByProjectUuid(tableName, projectUuid, {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const [preAggCacheEnabled] = usePreAggregateCacheEnabled();

    // Compute active fields and query validity
    const activeFields = useMemo<Set<FieldId>>(() => {
        return new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(({ name }) => name),
        ]);
    }, [metricQuery]);

    // Compute missing required parameters
    const missingRequiredParameters = useMemo(() => {
        if (parameterReferences === null) return null;

        return getMissingRequiredParameters(
            parameterReferences,
            parameters,
            parameterDefinitions,
        );
    }, [parameterReferences, parameters, parameterDefinitions]);

    // Dispatch functions for query UUID history
    const setQueryUuidHistory = useCallback(
        (history: string[]) => {
            dispatch(explorerActions.setQueryUuidHistory(history));
        },
        [dispatch],
    );

    const setUnpivotedQueryUuidHistory = useCallback(
        (history: string[]) => {
            dispatch(explorerActions.setUnpivotedQueryUuidHistory(history));
        },
        [dispatch],
    );

    // Main query executor - creates TanStack Query subscriptions
    const [mainQueryExecutor] = useQueryExecutor(
        validQueryArgs,
        missingRequiredParameters,
        true,
        queryUuidHistory,
        setQueryUuidHistory,
    );
    const { query, queryResults } = mainQueryExecutor;

    // Unpivoted query executor for results table
    const unpivotedEnabled = !!unpivotedQueryArgs;
    const [unpivotedQueryExecutor] = useQueryExecutor(
        unpivotedQueryArgs,
        missingRequiredParameters,
        unpivotedEnabled,
        unpivotedQueryUuidHistory,
        setUnpivotedQueryUuidHistory,
    );
    const { query: unpivotedQuery, queryResults: unpivotedQueryResults } =
        unpivotedQueryExecutor;

    const runQuery = useCallback((): boolean => {
        const mainQueryArgs = buildQueryArgs({
            activeFields,
            tableName,
            projectUuid,
            explore,
            computedMetricQuery: metricQuery,
            parameters,
            isEditMode,
            viewModeQueryArgs,
            dateZoomGranularity,
            minimal,
            usePreAggregateCache: preAggCacheEnabled,
            savedChart: chartConfigForQuery,
        });

        if (mainQueryArgs) {
            dispatch(explorerActions.setValidQueryArgs(mainQueryArgs));
            return true;
        }
        return false;
    }, [
        activeFields,
        tableName,
        projectUuid,
        explore,
        metricQuery,
        parameters,
        isEditMode,
        viewModeQueryArgs,
        dateZoomGranularity,
        minimal,
        preAggCacheEnabled,
        chartConfigForQuery,
        dispatch,
    ]);

    // Compute loading state
    const isLoading = useMemo(() => {
        const isCreatingQuery = query.isFetching;
        const isFetchingFirstPage = queryResults.isFetchingFirstPage;
        const isFetchingAllRows = queryResults.isFetchingAllPages;
        const isQueryError = queryResults.error;
        return (
            (isCreatingQuery || isFetchingFirstPage || isFetchingAllRows) &&
            !isQueryError
        );
    }, [
        query.isFetching,
        queryResults.isFetchingFirstPage,
        queryResults.isFetchingAllPages,
        queryResults.error,
    ]);

    return {
        // Query state
        query,
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,

        // Computed state
        isLoading,
        activeFields,
        missingRequiredParameters,
        validQueryArgs,
        tableName,
        projectUuid,
        explore,
        computedMetricQuery: metricQuery,
        parameters,

        // Query execution
        runQuery,
    };
};
