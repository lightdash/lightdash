import {
    type ApiError,
    type CompleteUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

const completeUserQuery = async (data: CompleteUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user/me/complete`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

type UserCompleteMutationOptions = {
    onSuccess?: () => void;
};

export const useUserCompleteMutation = (
    options?: UserCompleteMutationOptions,
) => {
    const queryClient = useQueryClient();
    return useMutation<LightdashUser, ApiError, CompleteUserArgs>(
        completeUserQuery,
        {
            mutationKey: ['user_complete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['user']);
                await queryClient.invalidateQueries(['organization']);
                options?.onSuccess?.();
            },
        },
    );
};
