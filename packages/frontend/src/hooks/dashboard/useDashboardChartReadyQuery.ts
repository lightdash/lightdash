import {
    FeatureFlags,
    getAvailableParametersFromTables,
    getDateZoomCapabilities,
    QueryExecutionContext,
    type ApiError,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExploreResults,
    type ExecuteAsyncDashboardChartRequestParams,
    type SavedChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { lightdashApi } from '../../api';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import { useQueryRetryConfig } from '../useQueryRetry';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const executeAsyncDashboardChartQuery = async (
    projectUuid: string,
    data: ExecuteAsyncDashboardChartRequestParams,
): Promise<ApiExecuteAsyncDashboardChartQueryResults> =>
    lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
        url: `/projects/${projectUuid}/query/dashboard-chart`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });

// Embed-only endpoint for executing a dashboard tile query
const postEmbedDashboardTileQuery = async (
    projectUuid: string,
    data: {
        tileUuid: string;
    } & Pick<
        ExecuteAsyncDashboardChartRequestParams,
        | 'dashboardFilters'
        | 'dashboardSorts'
        | 'pivotResults'
        | 'invalidateCache'
        | 'dateZoom'
        | 'parameters'
    >,
): Promise<ApiExecuteAsyncDashboardChartQueryResults> =>
    lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
        url: `/embed/${projectUuid}/query/dashboard-tile`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export type DashboardChartReadyQuery = {
    executeQueryResponse: ApiExecuteAsyncDashboardChartQueryResults;
    chart: SavedChart;
    explore: ApiExploreResults;
};

