import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ApiError } from 'common';
import { lightdashApi } from '../../api';
import { useApp } from '../../providers/AppProvider';
import useQueryError from '../useQueryError';

/* const getDashboard = async (id: string) =>
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

const updateDashboardTile = async (id: string, data: UpdateDashboard) =>
    lightdashApi<undefined>({
        url: `/dashboards/${id}/versions`,
        method: 'PATCH',
        body: JSON.stringify(data),
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
            mutationKey: ['project_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['dashboard', id]);
                showToastSuccess({
                    title: `Dashboard saved with success`,
                });
            },
        },
    );
};

export const useUpdateDashboardTile = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, UpdateDashboard>(
        (data) => updateDashboardTile(id, data),
        {
            mutationKey: ['project_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['dashboard', id]);
                showToastSuccess({
                    title: `Dashboard tile saved with success`,
                });
            },
        },
    );
};

export const useCreateMutation = (id: string) => {
    const { showToastSuccess } = useApp();
    return useMutation<Dashboard, ApiError, UpdateDashboard>(
        (data) => createDashboard(id, data),
        {
            mutationKey: ['project_create'],
            onSuccess: async () => {
                showToastSuccess({
                    title: `Dashboard created with success`,
                });
            },
        },
    );
}; */
