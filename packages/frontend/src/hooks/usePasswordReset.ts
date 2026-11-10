import {
    type ApiError,
    type CreatePasswordResetLink,
    type PasswordReset,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const getPasswordResetLinkQuery = async (
    lightdashApi: LightdashApi,
    code: string,
): Promise<null> =>
    lightdashApi<null>({
        url: `/password-reset/${code}`,
        method: 'GET',
        body: undefined,
    });

const sendPasswordResetLinkQuery = async (
    lightdashApi: LightdashApi,
    data: CreatePasswordResetLink,
): Promise<null> =>
    lightdashApi<null>({
        url: `/password-reset`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const resetPasswordQuery = async (
    lightdashApi: LightdashApi,
    data: PasswordReset,
): Promise<null> =>
    lightdashApi<null>({
        url: `/user/password/reset`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

export const usePasswordResetLink = (code: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<null, ApiError>({
        queryKey: ['password_reset_link'],
        queryFn: () => getPasswordResetLinkQuery(lightdashApi, code!),
        enabled: code !== undefined,
    });
};

export const usePasswordResetLinkMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, CreatePasswordResetLink>(
        (data: CreatePasswordResetLink) =>
            sendPasswordResetLinkQuery(lightdashApi, data),
        {
            mutationKey: ['send_password_reset_email'],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Password recovery email sent successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to send password recovery email`,
                    apiError: error,
                });
            },
        },
    );
};

export const usePasswordResetMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, PasswordReset>(
        (data: PasswordReset) => resetPasswordQuery(lightdashApi, data),
        {
            mutationKey: ['reset_password'],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Password updated successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to reset password`,
                    apiError: error,
                });
            },
        },
    );
};
