import {
    type ApiChartAndResults,
    type ApiError,
    type DashboardFilters,
    type DateGranularity,
    FeatureFlags,
    QueryExecutionContext,
    type SortField,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../api';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { getExplore } from '../useExplore';
import { useFeatureFlag } from '../useFeatureFlagEnabled';
import { getQueryPaginatedResults } from '../useQueryResults';
import { getSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const getChartAndResults = async ({
    chartUuid,
    dashboardUuid,
    dashboardFilters,
    invalidateCache,
    dashboardSorts,
    granularity,
    autoRefresh,
    context,
}: {
    chartUuid?: string;
    dashboardUuid: string;
    dashboardFilters: DashboardFilters;
    invalidateCache?: boolean;
    dashboardSorts: SortField[];
    granularity?: DateGranularity;
    autoRefresh?: boolean;
    context?: string;
}) => {
    return lightdashApi<ApiChartAndResults>({
        url: `/saved/${chartUuid}/chart-and-results${
            context ? `?context=${context}` : ''
        }`,
        method: 'POST',
        body: JSON.stringify({
            dashboardUuid,
            dashboardFilters,
            dashboardSorts,
            granularity,
            ...(invalidateCache && { invalidateCache: true }),
            autoRefresh,
        }),
    });
};

const useDashboardChart = (tileUuid: string, chartUuid: string | null) => {
    const { data: queryPaginationEnabled } = useFeatureFlag(
        FeatureFlags.QueryPagination,
    );
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
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
    const queryClient = useQueryClient();

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';
    const queryKey = useMemo(
        () => [
            'savedChartResults',
            queryPaginationEnabled,
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            invalidateCache,
            sortKey,
            autoRefresh,
        ],
        [
            queryPaginationEnabled,
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            invalidateCache,
            sortKey,
            autoRefresh,
        ],
    );
    const apiChartAndResults =
        queryClient.getQueryData<ApiChartAndResults>(queryKey);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);
    const hasADateDimension =
        !!apiChartAndResults?.metricQuery?.metadata?.hasADateDimension;

    const fetchChartAndResults = useCallback<
        () => Promise<ApiChartAndResults & { queryUuid?: string }>
    >(async () => {
        if (queryPaginationEnabled?.enabled) {
            const chart = await getSavedQuery(chartUuid!);
            const explorePromise = getExplore(
                chart.projectUuid,
                chart.metricQuery.exploreName,
            );
            const resultsPromise = getQueryPaginatedResults(chart.projectUuid, {
                context: autoRefresh
                    ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                    : context || QueryExecutionContext.DASHBOARD,
                chartUuid: chartUuid!,
                dashboardUuid: dashboardUuid!,
                dashboardFilters: timezoneFixFilters,
                dashboardSorts,
                granularity,
                // invalidateCache, // todo: enable once API supports caching
            });

            const [explore, results] = await Promise.all([
                explorePromise,
                resultsPromise,
            ]);

            return {
                chart,
                explore,
                appliedDashboardFilters:
                    results.appliedDashboardFilters ?? undefined,
                metricQuery: results.metricQuery,
                cacheMetadata: results.cacheMetadata,
                rows: results.rows,
                fields: results.fields,
                queryUuid: results.queryUuid,
            };
        }
        return getChartAndResults({
            chartUuid: chartUuid!,
            dashboardUuid: dashboardUuid!,
            dashboardFilters: timezoneFixFilters,
            invalidateCache,
            dashboardSorts,
            granularity,
            autoRefresh,
            context,
        });
    }, [
        queryPaginationEnabled,
        chartUuid,
        dashboardUuid,
        timezoneFixFilters,
        invalidateCache,
        dashboardSorts,
        granularity,
        autoRefresh,
        context,
    ]);

    setChartsWithDateZoomApplied((prev) => {
        if (hasADateDimension) {
            if (granularity) {
                return (prev ?? new Set()).add(chartUuid!);
            }
            prev?.clear();
            return prev;
        }
        return prev;
    });

    return useQuery<ApiChartAndResults & { queryUuid?: string }, ApiError>({
        queryKey:
            hasADateDimension && granularity
                ? queryKey.concat([granularity])
                : queryKey,
        queryFn: fetchChartAndResults,
        enabled: !!chartUuid && !!dashboardUuid && !!queryPaginationEnabled,
        retry: false,
        refetchOnMount: false,
    });
};

export default useDashboardChart;
