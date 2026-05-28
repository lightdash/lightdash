import {
    type ApiError,
    type OrganizationSettings,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_settings'];

const getOrganizationSettings = async () =>
    lightdashApi<OrganizationSettings>({
        url: '/org/settings',
        method: 'GET',
        body: undefined,
    });

const updateOrganizationSettings = async (data: UpdateOrganizationSettings) =>
    lightdashApi<OrganizationSettings>({
        url: '/org/settings',
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganizationSettings = () =>
    useQuery<OrganizationSettings, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getOrganizationSettings,
    });

export const useUpdateOrganizationSettings = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationSettings,
        ApiError,
        UpdateOrganizationSettings
    >(updateOrganizationSettings, {
        mutationKey: ['organization_settings', 'update'],
        onSuccess: async () => {
            await queryClient.invalidateQueries(QUERY_KEY);
            showToastSuccess({ title: 'Organization settings saved' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save organization settings',
                apiError: error,
            });
        },
    });
};
