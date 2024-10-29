import { type ApiError, type ChartSummary } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getChartSummariesInProject = async (projectUuid: string) => {
    return lightdashApi<ChartSummary[]>({
        url: `/projects/${projectUuid}/chart-summaries?excludeChartsSavedInDashboard=true`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummaries = (
    projectUuid: string,
    useQueryFetchOptions?: UseQueryOptions<ChartSummary[], ApiError>,
) => {
    return useQuery<ChartSummary[], ApiError>({
        queryKey: ['project', projectUuid, 'chart-summaries'],
        queryFn: () => getChartSummariesInProject(projectUuid),
        ...useQueryFetchOptions,
    });
};
