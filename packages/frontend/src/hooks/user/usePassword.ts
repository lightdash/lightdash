import { type ApiError } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

const getUserHasPassword = async (
    lightdashApi: LightdashApi,
): Promise<boolean> =>
    lightdashApi<boolean>({
        url: `/user/password`,
        method: 'GET',
        body: undefined,
    });

export const useUserHasPassword = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<boolean, ApiError>({
        queryKey: ['user-has-password'],
        queryFn: () => getUserHasPassword(lightdashApi),
    });
};

type UserPasswordUpdate = {
    password?: string;
    newPassword: string;
};

const updateUserPasswordQuery = (
    lightdashApi: LightdashApi,
    data: UserPasswordUpdate,
) =>
    lightdashApi<null>({
        url: `/user/password`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

export const useUserUpdatePasswordMutation = (
    useMutationOptions?: UseMutationOptions<null, ApiError, UserPasswordUpdate>,
) => {
    const lightdashApi = useLightdashApi();
    return useMutation<null, ApiError, UserPasswordUpdate>(
        (data: UserPasswordUpdate) =>
            updateUserPasswordQuery(lightdashApi, data),
        {
            mutationKey: ['user_password_update'],
            ...useMutationOptions,
        },
    );
};
