import { type ApiError, type ApiExploresResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useQueryError from './useQueryError';

const getExplores = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    filtered?: boolean,
    includePreAggregates?: boolean,
) =>
    lightdashApi<ApiExploresResults>({
        url: `/projects/${projectUuid}/explores?filtered=${
            filtered ? 'true' : 'false'
        }&includePreAggregates=${includePreAggregates ? 'true' : 'false'}`,
        method: 'GET',
        body: undefined,
    });

export const useExplores = (
    projectUuid: string | undefined,
    filtered?: boolean,
    includePreAggregates?: boolean,
    useQueryFetchOptions?: UseQueryOptions<ApiExploresResults, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();
    const queryKey = [
        'tables',
        projectUuid,
        filtered ? 'filtered' : 'all',
        includePreAggregates ? 'with-pre-aggregates' : 'without-pre-aggregates',
    ];
    return useQuery<ApiExploresResults, ApiError>({
        queryKey,
        queryFn: () =>
            getExplores(
                lightdashApi,
                projectUuid!,
                filtered,
                includePreAggregates,
            ),
        onError: (result) => setErrorResponse(result),
        retry: false,
        enabled: !!projectUuid,
        ...useQueryFetchOptions,
    });
};
