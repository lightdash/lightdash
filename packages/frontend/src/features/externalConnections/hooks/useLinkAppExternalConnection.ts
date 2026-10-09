import { type ApiError } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
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
    lightdashApi: LightdashApi,
    params: LinkParams,
): Promise<undefined> => {
    const { projectUuid, appUuid, externalConnectionUuid, connectionName } =
        params;
    const existingLinks = await getAppExternalConnections(
        lightdashApi,
        projectUuid,
        appUuid,
    );
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, LinkParams>({
        mutationFn: (params: LinkParams) =>
            linkAppExternalConnection(lightdashApi, params),
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
