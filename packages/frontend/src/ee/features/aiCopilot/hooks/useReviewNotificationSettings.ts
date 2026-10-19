import {
    type AiReviewJiraBackfillResult,
    type AiReviewJiraRouting,
    type AiReviewLinearBackfillResult,
    type AiReviewLinearRouting,
    type ApiAiReviewJiraBackfillResponse,
    type ApiAiReviewJiraRoutingResponse,
    type ApiAiReviewLinearBackfillResponse,
    type ApiAiReviewLinearRoutingResponse,
    type ApiAiReviewNotificationSettingsResponse,
    type ApiError,
    type UpdateAiReviewJiraRouting,
    type UpdateAiReviewLinearRouting,
    type UpdateAiReviewNotificationSettings,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

type Settings = ApiAiReviewNotificationSettingsResponse['results'];

const QUERY_KEY = ['ai-review-notification-settings'];
const LINEAR_ROUTING_QUERY_KEY = ['ai-review-linear-routing'];
const JIRA_ROUTING_QUERY_KEY = ['ai-review-jira-routing'];

const getReviewNotificationSettings = async (lightdashApi: LightdashApi) =>
    lightdashApi<Settings>({
        url: `/aiAgents/admin/review-notification-settings`,
        method: 'GET',
        body: undefined,
    });

export const useReviewNotificationSettings = (
    queryOptions?: UseQueryOptions<Settings, ApiError>,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Settings, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: () => getReviewNotificationSettings(lightdashApi),
        keepPreviousData: true,
        ...queryOptions,
    });
};

const updateReviewNotificationSettings = async (
    lightdashApi: LightdashApi,
    data: UpdateAiReviewNotificationSettings,
) =>
    lightdashApi<Settings>({
        url: `/aiAgents/admin/review-notification-settings`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateReviewNotificationSettings = (
    mutationOptions?: UseMutationOptions<
        Settings,
        ApiError,
        UpdateAiReviewNotificationSettings
    >,
) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<Settings, ApiError, UpdateAiReviewNotificationSettings>({
        mutationFn: (data: UpdateAiReviewNotificationSettings) =>
            updateReviewNotificationSettings(lightdashApi, data),
        onSuccess: async (data, variables, context) => {
            showToastSuccess({
                title: 'Success! Review notification settings updated',
            });
            queryClient.setQueryData<Settings | undefined>(
                QUERY_KEY,
                (previous) => (previous ? { ...previous, ...data } : data),
            );
            await queryClient.invalidateQueries(QUERY_KEY);
            mutationOptions?.onSuccess?.(data, variables, context);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update review notification settings',
                apiError: error,
            });
        },
    });
};

const getReviewLinearRouting = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiAiReviewLinearRoutingResponse['results']>({
        url: `/aiAgents/admin/review-linear-routing`,
        method: 'GET',
        body: undefined,
    });

export const useReviewLinearRouting = (options?: { enabled?: boolean }) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AiReviewLinearRouting, ApiError>({
        queryKey: LINEAR_ROUTING_QUERY_KEY,
        queryFn: () => getReviewLinearRouting(lightdashApi),
        enabled: options?.enabled ?? true,
        keepPreviousData: true,
    });
};

const updateReviewLinearRouting = async (
    lightdashApi: LightdashApi,
    data: UpdateAiReviewLinearRouting,
) =>
    lightdashApi<AiReviewLinearRouting>({
        url: `/aiAgents/admin/review-linear-routing`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateReviewLinearRouting = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        AiReviewLinearRouting,
        ApiError,
        UpdateAiReviewLinearRouting
    >({
        mutationFn: (data: UpdateAiReviewLinearRouting) =>
            updateReviewLinearRouting(lightdashApi, data),
        onSuccess: async (routing) => {
            queryClient.setQueryData(LINEAR_ROUTING_QUERY_KEY, routing);
            showToastSuccess({ title: 'Linear destination updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update Linear destination',
                apiError: error,
            });
        },
    });
};

const backfillReviewLinearIssues = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiAiReviewLinearBackfillResponse['results']>({
        url: `/aiAgents/admin/review-linear-issues/backfill`,
        method: 'POST',
        body: undefined,
    });

export const useBackfillReviewLinearIssues = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<AiReviewLinearBackfillResult, ApiError, void>({
        mutationFn: () => backfillReviewLinearIssues(lightdashApi),
        onSuccess: (result) => {
            showToastSuccess({
                title:
                    result.queuedCount === 0
                        ? 'No existing findings needed a Linear issue'
                        : `Creating Linear issues for ${result.queuedCount} existing ${
                              result.queuedCount === 1 ? 'finding' : 'findings'
                          }`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to export existing findings to Linear',
                apiError: error,
            });
        },
    });
};

const getReviewJiraRouting = async (lightdashApi: LightdashApi) =>
    lightdashApi<ApiAiReviewJiraRoutingResponse['results']>({
        url: '/aiAgents/admin/review-jira-routing',
        method: 'GET',
        body: undefined,
    });

export const useReviewJiraRouting = (options?: { enabled?: boolean }) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AiReviewJiraRouting, ApiError>({
        queryKey: JIRA_ROUTING_QUERY_KEY,
        queryFn: () => getReviewJiraRouting(lightdashApi),
        enabled: options?.enabled ?? true,
        keepPreviousData: true,
    });
};

export const useUpdateReviewJiraRouting = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiReviewJiraRouting,
        ApiError,
        UpdateAiReviewJiraRouting
    >({
        mutationFn: (data) =>
            lightdashApi<AiReviewJiraRouting>({
                url: '/aiAgents/admin/review-jira-routing',
                method: 'PUT',
                body: JSON.stringify(data),
            }),
        onSuccess: (routing) => {
            queryClient.setQueryData(JIRA_ROUTING_QUERY_KEY, routing);
            showToastSuccess({ title: 'Jira destination updated' });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update Jira destination',
                apiError: error,
            }),
    });
};

export const useBackfillReviewJiraIssues = () => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<AiReviewJiraBackfillResult, ApiError, void>({
        mutationFn: () =>
            lightdashApi<ApiAiReviewJiraBackfillResponse['results']>({
                url: '/aiAgents/admin/review-jira-issues/backfill',
                method: 'POST',
                body: undefined,
            }),
        onSuccess: (result) =>
            showToastSuccess({
                title:
                    result.queuedCount === 0
                        ? 'No existing findings needed a Jira issue'
                        : `Creating Jira issues for ${result.queuedCount} existing ${
                              result.queuedCount === 1 ? 'finding' : 'findings'
                          }`,
            }),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to export existing findings to Jira',
                apiError: error,
            }),
    });
};