export const useDashboardChartReadyQuery = (
    tileUuid: string,
    chartUuid: string | null,
    contextOverride?: QueryExecutionContext,
) => {
    const retryConfig = useQueryRetryConfig();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardTileStatusContext(
        (c) => c.invalidateCache,
    );
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
    );
    const markTileLoaded = useDashboardTileStatusContext(
        (c) => c.markTileLoaded,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const granularity = useDashboardContext((c) => c.dateZoomGranularity);
    const autoRefresh = useDashboardTileStatusContext((c) => c.isAutoRefresh);
    const context =
        useSearchParams<QueryExecutionContext>('context') || undefined;
    const setChartsWithDateZoomApplied = useDashboardContext(
        (c) => c.setChartsWithDateZoomApplied,
    );
    const addParameterDefinitions = useDashboardContext(
        (c) => c.addParameterDefinitions,
    );

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';

    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const chartQuery = useSavedQuery({
        uuidOrSlug: chartUuid ?? undefined,
        projectUuid,
    });

    const { data: explore, error: exploreError } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

    const addAvailableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.addAvailableCustomGranularities,
    );
    const setTileHasTimestampDimension = useDashboardTileStatusContext(
        (c) => c.setTileHasTimestampDimension,
    );

    useEffect(() => {
        if (explore) {
            addParameterDefinitions(
                getAvailableParametersFromTables(Object.values(explore.tables)),
            );
        }
    }, [explore, addParameterDefinitions]);

    const dateZoomCapabilities = useMemo(() => {
        if (!chartQuery.data || !explore) return undefined;
        return getDateZoomCapabilities(explore, chartQuery.data.metricQuery);
    }, [chartQuery.data, explore]);

    useEffect(() => {
        if (!dateZoomCapabilities) return;

        if (
            Object.keys(dateZoomCapabilities.availableCustomGranularities)
                .length > 0
        ) {
            addAvailableCustomGranularities(
                dateZoomCapabilities.availableCustomGranularities,
            );
        }
    }, [dateZoomCapabilities, addAvailableCustomGranularities]);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    const hasADateDimension = dateZoomCapabilities
        ? dateZoomCapabilities.hasDateDimension ||
          dateZoomCapabilities.hasTimestampDimension
        : false;
    const hasTimestampDimension =
        dateZoomCapabilities?.hasTimestampDimension ?? false;

    // Report TIMESTAMP dimension presence to dashboard context per tile
    useEffect(() => {
        setTileHasTimestampDimension(tileUuid, hasTimestampDimension);
        return () => setTileHasTimestampDimension(tileUuid, false);
    }, [tileUuid, hasTimestampDimension, setTileHasTimestampDimension]);

    const chartParameterValues = useMemo(() => {
        if (!tileParameterReferences || !tileParameterReferences[tileUuid])
            return {};
        return Object.fromEntries(
            Object.entries(parameterValues).filter(([key]) =>
                tileParameterReferences[tileUuid].includes(key),
            ),
        );
    }, [parameterValues, tileParameterReferences, tileUuid]);

    // dateZoomApplied comes from the query response — the backend is the
    // single source of truth for whether zoom was actually applied.
    // We still need a pre-query estimate for the query key so we avoid
    // unnecessary refetches when zoom won't have an effect.
    const isZoomLikelyApplied = hasADateDimension && !!granularity;

    const { data: useSqlPivotResults } = useServerFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const queryKey = useMemo(
        () => [
            'dashboard_chart_ready_query',
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            contextOverride || context,
            autoRefresh,
            isZoomLikelyApplied ? granularity : null,
            invalidateCache,
            chartParameterValues,
            useSqlPivotResults,
        ],
        [
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            contextOverride,
            context,
            autoRefresh,
            isZoomLikelyApplied,
            granularity,
            invalidateCache,
            chartParameterValues,
            useSqlPivotResults,
        ],
    );

    const queryResult = useQuery<DashboardChartReadyQuery, ApiError>({
        queryKey,
        queryFn: async () => {
            if (!chartQuery.data || !explore) {
                throw new Error('Chart or explore is undefined');
            }

            const requestedContext =
                contextOverride || context || QueryExecutionContext.DASHBOARD;
            const effectiveContext = autoRefresh
                ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                : requestedContext;

            const isEmbedContext =
                requestedContext === QueryExecutionContext.EMBED;

            const executeQueryResponse = isEmbedContext
                ? await postEmbedDashboardTileQuery(
                      chartQuery.data.projectUuid,
                      {
                          tileUuid,
                          dashboardFilters: timezoneFixFilters,
                          dashboardSorts,
                          dateZoom: {
                              granularity,
                          },
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: useSqlPivotResults?.enabled,
                      },
                  )
                : await executeAsyncDashboardChartQuery(
                      chartQuery.data.projectUuid,
                      {
                          context: effectiveContext,
                          tileUuid,
                          chartUuid: chartUuid!,
                          dashboardUuid: dashboardUuid!,
                          dashboardFilters: timezoneFixFilters,
                          dashboardSorts,
                          dateZoom: {
                              granularity,
                          },
                          invalidateCache,
                          parameters: parameterValues,
                          pivotResults: useSqlPivotResults?.enabled,
                      },
                  );

            return {
                chart: chartQuery.data,
                explore,
                executeQueryResponse,
            };
        },
        enabled: Boolean(
            chartUuid && dashboardUuid && chartQuery.data && explore,
        ),
        ...retryConfig,
        refetchOnMount: false,
    });

    // Update chartsWithDateZoomApplied based on the backend's dateZoomApplied
    const dateZoomApplied =
        queryResult.data?.executeQueryResponse?.dateZoomApplied ?? false;

    useEffect(() => {
        if (!chartUuid || !hasADateDimension) return;

        setChartsWithDateZoomApplied((prev) => {
            const nextSet = new Set(prev ?? []);
            if (dateZoomApplied) {
                nextSet.add(chartUuid);
            } else {
                nextSet.delete(chartUuid);
            }
            return nextSet;
        });
    }, [
        dateZoomApplied,
        hasADateDimension,
        chartUuid,
        setChartsWithDateZoomApplied,
    ]);

    useEffect(() => {
        if (queryResult.data?.executeQueryResponse?.parameterReferences) {
            addParameterReferences(
                tileUuid,
                queryResult.data.executeQueryResponse.parameterReferences,
            );
            markTileLoaded(tileUuid);
        } else if (queryResult.error) {
            // On error, there are no references, but we count the tile as loaded
            addParameterReferences(tileUuid, []);
            markTileLoaded(tileUuid);
        }
    }, [
        queryResult.data?.executeQueryResponse?.parameterReferences,
        addParameterReferences,
        markTileLoaded,
        tileUuid,
        queryResult.error,
    ]);

    return {
        ...queryResult,
        chartQuery,
        error: chartQuery.error || exploreError || queryResult.error,
    };
};
