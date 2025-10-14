import {
    type ApiAiOrganizationSettingsResponse,
    type ApiError,
    type ApiUpdateAiOrganizationSettingsResponse,
    type UpdateAiOrganizationSettings,
} from '@lightdash/common';
import {
    useMutation,
    type UseMutationOptions,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const getAiOrganizationSettings = async () => {
    return lightdashApi<ApiAiOrganizationSettingsResponse['results']>({
        url: `/aiAgents/admin/settings`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiOrganizationSettings = (
    queryOptions?: UseQueryOptions<
        ApiAiOrganizationSettingsResponse['results'],
        ApiError
    >,
) => {
    return useQuery<ApiAiOrganizationSettingsResponse['results'], ApiError>({
        queryKey: ['ai-organization-settings'],
        queryFn: getAiOrganizationSettings,
        keepPreviousData: true,
        ...queryOptions,
    });
};

const updateAiOrganizationSettings = async (
    data: UpdateAiOrganizationSettings,
) => {
    return lightdashApi<ApiUpdateAiOrganizationSettingsResponse['results']>({
        url: `/aiAgents/admin/settings`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

export const useUpdateAiOrganizationSettings = (
    mutationOptions?: UseMutationOptions<
        ApiUpdateAiOrganizationSettingsResponse['results'],
        ApiError,
        UpdateAiOrganizationSettings
    >,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiUpdateAiOrganizationSettingsResponse['results'],
        ApiError,
        UpdateAiOrganizationSettings
    >({
        mutationFn: updateAiOrganizationSettings,
        onSuccess: async (data, variables, context) => {
            showToastSuccess({
                title: 'Success! AI organization settings updated',
            });
            queryClient.setQueryData(['ai-organization-settings'], data);
            await queryClient.invalidateQueries(['ai-organization-settings']);
            mutationOptions?.onSuccess?.(data, variables, context);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update AI organization settings',
                apiError: error,
            });
        },
        ...mutationOptions,
    });
};
