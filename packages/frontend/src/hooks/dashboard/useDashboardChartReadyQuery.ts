import {
    DEFAULT_RESULTS_PAGE_SIZE,
    getDimensions,
    getItemId,
    isDateItem,
    QueryExecutionContext,
    type ApiError,
    type ApiExploreResults,
    type SavedChart,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import {
    executeQueryAndGetFirstPage,
    type ChartReadyQueryQuery,
    type ReadyQueryResultsPageWithClientFetchTimeMs,
} from '../useQueryResults';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

export type DashboardChartReadyQuery = ChartReadyQueryQuery & {
    chart: SavedChart;
    explore: ApiExploreResults;
};

export const useDashboardChartReadyQuery = (
    tileUuid: string,
    chartUuid: string | null,
) => {
    const queryClient = useQueryClient();
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

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';

    const { data: chart } = useSavedQuery({
        id: chartUuid ?? undefined,
    });

    const { data: explore } = useExplore(chart?.metricQuery?.exploreName);

    const timezoneFixFilters =
        dashboardFilters && convertDateDashboardFilters(dashboardFilters);

    const hasADateDimension = useMemo(() => {
        const metricQueryDimensions = [
            ...(chart?.metricQuery?.dimensions ?? []),
            ...(chart?.metricQuery?.customDimensions ?? []),
        ];

        if (!explore) return false;
        return getDimensions(explore).find(
            (c) =>
                metricQueryDimensions.includes(getItemId(c)) && isDateItem(c),
        );
    }, [
        chart?.metricQuery?.customDimensions,
        chart?.metricQuery?.dimensions,
        explore,
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

    const queryKey = useMemo(
        () => [
            'dashboard_chart_ready_query',
            chart?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            context,
            autoRefresh,
            invalidateCache,
            hasADateDimension ? granularity : null,
        ],
        [
            chart?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            context,
            autoRefresh,
            invalidateCache,
            hasADateDimension,
            granularity,
        ],
    );

    return useQuery<DashboardChartReadyQuery, ApiError>({
        queryKey,
        queryFn: async () => {
            if (!chart || !explore) {
                throw new Error('Chart or explore is undefined');
            }

            const results = await executeQueryAndGetFirstPage(
                chart.projectUuid,
                {
                    context: autoRefresh
                        ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                        : context || QueryExecutionContext.DASHBOARD,
                    chartUuid: chartUuid!,
                    dashboardUuid: dashboardUuid!,
                    dashboardFilters: timezoneFixFilters,
                    dashboardSorts,
                    granularity,
                    invalidateCache,
                },
            );

            queryClient.setQueryData(
                [
                    'query-page',
                    chart?.projectUuid,
                    results.executeQueryResponse.queryUuid,
                    1,
                    DEFAULT_RESULTS_PAGE_SIZE,
                ],
                results.firstPage satisfies ReadyQueryResultsPageWithClientFetchTimeMs,
            );

            return {
                chart,
                explore,
                ...results,
            } satisfies DashboardChartReadyQuery;
        },
        enabled: Boolean(chartUuid && dashboardUuid && chart && explore),
        retry: false,
        refetchOnMount: false,
    });
};
