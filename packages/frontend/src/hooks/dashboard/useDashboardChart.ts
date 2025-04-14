import {
    type ApiChartAndResults,
    type ApiError,
    QueryExecutionContext,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { convertDateDashboardFilters } from '../../utils/dateFilter';
import { useExplore } from '../useExplore';
import { getQueryPaginatedResults } from '../useQueryResults';
import { useSavedQuery } from '../useSavedQuery';
import useSearchParams from '../useSearchParams';
import useDashboardFiltersForTile from './useDashboardFiltersForTile';

const useDashboardChart = (tileUuid: string, chartUuid: string | null) => {
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
    const hasADateDimension = !!chart?.metricQuery?.metadata?.hasADateDimension;

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
            'dashboardChart',
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
            ],
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
        ],
    );

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
        queryFn: async () => {
            if (!chart || !explore) {
                throw new Error('Chart or explore is undefined');
            }

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
            } satisfies ApiChartAndResults & {
                queryUuid?: string;
                warehouseExecutionTimeMs?: number;
                totalTimeMs?: number;
            };
        },
        enabled: Boolean(chartUuid && dashboardUuid && chart && explore),
        retry: false,
        refetchOnMount: false,
    });
};

export default useDashboardChart;
