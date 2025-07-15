import { type ApiError, type ApiGetParametersResults } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getParameters = async (
    projectUuid: string,
): Promise<ApiGetParametersResults> => {
    const results: any = await lightdashApi({
        url: `/projects/${projectUuid}/parameters`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });

    return results || {};
};

export const useParameters = (
    projectUuid: string | undefined,
    useQueryOptions?: UseQueryOptions<ApiGetParametersResults, ApiError>,
) =>
    useQuery<ApiGetParametersResults, ApiError>({
        queryKey: ['parameters', projectUuid],
        queryFn: () => getParameters(projectUuid!),
        enabled: !!projectUuid,
        ...useQueryOptions,
    });
