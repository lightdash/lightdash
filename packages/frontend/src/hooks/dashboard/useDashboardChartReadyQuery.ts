import {
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

export type DashboardChartReadyQuery = {
    executeQueryResponse: ApiExecuteAsyncDashboardChartQueryResults;
    chart: SavedChart;
    explore: ApiExploreResults;
};

export const useDashboardChartReadyQuery = (
    tileUuid: string,
    chartUuid: string | null,
) => {
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const parameters = useDashboardContext((c) => c.parameters);
    const addParameterReferences = useDashboardContext(
        (c) => c.addParameterReferences,
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

    const sortKey =
        dashboardSorts
            ?.map((ds) => `${ds.fieldId}.${ds.descending}`)
            ?.join(',') || '';

    const chartQuery = useSavedQuery({
        id: chartUuid ?? undefined,
    });

    const error = chartQuery.error;

    const { data: explore } = useExplore(
        chartQuery.data?.metricQuery?.exploreName,
    );

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
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            context,
            autoRefresh,
            hasADateDimension ? granularity : null,
            invalidateCache,
            parameters,
        ],
        [
            chartQuery.data?.projectUuid,
            chartUuid,
            dashboardUuid,
            timezoneFixFilters,
            dashboardSorts,
            sortKey,
            context,
            autoRefresh,
            hasADateDimension,
            granularity,
            invalidateCache,
            parameters,
        ],
    );

    const queryResult = useQuery<DashboardChartReadyQuery, ApiError>({
        queryKey,
        queryFn: async () => {
            if (!chartQuery.data || !explore) {
                throw new Error('Chart or explore is undefined');
            }

            const executeQueryResponse = await executeAsyncDashboardChartQuery(
                chartQuery.data.projectUuid,
                {
                    context: autoRefresh
                        ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                        : context || QueryExecutionContext.DASHBOARD,
                    chartUuid: chartUuid!,
                    dashboardUuid: dashboardUuid!,
                    dashboardFilters: timezoneFixFilters,
                    dashboardSorts,
                    dateZoom: {
                        granularity,
                    },
                    invalidateCache,
                    parameters,
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

    return { ...queryResult, error: error || queryResult.error };
};
