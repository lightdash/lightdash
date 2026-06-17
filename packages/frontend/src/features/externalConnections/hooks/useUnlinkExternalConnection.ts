import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type UnlinkParams = {
    projectUuid: string;
    appUuid: string;
    alias: string;
};

const unlinkExternalConnection = async ({
    projectUuid,
    appUuid,
    alias,
}: UnlinkParams) =>
    lightdashApi<undefined>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections/${encodeURIComponent(
            alias,
        )}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUnlinkExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, UnlinkParams>({
        mutationFn: unlinkExternalConnection,
        onSuccess: async (_data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [
                    'app-external-connections',
                    variables.projectUuid,
                    variables.appUuid,
                ],
            });
            showToastSuccess({ title: 'Connection unlinked' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to unlink connection',
                apiError: error,
            });
        },
    });
};
