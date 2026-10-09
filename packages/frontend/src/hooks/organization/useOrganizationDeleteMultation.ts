import { type ApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const deleteDashboard = async (lightdashApi: LightdashApi, id: string) =>
    lightdashApi<null>({
        url: `/org/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteOrganizationMutation = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (id: string) => deleteDashboard(lightdashApi, id),
        {
            onSuccess: async () => {
                window.location.href = '/register';
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete organization`,
                    apiError: error,
                });
            },
        },
    );
};
