import { type ApiError } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import { createRequestQueue } from './requestQueue';
import {
    type AgentConnectionRecord,
    type AgentConnectionStatus,
} from './types';

const statusQueue = createRequestQueue();
const loadStatus = (grantUuid: string, signal: AbortSignal | undefined) =>
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

export const useAgentConnections = () =>
    useQuery<AgentConnectionRecord[], ApiError>({
        queryKey: ['agent-connections'],
        queryFn: () =>
            lightdashApi({
                version: 'v2',
                url: '/user/agent-connections',
                method: 'GET',
            }),
    });

export const useAgentConnectionStatus = (
    grantUuid: string,
    enabled: boolean,
) => {
    const client = useQueryClient();
    return useQuery<AgentConnectionStatus, ApiError>({
        queryKey: ['agent-connection-status', grantUuid],
        queryFn: ({ signal }) => loadStatus(grantUuid, signal),
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
