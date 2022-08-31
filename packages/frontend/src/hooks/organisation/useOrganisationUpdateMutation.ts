import { ApiError, Organisation } from '@lightdash/common';
import { useMutation, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const updateOrgQuery = async (data: Organisation) =>
    lightdashApi<undefined>({
        url: `/org`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganisationUpdateMutation = () => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, Organisation>(updateOrgQuery, {
        mutationKey: ['organisation_update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['organisation']);
            showToastSuccess({
                title: 'Success! Organisation was updated',
            });
        },
        onError: (error) => {
            showToastError({
                title: 'Failed to update organisation',
                subtitle: error.error.message,
            });
        },
    });
};
