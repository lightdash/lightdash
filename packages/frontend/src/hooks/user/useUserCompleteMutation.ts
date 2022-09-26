import { ApiError, CompleteUserArgs, LightdashUser } from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';

const completeUserQuery = async (data: CompleteUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user/me/complete`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUserCompleteMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<LightdashUser, ApiError, CompleteUserArgs>(
        completeUserQuery,
        {
            mutationKey: ['user_complete'],
            onSuccess: async () => {
                await queryClient.invalidateQueries('user');
                await queryClient.invalidateQueries('organisation');
            },
        },
    );
};
