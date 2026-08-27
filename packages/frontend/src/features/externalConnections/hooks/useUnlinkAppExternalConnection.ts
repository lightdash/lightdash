import {
    type ApiError,
    type AppExternalConnectionLinked,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

type UnlinkParams = {
    projectUuid: string;
    appUuid: string;
    alias: string;
    name: string;
};

const unlinkAppExternalConnection = async ({
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

/** Unlinks optimistically: the app keeps calling the alias until it is
 *  rebuilt, so the toast points at the composer. */
export const useUnlinkAppExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastInfo, showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, UnlinkParams>({
        mutationFn: unlinkAppExternalConnection,
        onMutate: async ({ projectUuid, appUuid, alias }) => {
            const queryKey = ['app-external-connections', projectUuid, appUuid];
            await queryClient.cancelQueries({ queryKey });
            queryClient.setQueryData<AppExternalConnectionLinked[]>(
                queryKey,
                (links) => links?.filter((link) => link.alias !== alias),
            );
        },
        onSuccess: (_data, { name }) => {
            showToastInfo({
                title: `Unlinked ${name}`,
                subtitle:
                    'The chart type still calls it until you ask for a change.',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to unlink connection',
                apiError: error,
            });
        },
        onSettled: async (_data, _error, { projectUuid, appUuid }) => {
            await queryClient.invalidateQueries({
                queryKey: ['app-external-connections', projectUuid, appUuid],
            });
        },
    });
};
