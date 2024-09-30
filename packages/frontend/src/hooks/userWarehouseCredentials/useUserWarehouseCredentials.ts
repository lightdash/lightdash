import {
    type ApiError,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const getUserWarehouseCredentials = async () =>
    lightdashApi<UserWarehouseCredentials[]>({
        url: `/user/warehouseCredentials`,
        method: 'GET',
        body: undefined,
    });

export const useUserWarehouseCredentials = (
    useQueryOptions?: UseQueryOptions<UserWarehouseCredentials[], ApiError>,
) => {
    return useQuery<UserWarehouseCredentials[], ApiError>({
        queryKey: ['user_warehouse_credentials'],
        queryFn: getUserWarehouseCredentials,
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
    });

export const useUserWarehouseCredentialsCreateMutation = (
    useMutationOptions?: UseMutationOptions<
        UserWarehouseCredentials,
        ApiError,
        UpsertUserWarehouseCredentials
    >,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        UserWarehouseCredentials,
        ApiError,
        UpsertUserWarehouseCredentials
    >((data) => createUserWarehouseCredentials(data), {
        mutationKey: ['create_user_warehouse_credentials'],
        onSuccess: async (data, payload) => {
            await queryClient.invalidateQueries(['user_warehouse_credentials']);

            showToastSuccess({
                title: `Success! Warehouse connection was created.`,
            });
            useMutationOptions?.onSuccess?.(data, payload, undefined);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to create warehouse connection`,
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
    });

export const useUserWarehouseCredentialsUpdateMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, UpsertUserWarehouseCredentials>(
        (data) => updateUserWarehouseCredentials(uuid, data),
        {
            mutationKey: ['update_user_warehouse_credentials'],
            onSuccess: async (_) => {
                await queryClient.invalidateQueries([
                    'user_warehouse_credentials',
                ]);

                showToastSuccess({
                    title: `Success! Warehouse connection was updated.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update warehouse connection`,
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
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError>(
        () => deleteUserWarehouseCredentials(uuid),
        {
            mutationKey: ['delete_user_warehouse_credentials'],
            onSuccess: async (_) => {
                await queryClient.invalidateQueries([
                    'user_warehouse_credentials',
                ]);

                showToastSuccess({
                    title: `Success! Warehouse connection was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete warehouse connection`,
                    apiError: error,
                });
            },
        },
    );
};
