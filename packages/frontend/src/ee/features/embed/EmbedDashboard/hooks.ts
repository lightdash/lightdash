import type {
    ApiChartAndResults,
    ApiError,
    Dashboard,
    InteractivityOptions,
    SortField,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import useDashboardFiltersForTile from '../../../../hooks/dashboard/useDashboardFiltersForTile';
import useDashboardContext from '../../../../providers/Dashboard/useDashboardContext';
import { postEmbedChartAndResults, postEmbedDashboard } from './api';

export const useEmbedDashboard = (projectUuid: string | undefined) => {
    return useQuery<Dashboard & InteractivityOptions, ApiError>({
        queryKey: ['embed-dashboard'],
        queryFn: () => postEmbedDashboard(projectUuid!),
        enabled: !!projectUuid,
        retry: false,
    });
};

export const useEmbedChartAndResults = (
    projectUuid: string,
    tileUuid: string,
) => {
    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const chartSort = useDashboardContext((c) => c.chartSort);
    const dashboardSorts: SortField[] | undefined = chartSort[tileUuid];
    return useQuery<ApiChartAndResults, ApiError>({
        queryKey: [
            'embed-chart-and-results',
            projectUuid,
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
            dashboardSorts,
        ],
        queryFn: async () =>
            postEmbedChartAndResults(
                projectUuid,
                tileUuid,
                dashboardFilters,
                dateZoomGranularity,
                dashboardSorts,
            ),
        enabled: !!projectUuid,
        retry: false,
    });
};
