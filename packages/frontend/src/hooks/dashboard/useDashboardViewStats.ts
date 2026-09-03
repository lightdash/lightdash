import { type ApiError, type DetailedViewStatistics } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getDashboardViewStats = async (
    dashboardUuid: string,
    projectUuid: string,
) =>
    lightdashApi<DetailedViewStatistics>({
        url: `/dashboards/${dashboardUuid}/view-stats?projectUuid=${projectUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useDashboardViewStats = (
    dashboardUuid: string | undefined,
    projectUuid: string | undefined,
    queryOptions?: UseQueryOptions<DetailedViewStatistics, ApiError>,
) =>
    useQuery<DetailedViewStatistics, ApiError>(
        ['dashboard-view-stats', dashboardUuid],
        () => getDashboardViewStats(dashboardUuid ?? '', projectUuid ?? ''),
        {
            enabled: !!dashboardUuid && !!projectUuid,
            staleTime: 5 * 60 * 1000,
            ...queryOptions,
        },
    );
