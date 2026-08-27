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

const linksQueryKey = (projectUuid: string, appUuid: string) => [
    'app-external-connections',
    projectUuid,
    appUuid,
];

/** Unlinks optimistically and rolls back on failure. The app keeps calling
 *  the alias until it is rebuilt, so the toast points at the composer. */
export const useUnlinkAppExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastInfo, showToastApiError } = useToaster();
    return useMutation<
        undefined,
        ApiError,
        UnlinkParams,
        { previousLinks: AppExternalConnectionLinked[] | undefined }
    >({
        mutationFn: unlinkAppExternalConnection,
        onMutate: async ({ projectUuid, appUuid, alias }) => {
            const queryKey = linksQueryKey(projectUuid, appUuid);
            await queryClient.cancelQueries({ queryKey });
            const previousLinks =
                queryClient.getQueryData<AppExternalConnectionLinked[]>(
                    queryKey,
                );
            queryClient.setQueryData<AppExternalConnectionLinked[]>(
                queryKey,
                (links) => links?.filter((link) => link.alias !== alias),
            );
            return { previousLinks };
        },
        onSuccess: (_data, { name }) => {
            showToastInfo({
                title: `Unlinked ${name}`,
                subtitle:
                    'The chart type still calls it until you ask for a change.',
            });
        },
        onError: ({ error }, { projectUuid, appUuid }, context) => {
            queryClient.setQueryData(
                linksQueryKey(projectUuid, appUuid),
                context?.previousLinks,
            );
            showToastApiError({
                title: 'Failed to unlink connection',
                apiError: error,
            });
        },
        onSettled: async (_data, _error, { projectUuid, appUuid }) => {
            await queryClient.invalidateQueries({
                queryKey: linksQueryKey(projectUuid, appUuid),
            });
        },
    });
};
