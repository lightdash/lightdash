import { type ApiError } from '@lightdash/common'; // pragma: allowlist secret (product-name false positive)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret (product-name false positive)
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateAppConnectionQueries } from './invalidateAppConnectionQueries';

type UnlinkParams = {
    projectUuid: string;
    appUuid: string;
    alias: string;
};

const unlinkAppExternalConnection = async ({
    projectUuid,
    appUuid,
    alias,
}: UnlinkParams) =>
    api<undefined>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections/${encodeURIComponent(alias)}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUnlinkAppExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, UnlinkParams>({
        mutationFn: unlinkAppExternalConnection,
        onSuccess: async (_data, variables) => {
            await invalidateAppConnectionQueries(
                queryClient,
                variables.projectUuid,
                variables.appUuid,
            );
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
