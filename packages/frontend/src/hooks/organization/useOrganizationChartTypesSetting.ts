import {
    type ApiError,
    type OrganizationChartTypesSetting,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const QUERY_KEY = ['organization_settings', 'chart-types'];

const getOrganizationChartTypesSetting = async () =>
    lightdashApi<OrganizationChartTypesSetting>({
        url: '/org/settings/chart-types',
        method: 'GET',
        body: undefined,
    });

const updateOrganizationChartTypesSetting = async (
    data: OrganizationChartTypesSetting,
) =>
    lightdashApi<OrganizationChartTypesSetting>({
        url: '/org/settings/chart-types',
        method: 'PATCH',
        body: JSON.stringify(data),
    });

// Readable by anyone who can view organization chart types, so non-admins
// learn whether the organization library is on.
export const useOrganizationChartTypesSetting = ({
    enabled,
}: {
    enabled: boolean;
}) =>
    useQuery<OrganizationChartTypesSetting, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getOrganizationChartTypesSetting,
        enabled,
    });

export const useUpdateOrganizationChartTypesSetting = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        OrganizationChartTypesSetting,
        ApiError,
        OrganizationChartTypesSetting
    >(updateOrganizationChartTypesSetting, {
        mutationKey: [...QUERY_KEY, 'update'],
        onSuccess: (results) => {
            queryClient.setQueryData(QUERY_KEY, results);
            void queryClient.invalidateQueries({
                queryKey: ['organization-data-app-vizs'],
            });
            showToastSuccess({
                title: results.enabled
                    ? 'Organization library turned on'
                    : 'Organization library turned off',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update the organization library',
                apiError: error,
            });
        },
    });
};
