import { type ApiError, type UpdateOrganization } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateOrgQuery = async (data: UpdateOrganization) =>
    lightdashApi<null>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganizationUpdateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateOrganization>(updateOrgQuery, {
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
    });
};
