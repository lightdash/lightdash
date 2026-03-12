import {
    type ApiError,
    type ApiImpersonationOrganizationSettingsResponse,
    type UpdateImpersonationOrganizationSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useApp from '../../providers/App/useApp';
import useToaster from '../toaster/useToaster';

const startImpersonation = async (targetUserUuid: string) =>
    lightdashApi<null>({
        url: `/impersonation/start`,
        method: 'POST',
        body: JSON.stringify({ targetUserUuid }),
    });

const stopImpersonation = async () =>
    lightdashApi<null>({
        url: `/impersonation/stop`,
        method: 'POST',
        body: undefined,
    });

const getImpersonationSettings = async () =>
    lightdashApi<ApiImpersonationOrganizationSettingsResponse['results']>({
        url: `/org/impersonation`,
        method: 'GET',
        body: undefined,
    });

export const useImpersonationSettings = () => {
    return useQuery<
        ApiImpersonationOrganizationSettingsResponse['results'],
        ApiError
    >({
        queryKey: ['impersonation_settings'],
        queryFn: getImpersonationSettings,
    });
};

const updateImpersonationSettings = async (
    data: UpdateImpersonationOrganizationSettings,
) =>
    lightdashApi<ApiImpersonationOrganizationSettingsResponse['results']>({
        url: `/org/impersonation`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateImpersonationSettings = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiImpersonationOrganizationSettingsResponse['results'],
        ApiError,
        UpdateImpersonationOrganizationSettings
    >(updateImpersonationSettings, {
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
    });
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
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(startImpersonation, {
        mutationKey: ['impersonation_start'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            window.location.reload();
        },
    });
};

export const useStopImpersonation = () => {
    const queryClient = useQueryClient();

    return useMutation<null, ApiError>(stopImpersonation, {
        mutationKey: ['impersonation_stop'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user']);
            window.location.reload();
        },
    });
};
