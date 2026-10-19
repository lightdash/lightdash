import {
    type ApiAiOrganizationRuntimeSettingsResponse,
    type ApiAiOrganizationSettingsResponse,
    type ApiAiThreadRetentionPreviewResponse,
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
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';

const resolveAiAgentMemoryEnabled = (
    settings:
        | Pick<
              ApiAiOrganizationRuntimeSettingsResponse['results'],
              'aiAgentMemoryEnabled'
          >
        | undefined,
): boolean => settings?.aiAgentMemoryEnabled ?? false;

const getAiOrganizationSettings = async (lightdashApi: LightdashApi) => {
    return lightdashApi<ApiAiOrganizationRuntimeSettingsResponse['results']>({
        url: `/aiAgents/settings`,
        method: 'GET',
        body: undefined,
    });
};

const getAiOrganizationAdminSettings = async (lightdashApi: LightdashApi) =>
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
    const lightdashApi = useLightdashApi();

    const isEmbed = useIsEmbedded();
    return useQuery<
        ApiAiOrganizationRuntimeSettingsResponse['results'],
        ApiError
    >({
        queryKey: aiOrganizationRuntimeSettingsQueryKey,
        queryFn: () => getAiOrganizationSettings(lightdashApi),
        keepPreviousData: true,
        ...queryOptions,
        enabled: !isEmbed && queryOptions?.enabled !== false,
    });
};

export const useAiOrganizationAdminSettings = (
    queryOptions?: UseQueryOptions<
        ApiAiOrganizationSettingsResponse['results'],
        ApiError
    >,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiOrganizationSettingsResponse['results'], ApiError>({
        queryKey: aiOrganizationAdminSettingsQueryKey,
        queryFn: () => getAiOrganizationAdminSettings(lightdashApi),
        keepPreviousData: true,
        ...queryOptions,
    });
};

export const useAiAgentMemoryEnabled = (): boolean => {
    const { data: settings } = useAiOrganizationSettings();
    return resolveAiAgentMemoryEnabled(settings);
};

const updateAiOrganizationSettings = async (
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();

    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiUpdateAiOrganizationSettingsResponse['results'],
        ApiError,
        UpdateAiOrganizationSettings
    >({
        mutationFn: (data: UpdateAiOrganizationSettings) =>
            updateAiOrganizationSettings(lightdashApi, data),
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

const getAiThreadRetentionPreview = async (
    lightdashApi: LightdashApi,
    retentionHours: number,
) => {
    const params = new URLSearchParams({
        retentionHours: String(retentionHours),
    });
    return lightdashApi<ApiAiThreadRetentionPreviewResponse['results']>({
        url: `/aiAgents/admin/settings/thread-retention-preview?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

/**
 * What an org retention window of `retentionHours` would delete on the next
 * cleanup run. Backs the confirmation dialog shown before tightening the org
 * ceiling; only fetched while the dialog needs it (`enabled`).
 */
export const useAiThreadRetentionPreview = (
    retentionHours: number | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiThreadRetentionPreviewResponse['results'], ApiError>({
        queryKey: ['ai-thread-retention-preview', retentionHours],
        queryFn: () =>
            getAiThreadRetentionPreview(lightdashApi, retentionHours!),
        enabled: retentionHours !== undefined,
    });
};
