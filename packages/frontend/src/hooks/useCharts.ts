import type { ApiError, SpaceQuery } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const getChartsInProject = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) => {
    return lightdashApi<SpaceQuery[]>({
        url: `/projects/${projectUuid}/charts`,
        method: 'GET',
        body: undefined,
    });
};

export const useCharts = (
    projectUuid: string | undefined,
    useQueryFetchOptions?: UseQueryOptions<SpaceQuery[], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<SpaceQuery[], ApiError>({
        queryKey: ['project', projectUuid, 'charts'],
        queryFn: () => getChartsInProject(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        ...useQueryFetchOptions,
    });
};
