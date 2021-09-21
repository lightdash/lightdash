import {
    ApiError,
    CreateWarehouseCredentials,
    Project,
    WarehouseCredentials,
} from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const updateWarehouseConnection = async (
    id: string,
    data: CreateWarehouseCredentials,
) =>
    lightdashApi<WarehouseCredentials>({
        url: `/projects/${id}/warehouse`,
        method: 'PATCH',
        body: JSON.stringify({ warehouseConnection: data }),
    });

const getProject = async (id: string) =>
    lightdashApi<Project>({
        url: `/projects/${id}`,
        method: 'GET',
        body: undefined,
    });

export const useProject = (id: string) =>
    useQuery<Project, ApiError>({
        queryKey: ['project', id],
        queryFn: () => getProject(id || ''),
        enabled: id !== undefined,
        retry: false,
    });

export const useUpdateWarehouseMutation = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<
        WarehouseCredentials,
        ApiError,
        CreateWarehouseCredentials
    >((data) => updateWarehouseConnection(id, data), {
        mutationKey: ['warehouse_connection_update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(['project', id]);
            showToastSuccess({
                title: `Warehouse connection saved with success`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to save warehouse connection`,
                subtitle: error.error.message,
            });
        },
    });
};
