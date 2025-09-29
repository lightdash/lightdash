import {
    ChartType,
    deepEqual,
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    type DateGranularity,
    type FieldId,
    type PivotConfiguration,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';
import {
    selectFilters,
    selectIsEditMode,
    selectIsResultsExpanded,
    selectMetricQuery,
    selectParameterDefinitions,
    selectParameterReferences,
    selectParameters,
    selectTableName,
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
 * Hook that manages query execution for the Explorer
 * This reads from Redux state and manages TanStack Query lifecycle
 */
export const useExplorerQuery = (
    viewModeQueryArgs?:
        | { chartUuid: string; context?: string }
        | { chartUuid: string; chartVersionUuid: string },
    dateZoomGranularity?: DateGranularity,
    projectUuidProp?: string,
    minimal: boolean = false,
) => {
    // Get state from Redux selectors
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const filters = useExplorerSelector(selectFilters);
    const parameters = useExplorerSelector(selectParameters);
    const tableName = useExplorerSelector(selectTableName);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isResultsOpen = useExplorerSelector(selectIsResultsExpanded);
    const parameterDefinitions = useExplorerSelector(
        selectParameterDefinitions,
    );
    const parameterReferences = useExplorerSelector(selectParameterReferences);

    // Auto-fetch configuration
    const [autoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    // Project UUID from props or route params
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid: string;
    }>();
    const projectUuid = projectUuidProp || projectUuidFromParams;

    // Get explore data and pivot configuration
    const { data: explore } = useExplore(tableName);
    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Compute the complete metric query (including Redux filters)
    const computedMetricQuery = useMemo(
        () => ({
            ...metricQuery,
            filters,
        }),
        [metricQuery, filters],
    );

    // Compute active fields and query validity
    const [activeFields, isValidQuery] = useMemo<
        [Set<FieldId>, boolean]
    >(() => {
        const fields = new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(({ name }) => name),
        ]);

        // Only consider valid if we have fields AND a table selected
        // This prevents validation from being true before Redux is properly initialized
        return [fields, fields.size > 0 && !!tableName];
    }, [metricQuery, tableName]);

    // Compute missing required parameters
    const missingRequiredParameters = useMemo(() => {
        console.log('parameterReferences from Redux:', parameterReferences);
        if (parameterReferences === null) return null;

        // Missing required parameters are the ones that are not set and don't have a default value
        const missing = parameterReferences.filter(
            (parameter) =>
                !parameters?.[parameter] &&
                !parameterDefinitions?.[parameter]?.default,
        );
        console.log('missingRequiredParameters:', missing);
        return missing;
    }, [parameterReferences, parameters, parameterDefinitions]);

    // State for query arguments
    const [validQueryArgs, setValidQueryArgs] =
        useState<QueryResultsProps | null>(null);
    const [unpivotedQueryArgs, setUnpivotedQueryArgs] =
        useState<QueryResultsProps | null>(null);

    // Check if we need unpivoted data for results table
    const needsUnpivotedData = useMemo(() => {
        if (!useSqlPivotResults?.enabled || !explore) return false;

        const items = getFieldsFromMetricQuery(metricQuery, explore);
        const pivotConfiguration = derivePivotConfigurationFromChart(
            {
                chartConfig: { type: ChartType.TABLE }, // Default for detection
                pivotConfig: undefined,
            },
            metricQuery,
            items,
        );

        return !!pivotConfiguration;
    }, [useSqlPivotResults?.enabled, explore, metricQuery]);

    // Main query manager
    const [mainQueryManager, mainSetQueryUuidHistory] = useQueryManager(
        validQueryArgs,
        missingRequiredParameters,
    );
    const { query, queryResults } = mainQueryManager;

    console.log('🔍 useExplorerQuery Redux state:', {
        tableName,
        dimensions: metricQuery.dimensions,
        metrics: metricQuery.metrics,
        parameters: Object.keys(parameters || {}),
        parameterReferences,
        filtersCount: Object.keys(filters).length,
    });

    console.log('🔍 useExplorerQuery query state:', {
        validQueryArgsExists: !!validQueryArgs,
        missingParams: missingRequiredParameters,
        queryStatus: query.status,
        queryIsFetched: query.isFetched,
        queryData: !!query.data,
        queryResultsRows: queryResults.rows?.length,
        queryResultsTotal: queryResults.totalResults,
    });

    // Unpivoted query manager for results table
    const [unpivotedQueryManager, unpivotedSetQueryUuidHistory] =
        useQueryManager(
            unpivotedQueryArgs,
            missingRequiredParameters,
            isResultsOpen, // Only execute when results panel is open
        );
    const { query: unpivotedQuery, queryResults: unpivotedQueryResults } =
        unpivotedQueryManager;

    // Query client for manual operations
    const queryClient = useQueryClient();

    // Function to prepare and set query arguments
    const runQuery = useCallback(() => {
        const hasFields = activeFields.size > 0;
        console.log('🔍 runQuery called with:', {
            tableName,
            hasFields,
            projectUuid,
            explore: !!explore,
        });

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
                        chartConfig: { type: ChartType.TABLE }, // Default for query hook
                        pivotConfig: undefined,
                    },
                    computedMetricQuery,
                    items,
                );
            }

            // Prepare query args
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

            console.log('🔍 Setting validQueryArgs:', mainQueryArgs);
            setValidQueryArgs(mainQueryArgs);
        } else {
            console.warn(
                `Can't make SQL request, invalid state`,
                tableName,
                hasFields,
                computedMetricQuery,
            );
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
    ]);

    // Set up unpivoted query args when needed
    useEffect(() => {
        if (!validQueryArgs) {
            setUnpivotedQueryArgs(null);
            return;
        }

        if (needsUnpivotedData && isResultsOpen) {
            setUnpivotedQueryArgs({
                ...validQueryArgs,
                pivotConfiguration: undefined,
                pivotResults: false,
            });
        } else {
            setUnpivotedQueryArgs(null);
        }
    }, [validQueryArgs, needsUnpivotedData, isResultsOpen]);

    // Auto-fetch logic
    useEffect(() => {
        if ((!autoFetchEnabled || !query.isFetched) && isEditMode) return;
        runQuery();
    }, [runQuery, autoFetchEnabled, isEditMode, query.isFetched]);

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

    // Re-run query on parameter changes
    useEffect(() => {
        if (parametersChanged && autoFetchEnabled) {
            runQuery();
        }
    }, [parametersChanged, autoFetchEnabled, runQuery]);

    // Reset query results
    const resetQueryResults = useCallback(() => {
        setValidQueryArgs(null);
        setUnpivotedQueryArgs(null);
        mainSetQueryUuidHistory([]);
        unpivotedSetQueryUuidHistory([]);
        void queryClient.removeQueries({
            queryKey: ['create-query'],
            exact: false,
        });
    }, [queryClient, mainSetQueryUuidHistory, unpivotedSetQueryUuidHistory]);

    // Fetch results (manual refresh) - follows original pattern: reset then run
    const fetchResults = useCallback(() => {
        console.log('🔍 fetchResults called!');
        // force new results even when query is the same
        resetQueryResults();
        console.log('🔍 resetQueryResults done');
        runQuery();
        console.log('🔍 runQuery called');
    }, [resetQueryResults, runQuery]);

    // Get download query UUID
    const getDownloadQueryUuid = useCallback(
        async (limit: number | null) => {
            let queryUuid = queryResults.queryUuid;
            // Always execute a new query if limit is different
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

    // Compute loading state for components like RefreshButton
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

        // Computed loading state
        isLoading,

        // Query management
        runQuery,
        fetchResults,
        resetQueryResults,
        getDownloadQueryUuid,

        // Query configuration
        validQueryArgs,
        missingRequiredParameters,

        // State derived from Redux
        activeFields,
        isValidQuery,
    };
};

/**
 * Hook for manual query actions (fetch, cancel)
 * This should be used in components that already use useExplorerQuery
 */
export const useExplorerQueryActions = (
    projectUuid?: string,
    queryUuid?: string,
) => {
    const queryClient = useQueryClient();
    const { mutate: cancelQueryMutation } = useCancelQuery(
        projectUuid,
        queryUuid,
    );

    // Force refresh by invalidating and resetting queries
    const fetchResults = useCallback(() => {
        // Clear existing queries to force fresh execution
        void queryClient.resetQueries({
            queryKey: ['create-query'],
            exact: false,
        });
    }, [queryClient]);

    // Cancel running query
    const cancelQuery = useCallback(() => {
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });

        if (queryUuid) {
            cancelQueryMutation();
        }
    }, [queryClient, queryUuid, cancelQueryMutation]);

    return {
        fetchResults,
        cancelQuery,
    };
};
