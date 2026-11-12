import {
    type ApiConnectorType,
    type ApiError,
    type ExplorePrefixCheck,
    type ExternalConnection,
    type ReattachableLiveSource,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** Whether a new live data source can use an explore prefix. */
export const useExplorePrefixCheck = ({
    projectUuid,
    connector,
    prefix,
    enabled,
}: {
    projectUuid: string;
    connector: ApiConnectorType;
    prefix: string;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExplorePrefixCheck, ApiError>({
        queryKey: [
            'live-source-explore-prefix',
            projectUuid,
            connector,
            prefix,
        ],
        enabled,
        // Another source can take the prefix at any moment
        staleTime: 0,
        queryFn: () =>
            lightdashApi<ExplorePrefixCheck>({
                url: `/ee/projects/${projectUuid}/live-sources/explore-prefix?${new URLSearchParams({ connector, prefix }).toString()}`,
                method: 'GET',
                body: undefined,
            }),
    });
};

type ReattachParams = {
    projectUuid: string;
    connectionUuid: string;
};

/** Deleted live data sources this new source can take over the charts of. */
export const useReattachableLiveSources = ({
    projectUuid,
    connectionUuid,
}: ReattachParams) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ReattachableLiveSource[], ApiError>({
        queryKey: ['live-source-reattach', projectUuid, connectionUuid],
        queryFn: () =>
            lightdashApi<ReattachableLiveSource[]>({
                url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/reattach-candidates`,
                method: 'GET',
                body: undefined,
            }),
    });
};

export const useReattachLiveSource = ({
    projectUuid,
    connectionUuid,
}: ReattachParams) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError, string>({
        mutationFn: (deletedConnectionUuid) =>
            lightdashApi<ExternalConnection>({
                url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/reattach`,
                method: 'POST',
                body: JSON.stringify({ deletedConnectionUuid }),
            }),
        onSuccess: async () => {
            await Promise.all(
                [
                    ['tables'],
                    ['external-connections', projectUuid],
                    ['live-source-fields', projectUuid, connectionUuid],
                    ['live-source-reattach', projectUuid, connectionUuid],
                ].map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey }),
                ),
            );
            showToastSuccess({ title: 'Live data source reattached' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to reattach live data source',
                apiError: error,
            });
        },
    });
};
