import {
    type ApiError,
    type ApiPreviewExpirationProjectSettingsResponse,
    type UpdatePreviewExpirationProjectSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const queryKey = (projectUuid: string) => [
    'preview_expiration_settings',
    projectUuid,
];

const getPreviewExpirationSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiPreviewExpirationProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/previews-config`,
        method: 'GET',
        body: undefined,
    });

export const usePreviewExpirationSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiPreviewExpirationProjectSettingsResponse['results'],
        ApiError
    >({
        queryKey: queryKey(projectUuid),
        queryFn: () => getPreviewExpirationSettings(lightdashApi, projectUuid),
        enabled: !!projectUuid,
    });
};

const updatePreviewExpirationSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: UpdatePreviewExpirationProjectSettings,
) =>
    lightdashApi<ApiPreviewExpirationProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/previews-config`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdatePreviewExpirationSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiPreviewExpirationProjectSettingsResponse['results'],
        ApiError,
        UpdatePreviewExpirationProjectSettings
    >(
        (data) =>
            updatePreviewExpirationSettings(lightdashApi, projectUuid, data),
        {
            mutationKey: ['preview_expiration_settings_update', projectUuid],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Preview expiration settings updated',
                });
                await queryClient.invalidateQueries(queryKey(projectUuid));
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update preview expiration settings',
                    apiError: error,
                });
            },
        },
    );
};
