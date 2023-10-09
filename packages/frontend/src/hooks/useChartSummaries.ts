import { ApiError, ChartSummary } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';
import { UseQueryFetchOptions } from '../types/UseQuery';

const getChartSummariesInProject = async (projectUuid: string) => {
    return lightdashApi<ChartSummary[]>({
        url: `/projects/${projectUuid}/charts`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummaries = (
    projectUuid: string,
    useQueryFetchOptions?: UseQueryFetchOptions,
) => {
    return useQuery<ChartSummary[], ApiError>({
        queryKey: ['project', projectUuid, 'charts'],
        queryFn: () => getChartSummariesInProject(projectUuid),
        ...useQueryFetchOptions,
    });
};
