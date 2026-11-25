import {
    type ApiError,
    type LiveSourceAccess,
    type LiveSourceAccessRule,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type LiveSourceParams = { projectUuid: string; connectionUuid: string };

const accessUrl = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/access`;

const accessQueryKey = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    ['live-source-access', projectUuid, connectionUuid] as const;

/** Who can query a live data source, with the attributes a rule can name. */
export const useLiveSourceAccess = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    return useQuery<LiveSourceAccess, ApiError>({
        queryKey: accessQueryKey(params),
        queryFn: () =>
            lightdashApi<LiveSourceAccess>({
                url: accessUrl(params),
                method: 'GET',
                body: undefined,
            }),
    });
};

/** Replaces who can query a live data source; its explores are rebuilt with the rule. */
export const useUpdateLiveSourceAccess = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<LiveSourceAccess, ApiError, LiveSourceAccessRule>({
        mutationFn: (rule) =>
            lightdashApi<LiveSourceAccess>({
                url: accessUrl(params),
                method: 'PUT',
                body: JSON.stringify(rule),
            }),
        onSuccess: async (access) => {
            queryClient.setQueryData(accessQueryKey(params), access);
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['external-connections', params.projectUuid],
                }),
                // Explores were rebuilt with the rule
                queryClient.invalidateQueries({ queryKey: ['tables'] }),
            ]);
            showToastSuccess({ title: 'Access updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update access',
                apiError: error,
            });
        },
    });
};
