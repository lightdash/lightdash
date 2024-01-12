import { ApiError } from '@lightdash/common';
import {
    useMutation,
    UseMutationOptions,
    useQuery,
} from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const getUserHasPassword = async (): Promise<boolean> =>
    lightdashApi<boolean>({
        url: `/user/password`,
        method: 'GET',
        body: undefined,
    });

export const useUserHasPassword = () =>
    useQuery<boolean, ApiError>({
        queryKey: ['user-has-password'],
        queryFn: getUserHasPassword,
    });

type UserPasswordUpdate = {
    password?: string;
    newPassword: string;
};

const updateUserPasswordQuery = (data: UserPasswordUpdate) =>
    lightdashApi<null>({
        url: `/user/password`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useUserUpdatePasswordMutation = (
    useMutationOptions?: UseMutationOptions<null, ApiError, UserPasswordUpdate>,
) => {
    return useMutation<null, ApiError, UserPasswordUpdate>(
        updateUserPasswordQuery,
        {
            mutationKey: ['user_password_update'],
            ...useMutationOptions,
        },
    );
};
