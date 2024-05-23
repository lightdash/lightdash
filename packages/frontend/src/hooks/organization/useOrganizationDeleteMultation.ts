import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteDashboard = async (id: string) =>
    lightdashApi<null>({
        url: `/org/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteOrganizationMutation = () => {
    const { showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            window.location.href = '/register';
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete organization`,
                apiError: error,
            });
        },
    });
};
