import {
    type ApiError,
    type OrganizationSettings,
    type UpdateOrganizationSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../api';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_settings'];

const getOrganizationSettings = async (lightdashApi: LightdashApi) =>
    lightdashApi<OrganizationSettings>({
        url: '/org/settings',
        method: 'GET',
        body: undefined,
    });

const updateOrganizationSettings = async (
    lightdashApi: LightdashApi,
    data: UpdateOrganizationSettings,
) =>
    lightdashApi<OrganizationSettings>({
        url: '/org/settings',
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useOrganizationSettings = ({
    enabled = true,
}: { enabled?: boolean } = {}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<OrganizationSettings, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: () => getOrganizationSettings(lightdashApi),
        enabled,
    });
};

export const useUpdateOrganizationSettings = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationSettings,
        ApiError,
        UpdateOrganizationSettings
    >(
        (data: UpdateOrganizationSettings) =>
            updateOrganizationSettings(lightdashApi, data),
        {
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
        },
    );
};
