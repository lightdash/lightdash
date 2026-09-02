import { type ApiError, type DetailedViewStatistics } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getChartViewStats = async (chartUuid: string) => {
    return lightdashApi<DetailedViewStatistics>({
        url: `/saved/${chartUuid}/views`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartViewStats = (
    chartUuid: string | undefined,
    queryOptions?: UseQueryOptions<DetailedViewStatistics, ApiError>,
) => {
    return useQuery<DetailedViewStatistics, ApiError>(
        ['chart-views', chartUuid],
        () => getChartViewStats(chartUuid || ''),
        {
            enabled: !!chartUuid,
            staleTime: 5 * 60 * 1000,
            ...queryOptions,
        },
    );
};
