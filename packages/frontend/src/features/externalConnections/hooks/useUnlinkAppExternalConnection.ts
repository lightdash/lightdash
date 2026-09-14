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
    name: string;
} & ({ alias: string } | { aliases: string[] });

const getAliases = (params: UnlinkParams) =>
    'aliases' in params ? params.aliases : [params.alias];

const unlinkAppExternalConnection = async (
    params: UnlinkParams,
): Promise<undefined> => {
    const { projectUuid, appUuid } = params;
    await Promise.all(
        getAliases(params).map((alias) =>
            lightdashApi<undefined>({
                url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections/${encodeURIComponent(
                    alias,
                )}`,
                method: 'DELETE',
                body: undefined,
            }),
        ),
    );
    return undefined;
};

const linksQueryKey = (projectUuid: string, appUuid: string) => [
    'app-external-connections',
    projectUuid,
    appUuid,
];

/** Unlinks optimistically and rolls back on failure. The app keeps calling
 *  removed aliases until it is rebuilt, so the toast points at the composer. */
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
        onMutate: async (params) => {
            const { projectUuid, appUuid } = params;
            const aliases = getAliases(params);
            const queryKey = linksQueryKey(projectUuid, appUuid);
            await queryClient.cancelQueries({ queryKey });
            const previousLinks =
                queryClient.getQueryData<AppExternalConnectionLinked[]>(
                    queryKey,
                );
            queryClient.setQueryData<AppExternalConnectionLinked[]>(
                queryKey,
                (links) =>
                    links?.filter((link) => !aliases.includes(link.alias)),
            );
            return { previousLinks };
        },
        onSuccess: (_data, { name }) => {
            showToastInfo({
                title: `Unlinked ${name}`,
                subtitle:
                    'The generated code still calls it until you ask for a change.',
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
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: linksQueryKey(projectUuid, appUuid),
                }),
                queryClient.invalidateQueries({
                    queryKey: ['external-connection-linked-apps', projectUuid],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['external-connections', projectUuid],
                }),
            ]);
        },
    });
};
