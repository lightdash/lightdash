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
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

export const getUserWarehouseCredentials = async (lightdashApi: LightdashApi) =>
    lightdashApi<UserWarehouseCredentials[]>({
        url: `/user/warehouseCredentials`,
        method: 'GET',
        body: undefined,
    });

export const useUserWarehouseCredentials = (
    useQueryOptions?: UseQueryOptions<UserWarehouseCredentials[], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<UserWarehouseCredentials[], ApiError>({
        queryKey: ['user_warehouse_credentials'],
        queryFn: () => getUserWarehouseCredentials(lightdashApi),
        ...useQueryOptions,
    });
};

const getProjectUserWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<UserWarehouseCredentials[]>({
        url: `/projects/${projectUuid}/user-warehouse-credentials`,
        method: 'GET',
        body: undefined,
    });

export const useProjectUserWarehouseCredentials = (
    projectUuid: string | undefined,
    useQueryOptions?: UseQueryOptions<UserWarehouseCredentials[], ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<UserWarehouseCredentials[], ApiError>({
        queryKey: ['project_user_warehouse_credentials', projectUuid],
        queryFn: () =>
            getProjectUserWarehouseCredentials(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        ...useQueryOptions,
    });
};

const createUserWarehouseCredentials = async (
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        UserWarehouseCredentials,
        ApiError,
        UpsertUserWarehouseCredentials
    >((data) => createUserWarehouseCredentials(lightdashApi, data), {
        mutationKey: ['create_user_warehouse_credentials'],
        onSuccess: async (data, payload) => {
            await queryClient.invalidateQueries(['user_warehouse_credentials']);
            await queryClient.invalidateQueries([
                'project_user_warehouse_credentials',
            ]);
            await queryClient.invalidateQueries(['ai-access']);

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
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, UpsertUserWarehouseCredentials>(
        (data) => updateUserWarehouseCredentials(lightdashApi, uuid, data),
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

const deleteUserWarehouseCredentials = async (
    lightdashApi: LightdashApi,
    uuid: string,
) =>
    lightdashApi<null>({
        url: `/user/warehouseCredentials/${uuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useUserWarehouseCredentialsDeleteMutation = (uuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError>(
        () => deleteUserWarehouseCredentials(lightdashApi, uuid),
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
