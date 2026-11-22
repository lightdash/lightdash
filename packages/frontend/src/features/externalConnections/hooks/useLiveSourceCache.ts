import {
    type ApiError,
    type ApiUpdateLiveSourceCacheRequest,
    type ExternalConnection,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type LiveSourceParams = { projectUuid: string; connectionUuid: string };

const cacheUrl = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/cache`;

/** Sets how long a live data source's results answer the same query. */
export const useUpdateLiveSourceCache = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ExternalConnection,
        ApiError,
        ApiUpdateLiveSourceCacheRequest
    >({
        mutationFn: (body) =>
            lightdashApi<ExternalConnection>({
                url: cacheUrl(params),
                method: 'PATCH',
                body: JSON.stringify(body),
            }),
        onSuccess: async () => {
            // Explores are untouched: only the source itself changed.
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', params.projectUuid],
            });
            showToastSuccess({ title: 'Cache updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update cache',
                apiError: error,
            });
        },
    });
};

/** Makes the next query on a live data source call its integration, for everyone. */
export const usePurgeLiveSourceCache = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<ExternalConnection, ApiError>({
        mutationFn: () =>
            lightdashApi<ExternalConnection>({
                url: `${cacheUrl(params)}/purge`,
                method: 'POST',
                body: undefined,
            }),
        onSuccess: async () => {
            // Explores are untouched: only the source itself changed.
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', params.projectUuid],
            });
            showToastSuccess({ title: 'Cache cleared' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear cache',
                apiError: error,
            });
        },
    });
};
