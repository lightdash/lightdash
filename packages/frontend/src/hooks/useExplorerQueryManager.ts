import {
    deepEqual,
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    type DateGranularity,
    type FieldId,
} from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import {
    AUTO_FETCH_ENABLED_DEFAULT,
    AUTO_FETCH_ENABLED_KEY,
} from '../components/RunQuerySettings/defaults';
import {
    explorerActions,
    selectFilters,
    selectIsEditMode,
    selectIsResultsExpanded,
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
import { useExplore } from './useExplore';
import { useFeatureFlag } from './useFeatureFlagEnabled';

/**
 * Manager hook for Explorer query orchestration
 *
 * This hook contains all the heavy logic:
 * - Effects for auto-fetch, parameter watching, unpivoted query setup
 * - Query manager instantiation
 * - Redux state updates
 *
 * Should be called ONCE at the Explorer root component.
 * Child components should use useExplorerQuery() instead.
 */
export const useExplorerQueryManager = (options?: {
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
    // Get state from Redux selectors
    const dispatch = useExplorerDispatch();
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

    // Get query execution state from Redux
    const validQueryArgs = useExplorerSelector(selectValidQueryArgs);
    const unpivotedQueryArgs = useExplorerSelector(selectUnpivotedQueryArgs);
    const queryUuidHistory = useExplorerSelector(selectQueryUuidHistory);
    const unpivotedQueryUuidHistory = useExplorerSelector(
        selectUnpivotedQueryUuidHistory,
    );
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

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

        // Missing required parameters are the ones that are not set and don't have a default value
        const missing = parameterReferences.filter(
            (parameter) =>
                !parameters?.[parameter] &&
                !parameterDefinitions?.[parameter]?.default,
        );
        return missing;
    }, [parameterReferences, parameters, parameterDefinitions]);

    // Check if we need unpivoted data for results table
    const needsUnpivotedData = useMemo(() => {
        if (!useSqlPivotResults?.enabled || !explore) return false;

        const items = getFieldsFromMetricQuery(metricQuery, explore);
        const pivotConfiguration = derivePivotConfigurationFromChart(
            unsavedChartVersion,
            metricQuery,
            items,
        );

        return !!pivotConfiguration;
    }, [
        useSqlPivotResults?.enabled,
        explore,
        metricQuery,
        unsavedChartVersion,
    ]);

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
    const { query } = mainQueryExecutor;

    // Unpivoted query executor for results table
    // Only enable when we actually need unpivoted data AND results are open AND we have valid args
    const unpivotedEnabled =
        needsUnpivotedData && isResultsOpen && !!unpivotedQueryArgs;
    useQueryExecutor(
        unpivotedQueryArgs,
        missingRequiredParameters,
        unpivotedEnabled,
        unpivotedQueryUuidHistory,
        setUnpivotedQueryUuidHistory,
    );

    // Function to prepare and set query arguments
    const runQuery = useCallback(() => {
        const mainQueryArgs = buildQueryArgs({
            activeFields,
            tableName,
            projectUuid,
            explore,
            useSqlPivotResults: useSqlPivotResults?.enabled ?? false,
            computedMetricQuery,
            parameters,
            isEditMode,
            viewModeQueryArgs,
            dateZoomGranularity,
            minimal,
            savedChart: unsavedChartVersion,
        });

        if (mainQueryArgs) {
            dispatch(explorerActions.setValidQueryArgs(mainQueryArgs));
        } else {
            console.warn(
                `Can't make SQL request, invalid state`,
                tableName,
                activeFields.size,
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
        unsavedChartVersion,
        dispatch,
    ]);

    // Set up unpivoted query args when needed
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

    // Auto-fetch logic
    // Run query automatically when state changes (respects auto-fetch setting in edit mode)
    useEffect(() => {
        // If auto-fetch is disabled or the query hasn't been fetched yet, don't run the query
        // This will stop auto-fetching until the first query is run
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

    // No return value - this hook just orchestrates
};
