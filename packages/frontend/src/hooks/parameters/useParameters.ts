import {
    type ApiError,
    type ApiGetProjectParametersResults,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getParameters = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    parameterReferences: string[] | undefined,
): Promise<ApiGetProjectParametersResults> => {
    if (parameterReferences && parameterReferences.length === 0) {
        return {};
    }
    return lightdashApi<ApiGetProjectParametersResults>({
        url: parameterReferences
            ? `/projects/${projectUuid}/parameters?${parameterReferences
                  .map((n) => `names=${encodeURIComponent(n)}`)
                  .join('&')}`
            : `/projects/${projectUuid}/parameters`,
        method: 'GET',
        body: undefined,
        version: 'v2',
    });
};

export const useParameters = (
    projectUuid: string | undefined,
    parameterReferences: string[] | undefined,
    useQueryOptions?: UseQueryOptions<ApiGetProjectParametersResults, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGetProjectParametersResults, ApiError>({
        queryKey: ['parameters', projectUuid, parameterReferences],
        queryFn: () =>
            getParameters(lightdashApi, projectUuid!, parameterReferences),
        enabled: !!projectUuid,
        keepPreviousData: true,
        ...useQueryOptions,
    });
};
