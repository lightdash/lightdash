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
import { useExplore } from '../useExplore';
import { useFeatureFlag } from '../useFeatureFlagEnabled';
import { getQueryPaginatedResults } from '../useQueryResults';
import { useSavedQuery } from '../useSavedQuery';
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
    const {
        data: queryPaginationEnabled,
        isFetched: isQueryPaginationFetched,
    } = useFeatureFlag(FeatureFlags.QueryPagination);

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

    const { data: chart, isFetched: isChartFetched } = useSavedQuery({
        id: chartUuid!,
        useQueryOptions: {
            enabled: !!chartUuid && queryPaginationEnabled?.enabled,
        },
    });

    const { data: explore, isFetched: isExploreFetched } = useExplore(
        chart?.metricQuery?.exploreName,
        {
            enabled:
                !!chart?.metricQuery?.exploreName &&
                queryPaginationEnabled?.enabled,
        },
    );

    const apiChartAndResults =
        queryClient.getQueryData<ApiChartAndResults>(queryKey);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);
    const hasADateDimension =
        !!apiChartAndResults?.metricQuery?.metadata?.hasADateDimension;

    const fetchChartAndResults = useCallback<
        () => Promise<
            ApiChartAndResults & {
                queryUuid?: string;
                warehouseExecutionTimeMs?: number;
                totalTimeMs?: number;
            }
        >
    >(async () => {
        if (queryPaginationEnabled?.enabled && explore && chart) {
            const results = await getQueryPaginatedResults(chart.projectUuid, {
                context: autoRefresh
                    ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                    : context || QueryExecutionContext.DASHBOARD,
                chartUuid: chartUuid!,
                dashboardUuid: dashboardUuid!,
                dashboardFilters: timezoneFixFilters,
                dashboardSorts,
                granularity,
                invalidateCache,
            });

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
                warehouseExecutionTimeMs: results.warehouseExecutionTimeMs,
                totalTimeMs: results.totalTimeMs,
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
        queryPaginationEnabled?.enabled,
        explore,
        chart,
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

    return useQuery<
        ApiChartAndResults & {
            queryUuid?: string;
            warehouseExecutionTimeMs?: number;
            totalTimeMs?: number;
        },
        ApiError
    >({
        queryKey:
            hasADateDimension && granularity
                ? queryKey.concat([granularity])
                : queryKey,
        queryFn: fetchChartAndResults,
        enabled:
            !!chartUuid &&
            !!dashboardUuid &&
            isQueryPaginationFetched &&
            ((isExploreFetched &&
                isChartFetched &&
                queryPaginationEnabled?.enabled) ||
                !queryPaginationEnabled?.enabled),
        retry: false,
        refetchOnMount: false,
    });
};

export default useDashboardChart;
