import {
    type ApiError,
    type ApiResultsCacheProjectSettingsResponse,
    type UpdateResultsCacheProjectSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const queryKey = (projectUuid: string) => [
    'results_cache_settings',
    projectUuid,
];

const getResultsCacheSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiResultsCacheProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config`,
        method: 'GET',
        body: undefined,
    });

export const useResultsCacheSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiResultsCacheProjectSettingsResponse['results'],
        ApiError
    >({
        queryKey: queryKey(projectUuid),
        queryFn: () => getResultsCacheSettings(lightdashApi, projectUuid),
        enabled: !!projectUuid,
    });
};

const updateResultsCacheSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: UpdateResultsCacheProjectSettings,
) =>
    lightdashApi<ApiResultsCacheProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateResultsCacheSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiResultsCacheProjectSettingsResponse['results'],
        ApiError,
        UpdateResultsCacheProjectSettings
    >((data) => updateResultsCacheSettings(lightdashApi, projectUuid, data), {
        mutationKey: ['results_cache_settings_update', projectUuid],
        onSuccess: async () => {
            showToastSuccess({
                title: 'Cache duration updated',
            });
            await queryClient.invalidateQueries(queryKey(projectUuid));
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update cache duration',
                apiError: error,
            });
        },
    });
};
