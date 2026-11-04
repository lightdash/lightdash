import { type ApiError, type UpdateMetadata } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const updateProject = async (
    lightdashApi: LightdashApi,
    id: string,
    data: UpdateMetadata,
) =>
    lightdashApi<null>({
        url: `/projects/${id}/metadata`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateMutation = (id: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, UpdateMetadata>(
        (data) => updateProject(lightdashApi, id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', id]);
                showToastSuccess({
                    title: `Project updated`,
                    subtitle: `Project upstream project updated successfully`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update project`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
