import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { uniqueAliasFromName } from '../utils/aliasFromName';
import { getAppExternalConnections } from './useAppExternalConnections';

type LinkParams = {
    projectUuid: string;
    appUuid: string;
    appName: string;
    externalConnectionUuid: string;
    connectionName: string;
};

const linkAppExternalConnection = async (
    params: LinkParams,
): Promise<undefined> => {
    const { projectUuid, appUuid, externalConnectionUuid, connectionName } =
        params;
    const existingLinks = await getAppExternalConnections(projectUuid, appUuid);
    const alias = uniqueAliasFromName(
        connectionName,
        existingLinks.map((link) => link.alias),
    );

    return lightdashApi<undefined>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`,
        method: 'POST',
        body: JSON.stringify({ externalConnectionUuid, alias }),
    });
};

export const useLinkAppExternalConnection = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, LinkParams>({
        mutationFn: linkAppExternalConnection,
        onSuccess: (_data, { appName, connectionName }) => {
            showToastSuccess({
                title: `Linked ${connectionName}`,
                subtitle: `${appName} can use this connection immediately. No new version was created.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to link connection',
                apiError: error,
            });
        },
        onSettled: async (_data, _error, { projectUuid, appUuid }) => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: [
                        'app-external-connections',
                        projectUuid,
                        appUuid,
                    ],
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
