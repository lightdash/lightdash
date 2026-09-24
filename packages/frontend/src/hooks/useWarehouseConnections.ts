import {
    FeatureFlags,
    WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE,
    type ApiCreateWarehouseConnectionRequest,
    type ApiError,
    type ApiUpdateWarehouseConnectionRequest,
    type WarehouseConnection,
    type WarehouseConnectionCapabilities,
    type WarehouseConnectionForUserCredentials,
    type WarehouseConnectionUserCredentials,
    type WarehouseConnectionWithCredentials,
} from '@lightdash/common';
import {
    useMutation,
    useQueries,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

export type ProjectWarehouseConnections = {
    connections: WarehouseConnection[];
    capabilities: WarehouseConnectionCapabilities;
};

export type NameConflictHandler = (message: string) => void;

const isNameConflict = (error: ApiError['error']) =>
    error.name === 'ConflictError' &&
    error.message === WAREHOUSE_CONNECTION_NAME_CONFLICT_MESSAGE;

export const isSingleConnectionProject = (error: ApiError | null) =>
    error?.error.name === 'SingleConnectionProjectError';

export const hidesConnectionsPanel = (error: ApiError | null) =>
    isSingleConnectionProject(error) || error?.error.name === 'ForbiddenError';

const connectionsQueryKey = (projectUuid: string) => [
    'projects',
    projectUuid,
    'warehouse-connections',
];

const connectionQueryKey = (
    projectUuid: string,
    warehouseConnectionUuid: string,
) => [
    'projects',
    projectUuid,
    'warehouse-connections',
    warehouseConnectionUuid,
];

const connectionsUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/warehouse-connections`;

export const useWarehouseConnections = (projectUuid: string) => {
    const { data: flag } = useServerFeatureFlag(
        FeatureFlags.MultiConnectionProjects,
    );
    const isEnabled = flag?.enabled === true;
    const query = useQuery<ProjectWarehouseConnections, ApiError>({
        queryKey: connectionsQueryKey(projectUuid),
        queryFn: () =>
            lightdashApi<ProjectWarehouseConnections>({
                url: connectionsUrl(projectUuid),
                method: 'GET',
                body: undefined,
            }),
        enabled: isEnabled,
        retry: false,
    });
    return { ...query, isEnabled };
};

export const useWarehouseConnectionsForUserCredentials = (
    projectUuid: string,
    enabled = true,
) =>
    useQuery<WarehouseConnectionForUserCredentials[], ApiError>({
        queryKey: [
            'projects',
            projectUuid,
            'warehouse-connection-user-credentials',
        ],
        queryFn: () =>
            lightdashApi<WarehouseConnectionForUserCredentials[]>({
                url: `/projects/${projectUuid}/warehouse-connection-user-credentials`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });

const userCredentialsQueryKey = (
    projectUuid: string,
    warehouseConnectionUuid: string,
) => [
    'projects',
    projectUuid,
    'warehouse-connections',
    warehouseConnectionUuid,
    'user-credentials',
];

export const useWarehouseConnectionsUserCredentials = (
    projectUuid: string,
    warehouseConnectionUuids: string[],
) =>
    useQueries({
        queries: warehouseConnectionUuids.map((warehouseConnectionUuid) => ({
            queryKey: userCredentialsQueryKey(
                projectUuid,
                warehouseConnectionUuid,
            ),
            queryFn: () =>
                lightdashApi<WarehouseConnectionUserCredentials>({
                    url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}/user-credentials`,
                    method: 'GET',
                    body: undefined,
                }),
            retry: false,
        })),
    });

