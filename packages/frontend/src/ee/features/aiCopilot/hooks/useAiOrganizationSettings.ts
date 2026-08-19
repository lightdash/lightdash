import {
    type ApiAiOrganizationRuntimeSettingsResponse,
    type ApiAiOrganizationSettingsResponse,
    type ApiError,
    type ApiUpdateAiOrganizationSettingsResponse,
    type UpdateAiOrganizationSettings,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const resolveAiAgentMemoryEnabled = (
    settings:
        | Pick<
              ApiAiOrganizationRuntimeSettingsResponse['results'],
              'aiAgentMemoryEnabled'
          >
        | undefined,
): boolean => settings?.aiAgentMemoryEnabled ?? false;

const getAiOrganizationSettings = async () => {
    return lightdashApi<ApiAiOrganizationRuntimeSettingsResponse['results']>({
        url: `/aiAgents/settings`,
        method: 'GET',
        body: undefined,
    });
};

const getAiOrganizationAdminSettings = async () =>
    lightdashApi<ApiAiOrganizationSettingsResponse['results']>({
        url: `/aiAgents/admin/settings`,
        method: 'GET',
        body: undefined,
    });

const aiOrganizationRuntimeSettingsQueryKey = [
    'ai-organization-runtime-settings',
] as const;
const aiOrganizationAdminSettingsQueryKey = [
    'ai-organization-admin-settings',
] as const;

const invalidateAiOrganizationSettingsQueries = (queryClient: QueryClient) =>
    Promise.all([
        queryClient.invalidateQueries(aiOrganizationAdminSettingsQueryKey),
        queryClient.invalidateQueries(aiOrganizationRuntimeSettingsQueryKey),
    ]);

export const useAiOrganizationSettings = (
    queryOptions?: UseQueryOptions<
        ApiAiOrganizationRuntimeSettingsResponse['results'],
        ApiError
    >,
) => {
    return useQuery<
        ApiAiOrganizationRuntimeSettingsResponse['results'],
        ApiError
    >({
        queryKey: aiOrganizationRuntimeSettingsQueryKey,
        queryFn: getAiOrganizationSettings,
        keepPreviousData: true,
        ...queryOptions,
    });
};

export const useAiOrganizationAdminSettings = (
    queryOptions?: UseQueryOptions<
        ApiAiOrganizationSettingsResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiOrganizationSettingsResponse['results'], ApiError>({
        queryKey: aiOrganizationAdminSettingsQueryKey,
        queryFn: getAiOrganizationAdminSettings,
        keepPreviousData: true,
        ...queryOptions,
    });

export const useAiAgentMemoryEnabled = (): boolean => {
    const { data: settings } = useAiOrganizationSettings();
    return resolveAiAgentMemoryEnabled(settings);
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
            queryClient.setQueryData<
                ApiAiOrganizationSettingsResponse['results'] | undefined
            >(aiOrganizationAdminSettingsQueryKey, (previous) =>
                previous ? { ...previous, ...data } : undefined,
            );
            await invalidateAiOrganizationSettingsQueries(queryClient);
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
