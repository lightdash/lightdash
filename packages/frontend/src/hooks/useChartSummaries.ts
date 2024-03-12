import { type ApiError, type SpaceQuery } from '@lightdash/common';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getChartSummariesInProject = async (projectUuid: string) => {
    return lightdashApi<SpaceQuery[]>({
        url: `/projects/${projectUuid}/charts`,
        method: 'GET',
        body: undefined,
    });
};

export const useChartSummaries = (
    projectUuid: string,
    useQueryFetchOptions?: UseQueryOptions<SpaceQuery[], ApiError>,
) => {
    return useQuery<SpaceQuery[], ApiError>({
        queryKey: ['project', projectUuid, 'charts'],
        queryFn: () => getChartSummariesInProject(projectUuid),
        ...useQueryFetchOptions,
    });
};
