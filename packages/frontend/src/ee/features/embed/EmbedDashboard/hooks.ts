import type {
    ApiEmbedExecuteAsnycDashboardChartQueryResults,
    ApiError,
    Dashboard,
    InteractivityOptions,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import useDashboardFiltersForTile from '../../../../hooks/dashboard/useDashboardFiltersForTile';
import { useInfiniteQueryResults } from '../../../../hooks/useQueryResults';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import { postEmbedDashboard, postEmbedExecuteAsyncDashboardChart } from './api';

export const useEmbedDashboard = (
    projectUuid: string | undefined,
    embedToken: string | undefined,
) => {
    return useQuery<Dashboard & InteractivityOptions, ApiError>({
        queryKey: ['embed-dashboard'],
        queryFn: () => postEmbedDashboard(projectUuid!, embedToken!),
        enabled: !!embedToken && !!projectUuid,
        retry: false,
    });
};

export const useEmbedExecuteAsnycDashboardChartQuery = (
    projectUuid: string,
    embedToken: string,
    tileUuid: string,
) => {
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartSort = useDashboardContext((c) => c.chartSort);
    const dashboardSorts = useMemo(
        () => chartSort[tileUuid] || [],
        [chartSort, tileUuid],
    );
    return useQuery<
        ApiEmbedExecuteAsnycDashboardChartQueryResults['results'],
        ApiError
    >(
        [
            'embed-execute-async-dashboard-chart-query',
            embedToken,
            projectUuid,
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
            dashboardSorts,
        ],
        {
            queryFn: () =>
                postEmbedExecuteAsyncDashboardChart(projectUuid, embedToken, {
                    tileUuid,
                    dashboardFilters,
                    dateZoomGranularity,
                    dashboardSorts,
                }),
        },
    );
};

export const useEmbedInfiniteQueryResults = (
    projectUuid: string,
    queryUuid: string | undefined,
    embedToken: string,
) => {
    return useInfiniteQueryResults(
        projectUuid,
        queryUuid,
        undefined,
        true,
        embedToken,
    );
};
