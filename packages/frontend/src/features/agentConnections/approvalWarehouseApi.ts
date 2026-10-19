import {
    type AiAccessForUser,
    type ApiError,
    type AgentConnectionApprovalProject,
    type WarehouseConnectionForUserCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import { useQueries, type UseQueryOptions } from '@tanstack/react-query';
import { useState } from 'react';
import { isSingleConnectionProject } from '../../hooks/useWarehouseConnections';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { createRequestQueue } from './requestQueue';

export const useApprovalWarehouses = (
    projects: AgentConnectionApprovalProject[],
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();

    const [queue] = useState(createRequestQueue);
    const connections = useQueries({
        queries: projects.map(
            (
                project,
            ): UseQueryOptions<
                WarehouseConnectionForUserCredentials[],
                ApiError
            > => ({
                queryKey: [
                    'projects',
                    project.projectUuid,
                    'warehouse-connection-user-credentials',
                ],
                queryFn: ({ signal }) =>
                    queue(
                        () =>
                            lightdashApi({
                                url: `/projects/${encodeURIComponent(project.projectUuid)}/warehouse-connection-user-credentials`,
                                method: 'GET',
                                body: undefined,
                                signal,
                            }),
                        signal,
                    ),
                enabled,
                retry: false,
            }),
        ),
    });
    const bindings = connections.flatMap<{
        projectIndex: number;
        connectionUuid: string | null;
        name: string | null;
        warehouseType: WarehouseTypes | undefined;
    }>((query, projectIndex) => {
        if (isSingleConnectionProject(query.error))
            return [
                {
                    projectIndex,
                    connectionUuid: null,
                    name: null,
                    warehouseType: undefined,
                },
            ];
        return (query.data ?? []).map((connection) => ({
            projectIndex,
            connectionUuid: connection.isOriginal
                ? null
                : connection.warehouseConnectionUuid,
            name: connection.name,
            warehouseType: connection.warehouseType,
        }));
    });
    const readiness = useQueries({
        queries: bindings.map(
            (binding): UseQueryOptions<AiAccessForUser, ApiError> => {
                const projectUuid = projects[binding.projectIndex].projectUuid;
                return {
                    queryKey: [
                        'ai-access',
                        projectUuid,
                        binding.connectionUuid,
                        'me',
                    ],
                    queryFn: ({ signal }) =>
                        queue(
                            () =>
                                lightdashApi({
                                    version: 'v2',
                                    url: `/projects/${encodeURIComponent(projectUuid)}/ai-access/me${binding.connectionUuid === null ? '' : `?${new URLSearchParams({ connection: binding.connectionUuid })}`}`,
                                    method: 'GET',
                                    body: undefined,
                                    signal,
                                }),
                            signal,
                        ),
                    enabled,
                    refetchOnWindowFocus: true,
                };
            },
        ),
    });
    return {
        projects: projects.map((project, index) => ({
            project,
            connections: connections[index],
            bindings: bindings.flatMap((binding, bindingIndex) =>
                binding.projectIndex === index
                    ? [{ ...binding, access: readiness[bindingIndex] }]
                    : [],
            ),
        })),
        needsAttention:
            connections.some(
                (query) =>
                    (query.isError &&
                        !isSingleConnectionProject(query.error)) ||
                    (query.isSuccess && query.data.length === 0),
            ) ||
            readiness.some(
                (query) =>
                    query.isError ||
                    (query.data &&
                        (!query.data.enabled || query.data.refusal !== null)),
            ),
    };
};
