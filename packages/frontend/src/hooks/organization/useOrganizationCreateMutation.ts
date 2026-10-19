import { type ApiError, type CreateOrganization } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { refetchFeatureFlags } from '../useServerOrClientFeatureFlag';

const createOrgQuery = async (
    lightdashApi: LightdashApi,
    data: CreateOrganization,
) =>
    lightdashApi<null>({
        url: `/org`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useOrganizationCreateMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, CreateOrganization>(
        (data: CreateOrganization) => createOrgQuery(lightdashApi, data),
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
