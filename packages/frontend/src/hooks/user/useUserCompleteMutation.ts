import {
    ApiError,
    CompleteUserArgs,
    defineAbilityForOrganizationMember,
    LightdashUser,
} from '@lightdash/common';
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
            onSuccess: async (data) => {
                queryClient.setQueryData(['user'], {
                    ...data,
                    ability: defineAbilityForOrganizationMember(data),
                });
            },
        },
    );
};
