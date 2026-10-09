import {
    type ApiError,
    type ApiImpersonationOrganizationSettingsResponse,
    type UpdateImpersonationOrganizationSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import useApp from '../../providers/App/useApp';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';
import { LAST_USER_KEY } from '../useActiveProject';

const startImpersonation = async (
    lightdashApi: LightdashApi,
    targetUserUuid: string,
) =>
    lightdashApi<null>({
        url: `/impersonation/start`,
        method: 'POST',
        body: JSON.stringify({ targetUserUuid }),
    });

const stopImpersonation = async (lightdashApi: LightdashApi) =>
    lightdashApi<null>({
        url: `/impersonation/stop`,
        method: 'POST',
        body: undefined,
    });

const getImpersonationSettings = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiImpersonationOrganizationSettingsResponse['results']>({
        url: `/org/impersonation`,
        method: 'GET',
        body: undefined,
    });

export const useImpersonationSettings = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiImpersonationOrganizationSettingsResponse['results'],
        ApiError
    >({
        queryKey: ['impersonation_settings'],
        queryFn: () => getImpersonationSettings(lightdashApi),
    });
};

const updateImpersonationSettings = async (
    lightdashApi: LightdashApi,
    data: UpdateImpersonationOrganizationSettings,
) =>
    lightdashApi<ApiImpersonationOrganizationSettingsResponse['results']>({
        url: `/org/impersonation`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateImpersonationSettings = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiImpersonationOrganizationSettingsResponse['results'],
        ApiError,
        UpdateImpersonationOrganizationSettings
    >(
        (data: UpdateImpersonationOrganizationSettings) =>
            updateImpersonationSettings(lightdashApi, data),
        {
            mutationKey: ['impersonation_settings_update'],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Impersonation settings updated',
                });
                await queryClient.invalidateQueries(['impersonation_settings']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update impersonation settings',
                    apiError: error,
                });
            },
        },
    );
};

export const useImpersonation = () => {
    const { user } = useApp();
    const impersonation = user.data?.impersonation ?? null;

    return {
        isImpersonating: impersonation !== null,
        impersonation,
    };
};

export const useStartImpersonation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(
        (targetUserUuid: string) =>
            startImpersonation(lightdashApi, targetUserUuid),
        {
            mutationKey: ['impersonation_start'],
            onSuccess: async (_data, targetUserUuid) => {
                localStorage.setItem(LAST_USER_KEY, targetUserUuid);
                await queryClient.invalidateQueries(['user']);
                window.location.reload();
            },
        },
    );
};

export const useStopImpersonation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();

    return useMutation<null, ApiError>(() => stopImpersonation(lightdashApi), {
        mutationKey: ['impersonation_stop'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            window.location.reload();
        },
    });
};
