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
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

const reviewApi = lightdashApi; // pragma: allowlist secret

type Settings = ApiAiReviewNotificationSettingsResponse['results'];

const QUERY_KEY = ['ai-review-notification-settings'];
const LINEAR_ROUTING_QUERY_KEY = ['ai-review-linear-routing'];
const JIRA_ROUTING_QUERY_KEY = ['ai-review-jira-routing'];

const getReviewNotificationSettings = async () =>
    lightdashApi<Settings>({
        url: `/aiAgents/admin/review-notification-settings`,
        method: 'GET',
        body: undefined,
    });

export const useReviewNotificationSettings = (
    queryOptions?: UseQueryOptions<Settings, ApiError>,
) =>
    useQuery<Settings, ApiError>({
        queryKey: QUERY_KEY,
        queryFn: getReviewNotificationSettings,
        keepPreviousData: true,
        ...queryOptions,
    });

const updateReviewNotificationSettings = async (
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
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<Settings, ApiError, UpdateAiReviewNotificationSettings>({
        mutationFn: updateReviewNotificationSettings,
        onSuccess: async (data, variables, context) => {
            showToastSuccess({
                title: i18n.t('toasts.reviewNotifications.updated', {
                    ns: 'aiAgent',
                }),
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
                title: i18n.t('toasts.reviewNotifications.updateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const getReviewLinearRouting = async () =>
    reviewApi<ApiAiReviewLinearRoutingResponse['results']>({
        url: `/aiAgents/admin/review-linear-routing`,
        method: 'GET',
        body: undefined,
    });

export const useReviewLinearRouting = (options?: { enabled?: boolean }) =>
    useQuery<AiReviewLinearRouting, ApiError>({
        queryKey: LINEAR_ROUTING_QUERY_KEY,
        queryFn: getReviewLinearRouting,
        enabled: options?.enabled ?? true,
        keepPreviousData: true,
    });

const updateReviewLinearRouting = async (data: UpdateAiReviewLinearRouting) =>
    reviewApi<AiReviewLinearRouting>({
        url: `/aiAgents/admin/review-linear-routing`,
        method: 'PUT',
        body: JSON.stringify(data),
    });

export const useUpdateReviewLinearRouting = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        AiReviewLinearRouting,
        ApiError,
        UpdateAiReviewLinearRouting
    >({
        mutationFn: updateReviewLinearRouting,
        onSuccess: async (routing) => {
            queryClient.setQueryData(LINEAR_ROUTING_QUERY_KEY, routing);
            showToastSuccess({
                title: i18n.t('toasts.reviewNotifications.linearUpdated', {
                    ns: 'aiAgent',
                }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.reviewNotifications.linearUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const backfillReviewLinearIssues = async () =>
    reviewApi<ApiAiReviewLinearBackfillResponse['results']>({
        url: `/aiAgents/admin/review-linear-issues/backfill`,
        method: 'POST',
        body: undefined,
    });

export const useBackfillReviewLinearIssues = () => {
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<AiReviewLinearBackfillResult, ApiError, void>({
        mutationFn: backfillReviewLinearIssues,
        onSuccess: (result) => {
            showToastSuccess({
                title:
                    result.queuedCount === 0
                        ? i18n.t(
                              'toasts.reviewNotifications.linearNoneNeeded',
                              { ns: 'aiAgent' },
                          )
                        : i18n.t('toasts.reviewNotifications.linearCreating', {
                              ns: 'aiAgent',
                              count: result.queuedCount,
                          }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.reviewNotifications.linearExportFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const getReviewJiraRouting = async () =>
    reviewApi<ApiAiReviewJiraRoutingResponse['results']>({
        url: '/aiAgents/admin/review-jira-routing',
        method: 'GET',
        body: undefined,
    });

export const useReviewJiraRouting = (options?: { enabled?: boolean }) =>
    useQuery<AiReviewJiraRouting, ApiError>({
        queryKey: JIRA_ROUTING_QUERY_KEY,
        queryFn: getReviewJiraRouting,
        enabled: options?.enabled ?? true,
        keepPreviousData: true,
    });

export const useUpdateReviewJiraRouting = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        AiReviewJiraRouting,
        ApiError,
        UpdateAiReviewJiraRouting
    >({
        mutationFn: (data) =>
            reviewApi<AiReviewJiraRouting>({
                url: '/aiAgents/admin/review-jira-routing',
                method: 'PUT',
                body: JSON.stringify(data),
            }),
        onSuccess: (routing) => {
            queryClient.setQueryData(JIRA_ROUTING_QUERY_KEY, routing);
            showToastSuccess({
                title: i18n.t('toasts.reviewNotifications.jiraUpdated', {
                    ns: 'aiAgent',
                }),
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.reviewNotifications.jiraUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};

export const useBackfillReviewJiraIssues = () => {
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<AiReviewJiraBackfillResult, ApiError, void>({
        mutationFn: () =>
            reviewApi<ApiAiReviewJiraBackfillResponse['results']>({
                url: '/aiAgents/admin/review-jira-issues/backfill',
                method: 'POST',
                body: undefined,
            }),
        onSuccess: (result) =>
            showToastSuccess({
                title:
                    result.queuedCount === 0
                        ? i18n.t('toasts.reviewNotifications.jiraNoneNeeded', {
                              ns: 'aiAgent',
                          })
                        : i18n.t('toasts.reviewNotifications.jiraCreating', {
                              ns: 'aiAgent',
                              count: result.queuedCount,
                          }),
            }),
        onError: ({ error }) =>
            showToastApiError({
                title: i18n.t('toasts.reviewNotifications.jiraExportFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            }),
    });
};
