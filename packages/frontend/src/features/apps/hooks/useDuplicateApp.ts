import { type ApiDuplicateAppResponse, type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type DuplicateAppParams = {
    projectUuid: string;
    appUuid: string;
    name?: string;
};

type DuplicateAppResult = ApiDuplicateAppResponse['results'];

const duplicateApp = ({ projectUuid, appUuid, name }: DuplicateAppParams) =>
    lightdashApi<DuplicateAppResult>({
        method: 'POST',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/duplicate`,
        body: JSON.stringify(name ? { name } : {}),
    });

export const useDuplicateApp = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<DuplicateAppResult, ApiError, DuplicateAppParams>({
        mutationFn: duplicateApp,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['myApps'] });
            void queryClient.invalidateQueries({ queryKey: ['content'] });
            void queryClient.invalidateQueries({ queryKey: ['data-app-vizs'] });
            showToastSuccess({ title: 'Data app duplicated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to duplicate app',
                apiError: error,
            });
        },
    });
};
