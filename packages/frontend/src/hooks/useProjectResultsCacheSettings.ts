import {
    type ApiError,
    type ApiExploresResultsCacheInvalidationResponse,
    type ApiResultsCacheInvalidationResponse,
    type ApiResultsCacheProjectSettingsResponse,
    type ApiResultsCacheStatusResponse,
    type InvalidateExploresResultsCache,
    type UpdateResultsCacheClearSchedule,
    type UpdateResultsCacheProjectSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const queryKey = (projectUuid: string) => [
    'results_cache_settings',
    projectUuid,
];

const statusQueryKey = (projectUuid: string) => [
    'results_cache_status',
    projectUuid,
];

const getResultsCacheStatus = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiResultsCacheStatusResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config/status`,
        method: 'GET',
        body: undefined,
    });

const useResultsCacheStatus = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiResultsCacheStatusResponse['results'], ApiError>({
        queryKey: statusQueryKey(projectUuid ?? ''),
        queryFn: () => getResultsCacheStatus(lightdashApi, projectUuid!),
        enabled: !!projectUuid,
        // Only changes through the settings mutation, which invalidates it
        staleTime: Infinity,
    });
};

export const useIsResultsCacheEnabled = (projectUuid: string | undefined) =>
    useResultsCacheStatus(projectUuid).data?.enabled === true;

const getResultsCacheSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiResultsCacheProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config`,
        method: 'GET',
        body: undefined,
    });

export const useResultsCacheSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<
        ApiResultsCacheProjectSettingsResponse['results'],
        ApiError
    >({
        queryKey: queryKey(projectUuid),
        queryFn: () => getResultsCacheSettings(lightdashApi, projectUuid),
        enabled: !!projectUuid,
    });
};

const updateResultsCacheSettings = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: UpdateResultsCacheProjectSettings,
) =>
    lightdashApi<ApiResultsCacheProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateResultsCacheSettings = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiResultsCacheProjectSettingsResponse['results'],
        ApiError,
        UpdateResultsCacheProjectSettings
    >((data) => updateResultsCacheSettings(lightdashApi, projectUuid, data), {
        mutationKey: ['results_cache_settings_update', projectUuid],
        onSuccess: async (_, data) => {
            showToastSuccess({
                title:
                    data.cacheEnabled === undefined
                        ? 'Cache duration updated'
                        : `Results caching ${
                              data.cacheEnabled ? 'enabled' : 'disabled'
                          }`,
            });
            await Promise.all([
                queryClient.invalidateQueries(queryKey(projectUuid)),
                queryClient.invalidateQueries(statusQueryKey(projectUuid)),
            ]);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update results caching',
                apiError: error,
            });
        },
    });
};

const updateResultsCacheClearSchedule = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: UpdateResultsCacheClearSchedule,
) =>
    lightdashApi<ApiResultsCacheProjectSettingsResponse['results']>({
        url: `/projects/${projectUuid}/results-cache-config/clear-schedule`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateResultsCacheClearSchedule = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiResultsCacheProjectSettingsResponse['results'],
        ApiError,
        UpdateResultsCacheClearSchedule
    >(
        (data) =>
            updateResultsCacheClearSchedule(lightdashApi, projectUuid, data),
        {
            mutationKey: ['results_cache_clear_schedule_update', projectUuid],
            onSuccess: async () => {
                showToastSuccess({
                    title: 'Clear schedule updated',
                });
                await queryClient.invalidateQueries(queryKey(projectUuid));
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update clear schedule',
                    apiError: error,
                });
            },
        },
    );
};

const invalidateResultsCache = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
) =>
    lightdashApi<ApiResultsCacheInvalidationResponse['results']>({
        url: `/projects/${projectUuid}/results-cache/invalidate`,
        method: 'POST',
        body: undefined,
    });

export const useInvalidateResultsCache = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiResultsCacheInvalidationResponse['results'],
        ApiError
    >(() => invalidateResultsCache(lightdashApi, projectUuid), {
        mutationKey: ['results_cache_invalidate', projectUuid],
        onSuccess: async () => {
            showToastSuccess({
                title: 'Cached results cleared',
            });
            await queryClient.invalidateQueries(queryKey(projectUuid));
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear cached results',
                apiError: error,
            });
        },
    });
};

export type ResultsCacheContent = {
    type: 'chart' | 'dashboard';
    uuid: string;
};

const CONTENT_ROUTES: Record<ResultsCacheContent['type'], string> = {
    chart: 'saved',
    dashboard: 'dashboards',
};

const invalidateContentResultsCache = async (
    lightdashApi: LightdashApi,
    { type, uuid }: ResultsCacheContent,
) =>
    lightdashApi<ApiResultsCacheInvalidationResponse['results']>({
        url: `/${CONTENT_ROUTES[type]}/${uuid}/results-cache/invalidate`,
        method: 'POST',
        version: 'v2',
        body: undefined,
    });

export const useInvalidateContentResultsCache = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiResultsCacheInvalidationResponse['results'],
        ApiError,
        ResultsCacheContent
    >((content) => invalidateContentResultsCache(lightdashApi, content), {
        mutationKey: ['results_cache_invalidate_content'],
        onSuccess: () => {
            showToastSuccess({
                title: 'Cached results cleared',
                subtitle: 'The next load queries the warehouse.',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to clear cached results',
                apiError: error,
            });
        },
    });
};

const invalidateExploresResultsCache = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    body: InvalidateExploresResultsCache,
) =>
    lightdashApi<ApiExploresResultsCacheInvalidationResponse['results']>({
        url: `/projects/${projectUuid}/results-cache/invalidate/explores`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useInvalidateExploresResultsCache = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiExploresResultsCacheInvalidationResponse['results'],
        ApiError,
        InvalidateExploresResultsCache
    >(
        (body) =>
            invalidateExploresResultsCache(lightdashApi, projectUuid, body),
        {
            mutationKey: ['results_cache_invalidate_explores', projectUuid],
            onSuccess: ({ exploreNames }) => {
                showToastSuccess({
                    title:
                        exploreNames.length === 1
                            ? 'Cached results cleared'
                            : `Cached results cleared for ${exploreNames.length} explores`,
                    subtitle: 'The next load queries the warehouse.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to clear cached results',
                    apiError: error,
                });
            },
        },
    );
};
