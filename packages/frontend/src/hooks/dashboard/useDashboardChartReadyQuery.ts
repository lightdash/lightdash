import {
    FeatureFlags,
    getAvailableParametersFromTables,
    getDimensions,
    getItemId,
    isDateItem,
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
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import { useFeatureFlag } from '../useFeatureFlagEnabled';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
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
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
    );
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    const granularity = useDashboardContext((c) => c.dateZoomGranularity);
    const autoRefresh = useDashboardContext((c) => c.isAutoRefresh);
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

    const chartQuery = useSavedQuery({
        id: chartUuid ?? undefined,
    });

    const { data: explore, error: exploreError } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

    useEffect(() => {
        if (explore) {
            addParameterDefinitions(
                getAvailableParametersFromTables(Object.values(explore.tables)),
            );
        }
    }, [explore, addParameterDefinitions]);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    const hasADateDimension = useMemo(() => {
        const metricQueryDimensions = [
            ...(chartQuery.data?.metricQuery?.dimensions ?? []),
            ...(chartQuery.data?.metricQuery?.customDimensions ?? []),
        ];

        if (!explore) return false;
        return getDimensions(explore).find(
            (c) =>
                metricQueryDimensions.includes(getItemId(c)) && isDateItem(c),
        );
    }, [
        chartQuery.data?.metricQuery?.customDimensions,
        chartQuery.data?.metricQuery?.dimensions,
        explore,
    ]);

    const chartParameterValues = useMemo(() => {
        if (!tileParameterReferences || !tileParameterReferences[tileUuid])
            return {};
        return Object.fromEntries(
            Object.entries(parameterValues).filter(([key]) =>
                tileParameterReferences[tileUuid].includes(key),
            ),
        );
    }, [parameterValues, tileParameterReferences, tileUuid]);

    useEffect(() => {
        if (!chartUuid) return;

        setChartsWithDateZoomApplied((prev) => {
            if (hasADateDimension) {
                const nextSet = new Set(prev ?? []);
                if (granularity) {
                    nextSet.add(chartUuid);
                } else {
                    nextSet.delete(chartUuid);
                }
                return nextSet;
            }
            return prev;
        });
    }, [
        hasADateDimension,
        granularity,
        chartUuid,
        setChartsWithDateZoomApplied,
    ]);

    const { data: useSqlPivotResults } = useFeatureFlag(
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
            hasADateDimension ? granularity : null,
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
            hasADateDimension,
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
        retry: false,
        refetchOnMount: false,
    });

    useEffect(() => {
        if (queryResult.data?.executeQueryResponse?.parameterReferences) {
            addParameterReferences(
                tileUuid,
                queryResult.data.executeQueryResponse.parameterReferences,
            );
        } else if (queryResult.error) {
            // On error, there are no references, but we count the tile as loaded
            addParameterReferences(tileUuid, []);
        }
    }, [
        queryResult.data?.executeQueryResponse?.parameterReferences,
        addParameterReferences,
        tileUuid,
        queryResult.error,
    ]);

    return {
        ...queryResult,
        error: chartQuery.error || exploreError || queryResult.error,
    };
};
