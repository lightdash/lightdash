import { ApiError, ChartSummary } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getChartSummariesInProject = async (projectUuid: string) => {
    return lightdashApi<ChartSummary[]>({
        url: `/projects/${projectUuid}/charts`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummaries = (
    projectUuid: string,
    useQueryFetchOptions?: UseQueryOptions<ChartSummary[], ApiError>,
) => {
    return useQuery<ChartSummary[], ApiError>({
        queryKey: ['project', projectUuid, 'charts'],
        queryFn: () => getChartSummariesInProject(projectUuid),
        ...useQueryFetchOptions,
    });
};
