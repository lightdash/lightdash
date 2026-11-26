import {
    type ApiError,
    type ApiUpdateLiveSourceRateLimitsRequest,
    type ExternalConnection,
    type ExternalConnectionRateLimitUsage,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type RateLimitParams = { projectUuid: string; connectionUuid: string };

const rateLimitsUrl = ({ projectUuid, connectionUuid }: RateLimitParams) =>
    `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/rate-limits`;

/** A live source's rate limits and usage, read when the page opens. */
export const useExternalConnectionRateLimitUsage = (
    params: RateLimitParams,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionRateLimitUsage, ApiError>({
        queryKey: [
            'external-connections',
            params.projectUuid,
            params.connectionUuid,
            'rate-limits',
        ],
        queryFn: () =>
            lightdashApi<ExternalConnectionRateLimitUsage>({
                url: rateLimitsUrl(params),
                method: 'GET',
                body: undefined,
            }),
        refetchOnWindowFocus: false,
    });
};

/** Sets the lower limits of a live data source; empty ones restore the integration's. */
export const useUpdateLiveSourceRateLimits = (params: RateLimitParams) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ExternalConnection,
        ApiError,
        ApiUpdateLiveSourceRateLimitsRequest
    >({
        mutationFn: (body) =>
            lightdashApi<ExternalConnection>({
                url: rateLimitsUrl(params),
                method: 'PATCH',
                body: JSON.stringify(body),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['external-connections', params.projectUuid],
            });
            showToastSuccess({ title: 'Rate limits updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update rate limits',
                apiError: error,
            });
        },
    });
};
