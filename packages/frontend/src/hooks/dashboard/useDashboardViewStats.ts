import { type ApiError, type DetailedViewStatistics } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getDashboardViewStats = async (
    lightdashApi: LightdashApi,
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<DetailedViewStatistics, ApiError>(
        ['dashboard-view-stats', dashboardUuid],
        () =>
            getDashboardViewStats(
                lightdashApi,
                dashboardUuid ?? '',
                projectUuid ?? '',
            ),
        {
            enabled: !!dashboardUuid && !!projectUuid,
            staleTime: 5 * 60 * 1000,
            ...queryOptions,
        },
    );
};
