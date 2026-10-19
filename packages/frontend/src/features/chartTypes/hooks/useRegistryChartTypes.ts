import {
    type ApiError,
    type ApiListRegistryChartTypesResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { captureChartTypeError } from '../utils/captureChartTypeError';

const getRegistryChartTypes = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) => {
    try {
        return await lightdashApi<ApiListRegistryChartTypesResponse['results']>(
            {
                method: 'GET',
                url: `/ee/projects/${projectUuid}/apps/registry/charts`,
                body: undefined,
            },
        );
    } catch (e) {
        captureChartTypeError('chartTypeLibraryLoad', e, { projectUuid });
        throw e;
    }
};

// Installable chart types from the configured chart registry, merged with
// this project's install state. Only fetched once the registry feature flag
// resolves enabled, so `enabled` gates the query rather than the caller
// conditionally invoking the hook.
export const useRegistryChartTypes = (
    projectUuid: string | undefined,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiListRegistryChartTypesResponse['results'], ApiError>({
        queryKey: ['registry-chart-types', projectUuid],
        queryFn: () => getRegistryChartTypes(lightdashApi, projectUuid!),
        enabled: !!projectUuid && enabled,
        staleTime: 5 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
    });
};
