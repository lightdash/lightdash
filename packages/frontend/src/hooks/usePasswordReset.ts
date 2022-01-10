import { ApiError, CreatePasswordResetLink, PasswordReset } from 'common';
import { useMutation, useQuery } from 'react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const getPasswordResetLinkQuery = async (code: string): Promise<undefined> =>
    lightdashApi<undefined>({
        url: `/password-reset/${code}`,
        method: 'GET',
        body: undefined,
    });

const sendPasswordResetLinkQuery = async (
    data: CreatePasswordResetLink,
): Promise<undefined> =>
    lightdashApi<undefined>({
        url: `/password-reset`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const resetPasswordQuery = async (data: PasswordReset): Promise<undefined> =>
    lightdashApi<undefined>({
        url: `/password-reset`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const usePasswordResetLink = (code: string) =>
    useQuery<undefined, ApiError>({
        queryKey: ['password_reset_link'],
        queryFn: () => getPasswordResetLinkQuery(code),
    });

export const usePasswordResetLinkMutation = () => {
    const { showToastError, showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, CreatePasswordResetLink>(
        sendPasswordResetLinkQuery,
        {
            mutationKey: ['send_password_reset_email'],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Password recovery email sent successfully',
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to send password recovery email`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const usePasswordResetMutation = () => {
    const history = useHistory();
    const { showToastError, showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, PasswordReset>(resetPasswordQuery, {
        mutationKey: ['reset_password'],
        onSuccess: async () => {
            showToastSuccess({
                title: 'Password updated successfully',
            });
            history.push('/login');
        },
        onError: (error) => {
            showToastError({
                title: `Failed to reset password`,
                subtitle: error.error.message,
            });
        },
    });
};
