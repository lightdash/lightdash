import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type DeleteAppParams = {
    projectUuid: string;
    appUuid: string;
};

const deleteApp = async ({
    projectUuid,
    appUuid,
}: DeleteAppParams): Promise<void> => {
    await lightdashApi<undefined>({
        method: 'DELETE',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}`,
    });
};

export const useDeleteApp = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<void, ApiError, DeleteAppParams>({
        mutationFn: deleteApp,
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            void queryClient.invalidateQueries({
                queryKey: ['app', variables.projectUuid, variables.appUuid],
            });
            showToastSuccess({ title: 'Data app deleted' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete app',
                apiError: error,
            });
        },
    });
};
