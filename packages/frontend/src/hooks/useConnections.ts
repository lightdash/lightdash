import {
    type ApiCreateConnectionRequest,
    type ApiError,
    type ApiUpdateConnectionRequest,
    type Connection,
    type ConnectionCapabilities,
    type ConnectionWithCredentials,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

export type ProjectConnections = {
    connections: Connection[];
    capabilities: ConnectionCapabilities;
};

const connectionsQueryKey = (projectUuid: string) => [
    'projects',
    projectUuid,
    'connections',
];

const connectionQueryKey = (projectUuid: string, connectionUuid: string) => [
    'projects',
    projectUuid,
    'connections',
    connectionUuid,
];

const getConnections = async (projectUuid: string) =>
    lightdashApi<ProjectConnections>({
        url: `/projects/${projectUuid}/connections`,
        method: 'GET',
        body: undefined,
    });

const getConnection = async (projectUuid: string, connectionUuid: string) =>
    lightdashApi<ConnectionWithCredentials>({
        url: `/projects/${projectUuid}/connections/${connectionUuid}`,
        method: 'GET',
        body: undefined,
    });

const createConnection = async (
    projectUuid: string,
    data: ApiCreateConnectionRequest,
) =>
    lightdashApi<Connection>({
        url: `/projects/${projectUuid}/connections`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateConnection = async (
    projectUuid: string,
    connectionUuid: string,
    data: ApiUpdateConnectionRequest,
) =>
    lightdashApi<Connection>({
        url: `/projects/${projectUuid}/connections/${connectionUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const renameConnection = async (
    projectUuid: string,
    connectionUuid: string,
    name: string,
) =>
    lightdashApi<Connection>({
        url: `/projects/${projectUuid}/connections/${connectionUuid}/name`,
        method: 'PATCH',
        body: JSON.stringify({ name }),
    });

const deleteConnection = async (projectUuid: string, connectionUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/connections/${connectionUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useConnections = (projectUuid?: string) =>
    useQuery<ProjectConnections, ApiError>({
        queryKey: connectionsQueryKey(projectUuid ?? ''),
        queryFn: () => getConnections(projectUuid!),
        enabled: !!projectUuid,
    });

export const useConnection = (projectUuid: string, connectionUuid?: string) =>
    useQuery<ConnectionWithCredentials, ApiError>({
        queryKey: connectionQueryKey(projectUuid, connectionUuid ?? ''),
        queryFn: () => getConnection(projectUuid, connectionUuid!),
        enabled: !!connectionUuid,
    });

/**
 * How the project settings page should present connections. One connection is
 * still described by the single warehouse form; several are not.
 */
export const useProjectConnectionLayout = (projectUuid?: string) => {
    const { data } = useConnections(projectUuid);
    const connectionCount = data?.connections.length ?? 0;
    return {
        showWarehouseForm: connectionCount <= 1,
        hasSeveralConnections: connectionCount > 1,
    };
};

// A connection change moves the project payload between its single-connection
// and multi-connection shapes, so the project query is invalidated with it.
const useConnectionInvalidation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return async (connectionUuid?: string) => {
        await Promise.all([
            queryClient.invalidateQueries(connectionsQueryKey(projectUuid)),
            queryClient.invalidateQueries(['project', projectUuid]),
            ...(connectionUuid
                ? [
                      queryClient.invalidateQueries(
                          connectionQueryKey(projectUuid, connectionUuid),
                      ),
                  ]
                : []),
        ]);
    };
};

export const useCreateConnection = (
    projectUuid: string,
    options?: { onSuccess?: (connection: Connection) => void },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<Connection, ApiError, ApiCreateConnectionRequest>(
        (data) => createConnection(projectUuid, data),
        {
            mutationKey: ['create_connection', projectUuid],
            onSuccess: async (connection) => {
                options?.onSuccess?.(connection);
                await invalidate();
                showToastSuccess({ title: 'Connection added' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to add connection',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateConnection = (
    projectUuid: string,
    options?: { onSuccess?: (connection: Connection) => void },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Connection,
        ApiError,
        { connectionUuid: string; data: ApiUpdateConnectionRequest }
    >(
        ({ connectionUuid, data }) =>
            updateConnection(projectUuid, connectionUuid, data),
        {
            mutationKey: ['update_connection', projectUuid],
            onSuccess: async (connection, { connectionUuid }) => {
                options?.onSuccess?.(connection);
                await invalidate(connectionUuid);
                showToastSuccess({ title: 'Connection updated' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update connection',
                    apiError: error,
                });
            },
        },
    );
};

export const useRenameConnection = (
    projectUuid: string,
    options?: { onSuccess?: (connection: Connection) => void },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        Connection,
        ApiError,
        { connectionUuid: string; name: string }
    >(
        ({ connectionUuid, name }) =>
            renameConnection(projectUuid, connectionUuid, name),
        {
            mutationKey: ['rename_connection', projectUuid],
            onSuccess: async (connection, { connectionUuid }) => {
                options?.onSuccess?.(connection);
                await invalidate(connectionUuid);
                showToastSuccess({ title: 'Connection renamed' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to rename connection',
                    apiError: error,
                });
            },
        },
    );
};

// The refusal message carries the bound-content counts, so the caller renders
// the error itself instead of dropping it into a toast that hides the detail.
export const useDeleteConnection = (
    projectUuid: string,
    options?: { onSuccess?: () => void },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, string>(
        (connectionUuid) => deleteConnection(projectUuid, connectionUuid),
        {
            mutationKey: ['delete_connection', projectUuid],
            onSuccess: async () => {
                options?.onSuccess?.();
                await invalidate();
                showToastSuccess({ title: 'Connection removed' });
            },
        },
    );
};
