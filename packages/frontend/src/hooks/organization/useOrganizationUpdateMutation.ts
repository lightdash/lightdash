import { type ApiError, type UpdateOrganization } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const updateOrgQuery = async (
    lightdashApi: LightdashApi,
    data: UpdateOrganization,
) =>
    lightdashApi<null>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganizationUpdateMutation = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateOrganization>(
        (data: UpdateOrganization) => updateOrgQuery(lightdashApi, data),
        {
            mutationKey: ['organization_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['organization']);
                showToastSuccess({
                    title: 'Success! Organization was updated',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update organization',
                    apiError: error,
                });
            },
        },
    );
};
