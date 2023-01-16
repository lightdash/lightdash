import { ApiError } from '@lightdash/common';
import { useMutation } from 'react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteDashboard = async (id: string) =>
    lightdashApi<undefined>({
        url: `/org/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteOrganisationMutation = () => {
    const { showToastError } = useToaster();
    return useMutation<undefined, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            window.location.href = '/register';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete organisation`,
                subtitle: error.error.message,
            });
        },
    });
};
