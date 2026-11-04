import {
    type ApiError,
    type CompleteUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';
import { type UserWithAbility } from './useUser';

const completeUserQuery = async (
    lightdashApi: LightdashApi,
    data: CompleteUserArgs,
) =>
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<LightdashUser, ApiError, CompleteUserArgs>(
        (data: CompleteUserArgs) => completeUserQuery(lightdashApi, data),
        {
            mutationKey: ['user_complete'],
            onSuccess: async (completedUser) => {
                queryClient.setQueryData<UserWithAbility>(
                    ['user'],
                    (currentUser) =>
                        currentUser
                            ? { ...currentUser, ...completedUser }
                            : currentUser,
                );
                await queryClient.invalidateQueries(['organization']);
                options?.onSuccess?.();
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to complete setup',
                    apiError: error,
                });
            },
        },
    );
};
