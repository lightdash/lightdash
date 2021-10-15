import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ApiError, CreateDashboard, Dashboard, UpdateDashboard } from 'common';
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

export const useDashboard = (id: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<Dashboard, ApiError>({
        queryFn: () => getDashboard(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateDashboard = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, UpdateDashboard>(
        (data) => updateDashboard(id, data),
        {
            mutationKey: ['dashboard_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['dashboard', id]);
                showToastSuccess({
                    title: `Dashboard saved with success`,
                });
            },
        },
    );
};

export const useCreateMutation = (id: string) => {
    const { showToastSuccess } = useApp();
    return useMutation<Dashboard, ApiError, CreateDashboard>(
        (data) => createDashboard(id, data),
        {
            mutationKey: ['dashboard_create'],
            onSuccess: async () => {
                showToastSuccess({
                    title: `Dashboard created with success`,
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
            showToastSuccess({
                title: `Dashboard deleted with success`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete chart`,
                subtitle: error.error.message,
            });
        },
    });
};
