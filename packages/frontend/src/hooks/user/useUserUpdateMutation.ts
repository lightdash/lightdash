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
import { lightdashApi } from '../../api';

const updateUserQuery = async (data: Partial<UpdateUserArgs>) =>
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
    const queryClient = useQueryClient();
    return useMutation<LightdashUser, ApiError, Partial<UpdateUserArgs>>({
        mutationKey: ['user_update'],
        mutationFn: updateUserQuery,
        ...useMutationOptions,
        onSuccess: async (data, variables, context) => {
            await queryClient.refetchQueries(['user']);
            await queryClient.refetchQueries(['email_status']);

            useMutationOptions?.onSuccess?.(data, variables, context);
        },
    });
};
