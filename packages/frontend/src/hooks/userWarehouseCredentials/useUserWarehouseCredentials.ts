import {
    type ApiError,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
    type UserWarehouseCredentialsWithAgentStatus,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

export const getUserWarehouseCredentials = async () =>
    lightdashApi<UserWarehouseCredentialsWithAgentStatus[]>({
        url: `/user/warehouseCredentials`,
        method: 'GET',
        body: undefined,
    });

export const useUserWarehouseCredentials = (
    useQueryOptions?: UseQueryOptions<
        UserWarehouseCredentialsWithAgentStatus[],
        ApiError
    >,
) => {
    return useQuery<UserWarehouseCredentialsWithAgentStatus[], ApiError>({
        queryKey: ['user_warehouse_credentials'],
        queryFn: getUserWarehouseCredentials,
        ...useQueryOptions,
    });
};

const getProjectUserWarehouseCredentials = async (projectUuid: string) =>
    lightdashApi<UserWarehouseCredentials[]>({
        url: `/projects/${projectUuid}/user-warehouse-credentials`,
        method: 'GET',
        body: undefined,
    });

export const useProjectUserWarehouseCredentials = (
    projectUuid: string | undefined,
    useQueryOptions?: UseQueryOptions<UserWarehouseCredentials[], ApiError>,
) => {
    return useQuery<UserWarehouseCredentials[], ApiError>({
        queryKey: ['project_user_warehouse_credentials', projectUuid],
        queryFn: () => getProjectUserWarehouseCredentials(projectUuid!),
        enabled: !!projectUuid,
        ...useQueryOptions,
    });
};

const createUserWarehouseCredentials = async (
    data: UpsertUserWarehouseCredentials,
) =>
    lightdashApi<UserWarehouseCredentials>({
        url: `/user/warehouseCredentials`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

export const useUserWarehouseCredentialsCreateMutation = (
    useMutationOptions?: UseMutationOptions<
        UserWarehouseCredentials,
        ApiError,
        UpsertUserWarehouseCredentials
    >,
) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        UserWarehouseCredentials,
        ApiError,
        UpsertUserWarehouseCredentials
    >((data) => createUserWarehouseCredentials(data), {
        mutationKey: ['create_user_warehouse_credentials'],
        onSuccess: async (data, payload) => {
            await queryClient.invalidateQueries(['user_warehouse_credentials']);
            await queryClient.invalidateQueries([
                'project_user_warehouse_credentials',
            ]);
            await queryClient.invalidateQueries(['ai-access']);

            showToastSuccess({
                title: t(
                    'useUserWarehouseCredentials.successWarehouseConnectionWasCreated',
                ),
            });
            useMutationOptions?.onSuccess?.(data, payload, undefined);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t(
                    'useUserWarehouseCredentials.failedToCreateWarehouseConnection',
                ),
                apiError: error,
            });
        },
    });
};

const updateUserWarehouseCredentials = async (
    uuid: string,
    data: UpsertUserWarehouseCredentials,
) =>
    lightdashApi<null>({
        url: `/user/warehouseCredentials/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
        sensitive: true,
    });

export const useUserWarehouseCredentialsUpdateMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, UpsertUserWarehouseCredentials>(
        (data) => updateUserWarehouseCredentials(uuid, data),
        {
            mutationKey: ['update_user_warehouse_credentials'],
            onSuccess: async (_) => {
                await queryClient.invalidateQueries([
                    'user_warehouse_credentials',
                ]);
                await queryClient.invalidateQueries([
                    'project_user_warehouse_credentials',
                ]);
                await queryClient.invalidateQueries(['ai-access']);

                showToastSuccess({
                    title: t(
                        'useUserWarehouseCredentials.successWarehouseConnectionWasUpdated',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useUserWarehouseCredentials.failedToUpdateWarehouseConnection',
                    ),
                    apiError: error,
                });
            },
        },
    );
};

const deleteUserWarehouseCredentials = async (uuid: string) =>
    lightdashApi<null>({
        url: `/user/warehouseCredentials/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUserWarehouseCredentialsDeleteMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError>(
        () => deleteUserWarehouseCredentials(uuid),
        {
            mutationKey: ['delete_user_warehouse_credentials'],
            onSuccess: async (_) => {
                await queryClient.invalidateQueries([
                    'user_warehouse_credentials',
                ]);
                await queryClient.invalidateQueries([
                    'project_user_warehouse_credentials',
                ]);
                await queryClient.invalidateQueries(['ai-access']);

                showToastSuccess({
                    title: t(
                        'useUserWarehouseCredentials.successWarehouseConnectionWasDeleted',
                    ),
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t(
                        'useUserWarehouseCredentials.failedToDeleteWarehouseConnection',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
