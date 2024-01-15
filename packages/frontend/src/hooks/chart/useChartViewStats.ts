import { ApiError, ViewStatistics } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getChartViewStats = async (chartUuid: string) => {
    return lightdashApi<ViewStatistics>({
        url: `/saved/${chartUuid}/views`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartViewStats = (
    chartUuid: string | undefined,
    queryOptions?: UseQueryOptions<ViewStatistics, ApiError>,
) => {
    return useQuery<ViewStatistics, ApiError>(
        ['chart-views', chartUuid],
        () => getChartViewStats(chartUuid || ''),
        {
            enabled: !!chartUuid,
            ...queryOptions,
        },
    );
};