export const useWarehouseConnectionUserCredentialsMutation = (
    projectUuid: string,
    options: { onSuccess: () => void },
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        undefined,
        ApiError,
        {
            warehouseConnectionUuid: string;
            userWarehouseCredentialsUuid: string;
        }
    >(
        ({ warehouseConnectionUuid, userWarehouseCredentialsUuid }) =>
            lightdashApi<undefined>({
                url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}/user-credentials/${userWarehouseCredentialsUuid}`,
                method: 'PATCH',
                body: undefined,
            }),
        {
            mutationKey: [
                'update_warehouse_connection_user_credentials',
                projectUuid,
            ],
            onSuccess: async (_result, { warehouseConnectionUuid }) => {
                await queryClient.invalidateQueries(
                    userCredentialsQueryKey(
                        projectUuid,
                        warehouseConnectionUuid,
                    ),
                );
                showToastSuccess({
                    title: 'Credentials preference saved successfully',
                });
                options.onSuccess();
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to save credentials preference',
                    apiError: error,
                });
            },
        },
    );
};

export const useWarehouseConnection = (
    projectUuid: string,
    warehouseConnectionUuid: string | null,
) =>
    useQuery<WarehouseConnectionWithCredentials, ApiError>({
        queryKey: connectionQueryKey(
            projectUuid,
            warehouseConnectionUuid ?? '',
        ),
        queryFn: () =>
            lightdashApi<WarehouseConnectionWithCredentials>({
                url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}`,
                method: 'GET',
                body: undefined,
            }),
        enabled: warehouseConnectionUuid !== null,
    });

const useConnectionInvalidation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    return () =>
        queryClient.invalidateQueries(connectionsQueryKey(projectUuid));
};

export const useCreateWarehouseConnection = (
    projectUuid: string,
    options: {
        onSuccess: () => void;
        onNameConflict: NameConflictHandler;
    },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        WarehouseConnection,
        ApiError,
        ApiCreateWarehouseConnectionRequest
    >(
        (data) =>
            lightdashApi<WarehouseConnection>({
                url: connectionsUrl(projectUuid),
                method: 'POST',
                body: JSON.stringify(data),
            }),
        {
            mutationKey: ['create_warehouse_connection', projectUuid],
            onSuccess: async () => {
                options.onSuccess();
                await invalidate();
                showToastSuccess({ title: 'Connection added' });
            },
            onError: ({ error }) => {
                if (isNameConflict(error)) {
                    options.onNameConflict(error.message);
                    return;
                }
                showToastApiError({
                    title: 'Failed to add connection',
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateWarehouseConnection = (
    projectUuid: string,
    options: { onSuccess: () => void },
) => {
    const queryClient = useQueryClient();
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        WarehouseConnection,
        ApiError,
        {
            warehouseConnectionUuid: string;
            data: ApiUpdateWarehouseConnectionRequest;
        }
    >(
        ({ warehouseConnectionUuid, data }) =>
            lightdashApi<WarehouseConnection>({
                url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}`,
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
        {
            mutationKey: ['update_warehouse_connection', projectUuid],
            onSuccess: async (_connection, { warehouseConnectionUuid }) => {
                options.onSuccess();
                await Promise.all([
                    invalidate(),
                    queryClient.invalidateQueries(
                        connectionQueryKey(
                            projectUuid,
                            warehouseConnectionUuid,
                        ),
                    ),
                ]);
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

export const useRenameWarehouseConnection = (
    projectUuid: string,
    options: {
        onSuccess: () => void;
        onNameConflict: NameConflictHandler;
    },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        WarehouseConnection,
        ApiError,
        { warehouseConnectionUuid: string; name: string }
    >(
        ({ warehouseConnectionUuid, name }) =>
            lightdashApi<WarehouseConnection>({
                url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}/name`,
                method: 'PATCH',
                body: JSON.stringify({ name }),
            }),
        {
            mutationKey: ['rename_warehouse_connection', projectUuid],
            onSuccess: async () => {
                options.onSuccess();
                await invalidate();
                showToastSuccess({ title: 'Connection renamed' });
            },
            onError: ({ error }) => {
                if (isNameConflict(error)) {
                    options.onNameConflict(error.message);
                    return;
                }
                showToastApiError({
                    title: 'Failed to rename connection',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteWarehouseConnection = (
    projectUuid: string,
    options: { onSuccess: () => void },
) => {
    const invalidate = useConnectionInvalidation(projectUuid);
    const { showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, string>(
        (warehouseConnectionUuid) =>
            lightdashApi<undefined>({
                url: `${connectionsUrl(projectUuid)}/${warehouseConnectionUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        {
            mutationKey: ['delete_warehouse_connection', projectUuid],
            onSuccess: async () => {
                options.onSuccess();
                await invalidate();
                showToastSuccess({ title: 'Connection removed' });
            },
        },
    );
};
