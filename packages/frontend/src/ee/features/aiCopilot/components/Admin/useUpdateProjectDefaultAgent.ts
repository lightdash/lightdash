import {
    type ApiError,
    type ApiSuccessEmpty,
    type UpdateProjectDefaultAgent,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
import useToaster from '../../../../../hooks/toaster/useToaster';

const updateProjectDefaultAgent = (
    projectUuid: string,
    data: UpdateProjectDefaultAgent,
) =>
    lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/defaultAiAgent`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateProjectDefaultAgent = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        UpdateProjectDefaultAgent
    >({
        mutationFn: (data) => updateProjectDefaultAgent(projectUuid, data),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['userAgentPreferencesWithDefaults', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['project', projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update project default agent',
                apiError: error,
            });
        },
    });
};
