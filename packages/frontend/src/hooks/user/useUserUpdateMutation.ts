import {
    type ApiError,
    type LightdashUser,
    type UpdateUserArgs,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { type UserWithAbility } from './useUser';

const updateUserQuery = async (
    lightdashApi: LightdashApi,
    data: Partial<UpdateUserArgs>,
) =>
    lightdashApi<LightdashUser>({
        url: `/user/me`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUserUpdateMutation = (
    useMutationOptions?: UseMutationOptions<
        LightdashUser,
        ApiError,
        Partial<UpdateUserArgs>
    >,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<LightdashUser, ApiError, Partial<UpdateUserArgs>>({
        mutationKey: ['user_update'],
        mutationFn: (data: Partial<UpdateUserArgs>) =>
            updateUserQuery(lightdashApi, data),
        ...useMutationOptions,
        onSuccess: async (data, variables, context) => {
            // The PATCH response is fresh; a refetch can race a stale server-side session cache
            queryClient.setQueryData<UserWithAbility>(['user'], (previous) =>
                previous ? { ...previous, ...data } : previous,
            );
            await queryClient.refetchQueries(['email_status']);

            useMutationOptions?.onSuccess?.(data, variables, context);
        },
    });
};
