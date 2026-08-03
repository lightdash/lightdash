import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { refetchFeatureFlags } from '../useServerOrClientFeatureFlag';

const joinOrgQuery = async (orgUuid: string) =>
    lightdashApi<null>({
        url: `/user/me/joinOrganization/${orgUuid}`,
        method: 'POST',
        body: undefined,
    });

export const useJoinOrganizationMutation = () => {
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, string>(joinOrgQuery, {
        mutationKey: ['organization_create'],
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries(['user']),
                queryClient.invalidateQueries(['organization']),
                refetchFeatureFlags(queryClient),
            ]);
        },
    });
};
