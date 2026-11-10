import { type ApiError } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { createRequestQueue } from './requestQueue';
import {
    type AgentConnectionRecord,
    type AgentConnectionStatus,
} from './types';

const statusQueue = createRequestQueue();
const loadStatus = (
    lightdashApi: LightdashApi,
    grantUuid: string,
    signal: AbortSignal | undefined,
) =>
    statusQueue(
        () =>
            lightdashApi<AgentConnectionStatus>({
                version: 'v2',
                url: `/user/agent-connections/${encodeURIComponent(grantUuid)}/status`,
                method: 'GET',
                signal,
            }),
        signal,
    );

export const useAgentConnections = (
    options: Pick<
        UseQueryOptions<AgentConnectionRecord[], ApiError>,
        'enabled' | 'refetchOnMount' | 'retryOnMount'
    > = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AgentConnectionRecord[], ApiError>({
        queryKey: ['agent-connections'],
        ...options,
        queryFn: () =>
            lightdashApi({
                version: 'v2',
                url: '/user/agent-connections',
                method: 'GET',
            }),
    });
};

export const useAgentConnectionStatus = (
    grantUuid: string,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();

    const client = useQueryClient();
    return useQuery<AgentConnectionStatus, ApiError>({
        queryKey: ['agent-connection-status', grantUuid],
        queryFn: ({ signal }) => loadStatus(lightdashApi, grantUuid, signal),
        enabled,
        staleTime: Infinity,
        onSuccess: (status) =>
            client.setQueryData<AgentConnectionRecord[]>(
                ['agent-connections'],
                (records) =>
                    records?.map((record) =>
                        record.grantUuid === grantUuid
                            ? {
                                  ...record,
                                  status: status.status,
                                  limitsStatus: status.limitsStatus,
                                  revokedAt: status.revokedAt,
                              }
                            : record,
                    ),
            ),
    });
};

export const useRevokeAgentConnection = () => {
    const lightdashApi = useLightdashApi();

    const client = useQueryClient();
    return useMutation<AgentConnectionRecord, ApiError, string>({
        mutationFn: (grantUuid) =>
            lightdashApi({
                version: 'v2',
                url: `/user/agent-connections/${encodeURIComponent(grantUuid)}`,
                method: 'DELETE',
            }),
        onSuccess: async (record) => {
            client.setQueryData<AgentConnectionRecord[]>(
                ['agent-connections'],
                (records) =>
                    records?.map((row) =>
                        row.grantUuid === record.grantUuid ? record : row,
                    ),
            );
            await Promise.all([
                client.invalidateQueries({
                    queryKey: ['agent-connections'],
                    exact: true,
                }),
                client.invalidateQueries({
                    queryKey: ['agent-connection-status', record.grantUuid],
                    exact: true,
                }),
            ]);
        },
    });
};
