import { ApiError, CreateDashboard, Dashboard, UpdateDashboard } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../../api';
import { useApp } from '../../providers/AppProvider';
import useQueryError from '../useQueryError';

const getDashboard = async (id: string) =>
    lightdashApi<Dashboard>({
        url: `/dashboards/${id}`,
        method: 'GET',
        body: undefined,
    });

const createDashboard = async (projectId: string, data: CreateDashboard) =>
    lightdashApi<Dashboard>({
        url: `/projects/${projectId}/dashboards`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateDashboard = async (id: string, data: UpdateDashboard) =>
    lightdashApi<undefined>({
        url: `/dashboards/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteDashboard = async (id: string) =>
    lightdashApi<undefined>({
        url: `/dashboards/${id}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDashboardQuery = (id: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryKey: ['saved_dashboard_query', id],
        queryFn: () => getDashboard(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateDashboard = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, UpdateDashboard>(
        (data) => updateDashboard(id, data),
        {
            mutationKey: ['dashboard_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries('dashboards');
                await queryClient.invalidateQueries([
                    'saved_dashboard_query',
                    id,
                ]);
                showToastSuccess({
                    title: `Success! Dashboard was updated.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = (projectId: string) => {
    const { showToastSuccess, showToastError } = useApp();
    const queryClient = useQueryClient();
    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) => createDashboard(projectId, data),
        {
            mutationKey: ['dashboard_create'],
            onSuccess: async () => {
                await queryClient.invalidateQueries('dashboards');
                showToastSuccess({
                    title: `Success! Dashboard was created.`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create dashboard`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useDeleteMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(deleteDashboard, {
        onSuccess: async () => {
            await queryClient.invalidateQueries('dashboards');
            showToastSuccess({
                title: `Deleted! Dashboard was deleted.`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete dashboard`,
                subtitle: error.error.message,
            });
        },
    });
};
