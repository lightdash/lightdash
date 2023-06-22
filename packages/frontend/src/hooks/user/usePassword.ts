import { ApiError } from '@lightdash/common';
import { useCallback } from 'react';
import { useMutation, useQuery } from 'react-query';
import { lightdashApi } from '../../api';
import { useErrorLogs } from '../../providers/ErrorLogsProvider';

const getUserHasPassword = async (): Promise<boolean> =>
    lightdashApi<boolean>({
        url: `/user/password`,
        method: 'GET',
        body: undefined,
    });

export const useUserHasPassword = () =>
    useQuery<boolean, ApiError>({
        queryKey: 'user-has-password',
        queryFn: getUserHasPassword,
    });

const updateUserPasswordQuery = async (data: {
    password: string;
    newPassword: string;
}) =>
    lightdashApi<undefined>({
        url: `/user/password`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useUserUpdatePasswordMutation = () => {
    const { appendError } = useErrorLogs();

    return useMutation<
        undefined,
        ApiError,
        { password: string; newPassword: string }
    >(updateUserPasswordQuery, {
        mutationKey: ['user_password_update'],
        onSuccess: () => {
            window.location.href = '/login';
        },
        onError: useCallback(
            (error) => {
                const [title, ...rest] = error.error.message.split('\n');
                appendError({
                    title,
                    body: rest.join('\n'),
                });
            },
            [appendError],
        ),
    });
};
