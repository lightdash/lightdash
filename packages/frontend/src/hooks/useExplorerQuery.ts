import {
    ChartType,
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    type DateGranularity,
    type PivotConfiguration,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import {
    explorerActions,
    selectFilters,
    selectIsEditMode,
    selectMetricQuery,
    selectParameterDefinitions,
    selectParameterReferences,
    selectParameters,
    selectQueryUuidHistory,
    selectTableName,
    selectUnpivotedQueryArgs,
    selectUnpivotedQueryUuidHistory,
    selectValidQueryArgs,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useQueryManager } from '../providers/Explorer/useExplorerQueryManager';
import { useExplore } from './useExplore';
import { useFeatureFlag } from './useFeatureFlagEnabled';
import {
    executeQueryAndWaitForResults,
    useCancelQuery,
    type QueryResultsProps,
} from './useQueryResults';

/**
 * Main hook for Explorer query management
 *
 * This hook:
 * - Reads from Redux
 * - Accesses TanStack Query cache (cheap - queries are shared across all instances)
 * - Provides action functions (cheap - just callbacks with dispatch)
 */
export const useExplorerQuery = (options?: {
    viewModeQueryArgs?:
        | { chartUuid: string; context?: string }
        | { chartUuid: string; chartVersionUuid: string };
    dateZoomGranularity?: DateGranularity;
    projectUuid?: string;
    minimal?: boolean;
}) => {
    const viewModeQueryArgs = options?.viewModeQueryArgs;
    const dateZoomGranularity = options?.dateZoomGranularity;
    const projectUuidProp = options?.projectUuid;
    const minimal = options?.minimal ?? false;

    // Redux state (cheap - memoized selectors)
    const dispatch = useExplorerDispatch();
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const filters = useExplorerSelector(selectFilters);
    const parameters = useExplorerSelector(selectParameters);
    const tableName = useExplorerSelector(selectTableName);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const validQueryArgs = useExplorerSelector(selectValidQueryArgs);
    const queryUuidHistory = useExplorerSelector(selectQueryUuidHistory);
    const unpivotedQueryUuidHistory = useExplorerSelector(
        selectUnpivotedQueryUuidHistory,
    );
    const parameterDefinitions = useExplorerSelector(
        selectParameterDefinitions,
    );
    const parameterReferences = useExplorerSelector(selectParameterReferences);

    // Compute missing required parameters
    const missingRequiredParameters = useMemo(() => {
        if (parameterReferences === null) return null;

        const missing = parameterReferences.filter(
            (parameter) =>
                !parameters?.[parameter] &&
                !parameterDefinitions?.[parameter]?.default,
        );
        return missing;
    }, [parameterReferences, parameters, parameterDefinitions]);

    // Project UUID
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const projectUuid = projectUuidProp || projectUuidFromParams;

    // Get explore data
    const { data: explore } = useExplore(tableName);
    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Access TanStack Query state (cheap - cache is shared across all hook instances)
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

    // Main query state
    const [mainQueryManager] = useQueryManager(
        validQueryArgs,
        missingRequiredParameters,
        true,
        queryUuidHistory,
        setQueryUuidHistory,
    );
    const { query, queryResults } = mainQueryManager;

    // Unpivoted query state (only if needed)
    const unpivotedQueryArgs = useExplorerSelector(selectUnpivotedQueryArgs);
    const unpivotedEnabled = !!unpivotedQueryArgs;
    const [unpivotedQueryManager] = useQueryManager(
        unpivotedQueryArgs,
        missingRequiredParameters,
        unpivotedEnabled,
        unpivotedQueryUuidHistory,
        setUnpivotedQueryUuidHistory,
    );
    const { query: unpivotedQuery, queryResults: unpivotedQueryResults } =
        unpivotedQueryManager;

    // Computed metric query (including filters)
    const computedMetricQuery = useMemo(
        () => ({
            ...metricQuery,
            filters,
        }),
        [metricQuery, filters],
    );

    // Compute active fields and query validity
    const [activeFields, isValidQuery] = useMemo(() => {
        const fields = new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(({ name }) => name),
        ]);
        return [fields, fields.size > 0 && !!tableName];
    }, [metricQuery, tableName]);

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

    // Query client for actions
    const queryClient = useQueryClient();

    // Action: Run query
    const runQuery = useCallback(() => {
        const hasFields = activeFields.size > 0;

        if (tableName && hasFields && projectUuid) {
            let pivotConfiguration: PivotConfiguration | undefined;

            if (!explore) {
                return;
            }

            if (useSqlPivotResults?.enabled && explore) {
                const items = getFieldsFromMetricQuery(
                    computedMetricQuery,
                    explore,
                );
                pivotConfiguration = derivePivotConfigurationFromChart(
                    {
                        chartConfig: { type: ChartType.TABLE },
                        pivotConfig: undefined,
                    },
                    computedMetricQuery,
                    items,
                );
            }

            const mainQueryArgs: QueryResultsProps = {
                projectUuid,
                tableId: tableName,
                query: computedMetricQuery,
                ...(isEditMode ? {} : viewModeQueryArgs),
                dateZoomGranularity,
                invalidateCache: minimal,
                parameters: parameters || {},
                pivotConfiguration,
            };

            dispatch(explorerActions.setValidQueryArgs(mainQueryArgs));
        }
    }, [
        activeFields,
        tableName,
        projectUuid,
        explore,
        useSqlPivotResults,
        computedMetricQuery,
        parameters,
        isEditMode,
        viewModeQueryArgs,
        dateZoomGranularity,
        minimal,
        dispatch,
    ]);

    // Action: Reset query results
    const resetQueryResults = useCallback(() => {
        dispatch(explorerActions.resetQueryExecution());
        void queryClient.removeQueries({
            queryKey: ['create-query'],
            exact: false,
        });
    }, [queryClient, dispatch]);

    // Action: Fetch results (force refresh)
    const fetchResults = useCallback(() => {
        resetQueryResults();
        runQuery();
    }, [resetQueryResults, runQuery]);

    // Action: Get download query UUID
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            let queryUuid = queryResults.queryUuid;
            if (limit === null || limit !== queryResults.totalResults) {
                const queryArgsWithLimit: QueryResultsProps | null =
                    validQueryArgs
                        ? {
                              ...validQueryArgs,
                              csvLimit: limit,
                              invalidateCache: minimal,
                              pivotResults: useSqlPivotResults?.enabled,
                          }
                        : null;
                const downloadQuery = await executeQueryAndWaitForResults(
                    queryArgsWithLimit,
                );
                queryUuid = downloadQuery.queryUuid;
            }
            if (!queryUuid) {
                throw new Error(`Missing query uuid`);
            }
            return queryUuid;
        },
        [
            queryResults.queryUuid,
            queryResults.totalResults,
            validQueryArgs,
            minimal,
            useSqlPivotResults,
        ],
    );

    // Action: Cancel query
    const { mutate: cancelQueryMutation } = useCancelQuery(
        projectUuid,
        queryResults.queryUuid,
    );
    const cancelQuery = useCallback(() => {
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        if (queryResults.queryUuid) {
            cancelQueryMutation();
        }
    }, [queryClient, queryResults.queryUuid, cancelQueryMutation]);

    return {
        // Query state
        query,
        queryResults,
        unpivotedQuery,
        unpivotedQueryResults,

        // Computed state
        isLoading,
        isValidQuery,
        activeFields,
        missingRequiredParameters,
        validQueryArgs,

        // Actions
        runQuery,
        fetchResults,
        resetQueryResults,
        getDownloadQueryUuid,
        cancelQuery,
    };
};
