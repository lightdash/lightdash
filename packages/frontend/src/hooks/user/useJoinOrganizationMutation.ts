import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { refetchFeatureFlags } from '../useServerOrClientFeatureFlag';

const joinOrgQuery = async (lightdashApi: LightdashApi, orgUuid: string) =>
    lightdashApi<null>({
        url: `/user/me/joinOrganization/${orgUuid}`,
        method: 'POST',
        body: undefined,
    });

export const useJoinOrganizationMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, string>(
        (orgUuid: string) => joinOrgQuery(lightdashApi, orgUuid),
        {
            mutationKey: ['organization_create'],
            onSuccess: async () => {
                await Promise.all([
                    queryClient.invalidateQueries(['user']),
                    queryClient.invalidateQueries(['organization']),
                    refetchFeatureFlags(queryClient),
                ]);
            },
        },
    );
};
