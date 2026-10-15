import {
    isApiError,
    type AiAgentAdminEvalFilters,
    type AiAgentAdminFilters,
    type AiAgentAdminMemoryFilters,
    type AiAgentAdminMemorySort,
    type AiAgentAdminSort,
    type AiAgentReviewItemSummary,
    type AiAgentReviewItemStatus,
    type AiAgentThreadDump,
    type ApiAiAgentAdminConversationsResponse,
    type ApiAiAgentAdminEvalPromptsResponse,
    type ApiAiAgentAdminEvalsResponse,
    type ApiAiAgentAdminMemoriesResponse,
    type ApiAiAgentAdminPromptActivityResponse,
    type ApiAiAgentReviewItemActivityResponse,
    type ApiAiAgentReviewItemPrDiffResponse,
    type ApiAiAgentReviewItemResponse,
    type ApiAiAgentReviewItemsResponse,
    type ApiAiAgentReviewItemWritebackPreviewResponse,
    type ApiAiAgentReviewSignalsResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentThreadDumpResponse,
    type ApiAiAgentVerifiedArtifactsResponse,
    type ApiError,
    type ApiUpstreamDiffResponse,
    type CreateAiAgentReviewItemComment,
    type CreateAiAgentReviewItem,
    type ReorderAiAgentReviewItems,
    type UpdateAiAgentReviewItemAssignee,
    type UpdateAiAgentReviewItemPriority,
    type UpdateAiAgentReviewItemStatus,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
    type UseInfiniteQueryOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

export type AiAgentAdminThreadsArgs = {
    filters: AiAgentAdminFilters;
    sort: AiAgentAdminSort;
    pagination: {
        pageSize?: number;
        page?: number;
    };
};

function createQueryString(params: Record<string, any>): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((v) => query.append(key, v));
        } else if (value !== undefined) {
            query.append(key, value.toString());
        }
    }
    return query.toString();
}

const getAiAgentAdminThreads = async (
    args: AiAgentAdminFilters & {
        sortField: AiAgentAdminSort['field'];
        sortDirection: AiAgentAdminSort['direction'];
    } & {
        pageSize?: number;
        page?: number;
    },
) => {
    const params = createQueryString(args);
    return lightdashApi<ApiAiAgentAdminConversationsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/threads?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteAiAgentAdminThreads = (
    args: AiAgentAdminThreadsArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiAiAgentAdminConversationsResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<
        ApiAiAgentAdminConversationsResponse['results'],
        ApiError
    >({
        queryKey: ['ai-agent-admin-threads', args],
        queryFn: async ({ pageParam }) => {
            return getAiAgentAdminThreads({
                ...args.filters,
                ...(args.sort && {
                    sortField: args.sort.field,
                    sortDirection: args.sort.direction,
                }),
                ...args.pagination,
                page: (pageParam as number) ?? 1,
            });
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });
};

export type AiAgentAdminEvalsArgs = {
    filters: AiAgentAdminEvalFilters;
    sort: AiAgentAdminSort;
    pagination: {
        pageSize?: number;
        page?: number;
    };
};

const getAiAgentAdminEvals = async (
    args: AiAgentAdminEvalFilters & {
        sortField: AiAgentAdminSort['field'];
        sortDirection: AiAgentAdminSort['direction'];
    } & {
        pageSize?: number;
        page?: number;
    },
) => {
    const params = createQueryString(args);
    return lightdashApi<ApiAiAgentAdminEvalsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/evals?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteAiAgentAdminEvals = (
    args: AiAgentAdminEvalsArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiAiAgentAdminEvalsResponse['results'],
        ApiError
    > = {},
) =>
    useInfiniteQuery<ApiAiAgentAdminEvalsResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-evals', args],
        queryFn: ({ pageParam }) =>
            getAiAgentAdminEvals({
                ...args.filters,
                sortField: args.sort.field,
                sortDirection: args.sort.direction,
                ...args.pagination,
                page: (pageParam as number) ?? 1,
            }),
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });

const getAiAgentAdminEvalPrompts = async (evalUuid: string) =>
    lightdashApi<ApiAiAgentAdminEvalPromptsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/evals/${encodeURIComponent(evalUuid)}/prompts`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgentAdminEvalPrompts = (evalUuid: string | undefined) =>
    useQuery<ApiAiAgentAdminEvalPromptsResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-eval-prompts', evalUuid],
        queryFn: () => getAiAgentAdminEvalPrompts(evalUuid!),
        enabled: !!evalUuid,
        staleTime: 30 * 1000,
    });

export type AiAgentAdminMemoriesArgs = {
    filters: AiAgentAdminMemoryFilters;
    sort: AiAgentAdminMemorySort;
    pagination: {
        pageSize?: number;
        page?: number;
    };
};

const getAiAgentAdminMemories = async (
    args: AiAgentAdminMemoryFilters & {
        sortField: AiAgentAdminMemorySort['field'];
        sortDirection: AiAgentAdminMemorySort['direction'];
    } & {
        pageSize?: number;
        page?: number;
    },
) => {
    const params = createQueryString(args);
    return lightdashApi<ApiAiAgentAdminMemoriesResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/memories?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteAiAgentAdminMemories = (
    args: AiAgentAdminMemoriesArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiAiAgentAdminMemoriesResponse['results'],
        ApiError
    > = {},
) =>
    useInfiniteQuery<ApiAiAgentAdminMemoriesResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-memories', args],
        queryFn: ({ pageParam }) =>
            getAiAgentAdminMemories({
                ...args.filters,
                sortField: args.sort.field,
                sortDirection: args.sort.direction,
                ...args.pagination,
                page: (pageParam as number) ?? 1,
            }),
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });

const getAiAgentAdminProjectPromptActivity = async ({
    projectUuid,
    days,
}: {
    projectUuid: string;
    days: number;
}) => {
    const params = createQueryString({ days });

    return lightdashApi<ApiAiAgentAdminPromptActivityResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/projects/${encodeURIComponent(
            projectUuid,
        )}/prompt-activity?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentAdminProjectPromptActivity = (
    projectUuid: string,
    days: number,
    options?: { enabled?: boolean },
) =>
    useQuery<ApiAiAgentAdminPromptActivityResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-project-prompt-activity', projectUuid, days],
        queryFn: () =>
            getAiAgentAdminProjectPromptActivity({ projectUuid, days }),
        keepPreviousData: true,
        staleTime: 60 * 1000,
        enabled: options?.enabled ?? true,
    });

const getAiAgentAdminAgents = async () => {
    return lightdashApi<ApiAiAgentSummaryResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/agents`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentAdminAgents = (options?: { enabled?: boolean }) => {
    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-list'],
        queryFn: getAiAgentAdminAgents,
        keepPreviousData: true,
        enabled: options?.enabled ?? true,
    });
};

const getAiAgentAdminReviewItems = async (args: {
    statuses?: AiAgentReviewItemStatus[];
}) => {
    const params = createQueryString({
        status: args.statuses,
    });

    return lightdashApi<ApiAiAgentReviewItemsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items${params ? `?${params}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

const AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY = 'ai-agent-admin-review-items';

const createAiAgentReviewItem = async (body: CreateAiAgentReviewItem) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

const getAiAgentAdminThreadDump = async (threadUuid: string) =>
    lightdashApi<ApiAiAgentThreadDumpResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/threads/${threadUuid}/dump`,
        method: 'GET',
        body: undefined,
    });

export const useDownloadAiAgentAdminThreadDump = () => {
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<AiAgentThreadDump, ApiError, string>({
        mutationFn: getAiAgentAdminThreadDump,
        onSuccess: (dump) => {
            const blob = new Blob([JSON.stringify(dump, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ai-thread-dump-${dump.threadUuid}.json`;
            link.click();
            URL.revokeObjectURL(url);
            showToastSuccess({
                title: i18n.t('toasts.admin.threadDumpDownloaded', {
                    ns: 'aiAgent',
                }),
                subtitle: i18n.t('toasts.admin.threadDumpReview', {
                    ns: 'aiAgent',
                }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.threadDumpFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const deleteAiAgentAdminThread = async (threadUuid: string) =>
    lightdashApi<undefined>({
        version: 'v1',
        url: `/aiAgents/admin/threads/${threadUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentAdminThread = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, string>({
        mutationFn: deleteAiAgentAdminThread,
        onSuccess: () => {
            showToastSuccess({
                title: i18n.t('toasts.threads.deleted', { ns: 'aiAgent' }),
            });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-threads'],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.threads.deleteFailed', { ns: 'aiAgent' }),
                apiError: error,
            });
        },
    });
};

export const useCreateAiAgentReviewItem = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemResponse['results'],
        ApiError,
        CreateAiAgentReviewItem
    >({
        mutationFn: createAiAgentReviewItem,
        onSuccess: (createdItem) => {
            showToastSuccess({
                title: i18n.t('toasts.admin.issueCreated', { ns: 'aiAgent' }),
            });
            queryClient.setQueryData(
                ['ai-agent-admin-review-item', createdItem.fingerprint],
                createdItem,
            );
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.issueCreateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

export const updateCachedReviewItemLists = (
    queryClient: QueryClient,
    updatedItem: AiAgentReviewItemSummary,
) => {
    queryClient
        .getQueryCache()
        .findAll({
            queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
        })
        .forEach((query) => {
            const [, args] = query.queryKey as [
                string,
                { statuses?: AiAgentReviewItemStatus[] } | undefined,
            ];
            const matchesStatus =
                !args?.statuses || args.statuses.includes(updatedItem.status);

            queryClient.setQueryData<ApiAiAgentReviewItemsResponse['results']>(
                query.queryKey,
                (current) => {
                    if (!current) return current;

                    if (!matchesStatus) {
                        return current.filter(
                            (item) =>
                                item.fingerprint !== updatedItem.fingerprint,
                        );
                    }

                    return current.map((item) =>
                        item.fingerprint === updatedItem.fingerprint
                            ? updatedItem
                            : item,
                    );
                },
            );
        });
};

export const useAiAgentAdminReviewItems = (
    args: { statuses?: AiAgentReviewItemStatus[] },
    options?: {
        enabled?: boolean;
        select?: (
            data: ApiAiAgentReviewItemsResponse['results'],
        ) => ApiAiAgentReviewItemsResponse['results'];
    },
) => {
    return useQuery<
        ApiAiAgentReviewItemsResponse['results'],
        ApiError,
        ApiAiAgentReviewItemsResponse['results']
    >({
        queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY, args],
        queryFn: () => getAiAgentAdminReviewItems(args),
        keepPreviousData: true,
        enabled: options?.enabled ?? true,
        select: options?.select,
    });
};

const getAiAgentAdminReviewItem = async (fingerprint: string) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(fingerprint)}`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentAdminReviewItem = (
    fingerprint: string,
    options?: { enabled?: boolean; refetchInterval?: number | false },
) => {
    return useQuery<ApiAiAgentReviewItemResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-review-item', fingerprint],
        queryFn: () => getAiAgentAdminReviewItem(fingerprint),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval,
    });
};

const getAiAgentReviewItemActivity = async (fingerprint: string) => {
    return lightdashApi<ApiAiAgentReviewItemActivityResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            fingerprint,
        )}/activity`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentReviewItemActivity = (
    fingerprint: string,
    options?: {
        enabled?: boolean;
        refetchInterval?: UseQueryOptions<
            ApiAiAgentReviewItemActivityResponse['results'],
            ApiError
        >['refetchInterval'];
    },
) => {
    return useQuery<ApiAiAgentReviewItemActivityResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-review-item-activity', fingerprint],
        queryFn: () => getAiAgentReviewItemActivity(fingerprint),
        enabled: options?.enabled ?? true,
        refetchInterval: options?.refetchInterval,
    });
};

const retestAiAgentReviewRemediation = async (fingerprint: string) => {
    return lightdashApi<ApiAiAgentReviewItemActivityResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            fingerprint,
        )}/retest`,
        method: 'POST',
        body: undefined,
    });
};

export const useRetestAiAgentReviewRemediation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemActivityResponse['results'],
        ApiError,
        { fingerprint: string }
    >({
        mutationFn: ({ fingerprint }) =>
            retestAiAgentReviewRemediation(fingerprint),
        onSuccess: (_data, { fingerprint }) => {
            showToastSuccess({
                title: i18n.t('toasts.admin.retesting', { ns: 'aiAgent' }),
            });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-review-item-activity', fingerprint],
            });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-review-item', fingerprint],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.retestFailed', { ns: 'aiAgent' }),
                apiError: error,
            });
        },
    });
};

const addAiAgentReviewItemComment = async (args: {
    fingerprint: string;
    body: string;
}) => {
    return lightdashApi<ApiAiAgentReviewItemActivityResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            args.fingerprint,
        )}/comments`,
        method: 'POST',
        body: JSON.stringify({
            body: args.body,
        } satisfies CreateAiAgentReviewItemComment),
    });
};

export const useAddAiAgentReviewItemComment = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemActivityResponse['results'],
        ApiError,
        { fingerprint: string; body: string }
    >({
        mutationFn: addAiAgentReviewItemComment,
        onSuccess: (activity, { fingerprint }) => {
            queryClient.setQueryData(
                ['ai-agent-admin-review-item-activity', fingerprint],
                activity,
            );
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.addCommentFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const getAiAgentReviewItemPrDiff = async (fingerprint: string) => {
    return lightdashApi<ApiAiAgentReviewItemPrDiffResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            fingerprint,
        )}/pr-diff`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentReviewItemPrDiff = (
    fingerprint: string,
    options?: { enabled?: boolean },
) => {
    return useQuery<ApiAiAgentReviewItemPrDiffResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-review-item-pr-diff', fingerprint],
        queryFn: () => getAiAgentReviewItemPrDiff(fingerprint),
        enabled: options?.enabled ?? true,
        retry: false,
        // Each fetch costs ~2 GitHub API calls per changed file — keep it warm.
        staleTime: 5 * 60_000,
    });
};

const getProjectUpstreamDiff = async (projectUuid: string) => {
    return lightdashApi<ApiUpstreamDiffResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/upstreamDiff`,
        method: 'GET',
        body: undefined,
    });
};

// Diffs a preview project's fields against the project it was copied from.
// Errors (e.g. project is not a preview) are surfaced via the query state.
export const useProjectUpstreamDiff = (
    projectUuid: string | undefined,
    options?: { enabled?: boolean },
) => {
    return useQuery<ApiUpstreamDiffResponse['results'], ApiError>({
        queryKey: ['project-upstream-diff', projectUuid],
        queryFn: () => getProjectUpstreamDiff(projectUuid!),
        enabled: (options?.enabled ?? true) && !!projectUuid,
        retry: false,
        staleTime: 5 * 60_000,
    });
};

const getAiAgentReviewItemByPreviewThread = async (threadUuid: string) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/by-preview-thread/${encodeURIComponent(
            threadUuid,
        )}`,
        method: 'GET',
        body: undefined,
    });
};

// Resolves the review item a preview work thread belongs to. Most threads
// are not linked to one — a 404 means "regular thread", not an error.
export const useAiAgentReviewItemByPreviewThread = (
    threadUuid: string | undefined,
    options?: { enabled?: boolean },
) => {
    return useQuery<ApiAiAgentReviewItemResponse['results'] | null, ApiError>({
        queryKey: ['ai-agent-admin-review-item-by-preview-thread', threadUuid],
        queryFn: async () => {
            try {
                return await getAiAgentReviewItemByPreviewThread(threadUuid!);
            } catch (error) {
                if (isApiError(error) && error.error.statusCode === 404) {
                    return null;
                }
                throw error;
            }
        },
        enabled: (options?.enabled ?? true) && !!threadUuid,
        retry: false,
    });
};

const getAiAgentReviewItemWritebackPreview = async (fingerprint: string) => {
    return lightdashApi<
        ApiAiAgentReviewItemWritebackPreviewResponse['results']
    >({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            fingerprint,
        )}/writeback-preview`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentReviewItemWritebackPreview = (
    fingerprint: string,
    options?: { enabled?: boolean },
) => {
    return useQuery<
        ApiAiAgentReviewItemWritebackPreviewResponse['results'],
        ApiError
    >({
        queryKey: ['ai-agent-admin-review-item-writeback-preview', fingerprint],
        queryFn: () => getAiAgentReviewItemWritebackPreview(fingerprint),
        enabled: options?.enabled ?? true,
    });
};

const updateAiAgentReviewItemStatus = async (args: {
    fingerprint: string;
    body: UpdateAiAgentReviewItemStatus;
}) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            args.fingerprint,
        )}`,
        method: 'PATCH',
        body: JSON.stringify(args.body),
    });
};

export const useUpdateAiAgentReviewItemStatus = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemResponse['results'],
        ApiError,
        { fingerprint: string; body: UpdateAiAgentReviewItemStatus }
    >({
        mutationFn: updateAiAgentReviewItemStatus,
        onSuccess: (updatedItem, { fingerprint }) => {
            showToastSuccess({
                title: i18n.t('toasts.admin.reviewItemUpdated', {
                    ns: 'aiAgent',
                }),
            });
            queryClient.setQueryData(
                ['ai-agent-admin-review-item', fingerprint],
                updatedItem,
            );
            updateCachedReviewItemLists(queryClient, updatedItem);
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
            });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-review-item-by-preview-thread'],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.reviewItemUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const updateAiAgentReviewItemAssignee = async (args: {
    fingerprint: string;
    assignedToUserUuid: string | null;
}) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(args.fingerprint)}/assignee`,
        method: 'PATCH',
        body: JSON.stringify({
            assignedToUserUuid: args.assignedToUserUuid,
        } satisfies UpdateAiAgentReviewItemAssignee),
    });
};

export const useUpdateAiAgentReviewItemAssignee = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemResponse['results'],
        ApiError,
        { fingerprint: string; assignedToUserUuid: string | null }
    >({
        mutationFn: updateAiAgentReviewItemAssignee,
        onSuccess: (updatedItem, { fingerprint }) => {
            showToastSuccess({
                title: i18n.t('toasts.admin.assigneeUpdated', {
                    ns: 'aiAgent',
                }),
            });
            queryClient.setQueryData(
                ['ai-agent-admin-review-item', fingerprint],
                updatedItem,
            );
            updateCachedReviewItemLists(queryClient, updatedItem);
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.assigneeUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const updateAiAgentReviewItemPriority = async (args: {
    fingerprint: string;
    priority: UpdateAiAgentReviewItemPriority['priority'];
}) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(args.fingerprint)}/priority`,
        method: 'PATCH',
        body: JSON.stringify({
            priority: args.priority,
        } satisfies UpdateAiAgentReviewItemPriority),
    });
};

export const useUpdateAiAgentReviewItemPriority = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemResponse['results'],
        ApiError,
        {
            fingerprint: string;
            priority: UpdateAiAgentReviewItemPriority['priority'];
        }
    >({
        mutationFn: updateAiAgentReviewItemPriority,
        onSuccess: (updatedItem, { fingerprint }) => {
            showToastSuccess({
                title: i18n.t('toasts.admin.priorityUpdated', {
                    ns: 'aiAgent',
                }),
            });
            queryClient.setQueryData(
                ['ai-agent-admin-review-item', fingerprint],
                updatedItem,
            );
            updateCachedReviewItemLists(queryClient, updatedItem);
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.priorityUpdateFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const reorderAiAgentReviewItems = async (orderedFingerprints: string[]) => {
    return lightdashApi<undefined>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/reorder`,
        method: 'PATCH',
        body: JSON.stringify({
            orderedFingerprints,
        } satisfies ReorderAiAgentReviewItems),
    });
};

// Reorders the cached review-item lists so the dragged fingerprints take the
// given order at the slots they already occupy (other items stay put). Since
// the board buckets a flat array into lanes by array order, this reflects a
// drag-reorder without refetching.
const reorderCachedItems = (
    items: AiAgentReviewItemSummary[],
    orderedFingerprints: string[],
): AiAgentReviewItemSummary[] => {
    const orderSet = new Set(orderedFingerprints);
    const byFingerprint = new Map(
        items
            .filter((item) => orderSet.has(item.fingerprint))
            .map((item) => [item.fingerprint, item]),
    );
    let next = 0;
    return items.map((item) => {
        if (!orderSet.has(item.fingerprint)) return item;
        const replacement = byFingerprint.get(orderedFingerprints[next]);
        next += 1;
        return replacement ?? item;
    });
};

// Applies a drop to the cached review-item lists synchronously: reorders the
// dragged fingerprints into the given order at the slots they occupy, and (for a
// cross-lane drop) moves the dragged item to the target lane by overriding its
// status. Call this in the drop handler in the same tick the drag's transient
// order is cleared, so the board hands off to the server-derived lanes in one
// commit — without it the board flashes back to the pre-drop order for a frame.
export const applyOptimisticReviewBoardOrder = (
    queryClient: QueryClient,
    orderedFingerprints: string[],
    statusOverride: {
        fingerprint: string;
        status: AiAgentReviewItemStatus;
    } | null,
) => {
    queryClient.setQueriesData<AiAgentReviewItemSummary[]>(
        { queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY] },
        (old) => {
            if (!old) return old;
            const withStatus = statusOverride
                ? old.map((item) =>
                      item.fingerprint === statusOverride.fingerprint
                          ? { ...item, status: statusOverride.status }
                          : item,
                  )
                : old;
            return reorderCachedItems(withStatus, orderedFingerprints);
        },
    );
};

// Persists the board order. The optimistic update is applied synchronously by
// the drop handler (applyOptimisticReviewBoardOrder); here we just write through
// and reconcile to the authoritative order on settle (which also reverts the
// optimistic order if the request failed).
export const useReorderReviewItems = () => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, string[]>({
        mutationFn: reorderAiAgentReviewItems,
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.reorderFailed', { ns: 'aiAgent' }),
                apiError: error,
            });
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENT_ADMIN_REVIEW_ITEMS_QUERY_KEY],
            });
        },
    });
};

const createAiAgentReviewItemWriteback = async (fingerprint: string) => {
    return lightdashApi<ApiAiAgentReviewItemResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-items/${encodeURIComponent(
            fingerprint,
        )}/writeback`,
        method: 'POST',
        body: undefined,
    });
};

export const getReviewItemWritebackSuccessToast = (
    reviewItem: Pick<
        AiAgentReviewItemSummary,
        'linkedPrUrl' | 'prWritebackMessage' | 'prWritebackStatus'
    >,
): { title: string; subtitle?: string } => {
    const isInProgress =
        reviewItem.prWritebackStatus === 'queued' ||
        reviewItem.prWritebackStatus === 'running';
    if (isInProgress) {
        return {
            title: i18n.t('toasts.admin.writebackQueued', { ns: 'aiAgent' }),
            subtitle: i18n.t('toasts.admin.writebackQueuedSubtitle', {
                ns: 'aiAgent',
            }),
        };
    }

    if (reviewItem.linkedPrUrl) {
        return {
            title: i18n.t('toasts.admin.pullRequestOpened', { ns: 'aiAgent' }),
        };
    }

    if (reviewItem.prWritebackStatus === 'completed') {
        return {
            title: i18n.t('toasts.admin.writebackCompleted', { ns: 'aiAgent' }),
            subtitle: reviewItem.prWritebackMessage ?? undefined,
        };
    }

    return { title: i18n.t('toasts.admin.writebackQueued', { ns: 'aiAgent' }) };
};

export const useCreateAiAgentReviewItemWriteback = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentReviewItemResponse['results'],
        ApiError,
        string
    >({
        mutationFn: createAiAgentReviewItemWriteback,
        onSuccess: (reviewItem) => {
            const toast = getReviewItemWritebackSuccessToast(reviewItem);
            const showPrAction =
                Boolean(reviewItem.linkedPrUrl) &&
                reviewItem.prWritebackStatus !== 'queued' &&
                reviewItem.prWritebackStatus !== 'running';
            showToastSuccess({
                ...toast,
                ...(showPrAction && {
                    action: {
                        children: i18n.t('toasts.admin.viewPullRequest', {
                            ns: 'aiAgent',
                        }),
                        icon: IconArrowRight,
                        onClick: () =>
                            window.open(reviewItem.linkedPrUrl!, '_blank'),
                    },
                }),
            });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-review-items'],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.admin.openPullRequestFailed', {
                    ns: 'aiAgent',
                }),
                apiError: error,
            });
        },
    });
};

const getAiAgentAdminReviewSignals = async () => {
    return lightdashApi<ApiAiAgentReviewSignalsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-signals`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentAdminReviewSignals = (options?: {
    enabled?: boolean;
}) => {
    return useQuery<ApiAiAgentReviewSignalsResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-review-signals'],
        queryFn: getAiAgentAdminReviewSignals,
        keepPreviousData: true,
        enabled: options?.enabled ?? true,
    });
};

const getAiAgentAdminEmbedToken = async () => {
    return lightdashApi<{ token: string; url: string }>({
        version: 'v1',
        url: `/aiAgents/admin/embed-token`,
        method: 'GET',
        body: undefined,
    });
};

export const useAiAgentAdminEmbedToken = () => {
    return useQuery<{ token: string; url: string }, ApiError>({
        queryKey: ['ai-agent-admin-embed-token'],
        queryFn: getAiAgentAdminEmbedToken,
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        staleTime: 30 * 60 * 1000, // 30 minutes (token expires in 1 hour)
    });
};

const getVerifiedArtifacts = async ({
    projectUuid,
    agentUuid,
    page,
    pageSize,
}: {
    projectUuid: string;
    agentUuid: string;
    page?: number;
    pageSize?: number;
}) => {
    const params = createQueryString({ page, pageSize });
    return lightdashApi<ApiAiAgentVerifiedArtifactsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/verified-artifacts${
            params ? `?${params}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteVerifiedArtifacts = (
    projectUuid: string,
    agentUuid: string,
    pagination: { pageSize?: number; page?: number },
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiAiAgentVerifiedArtifactsResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<
        ApiAiAgentVerifiedArtifactsResponse['results'],
        ApiError
    >({
        queryKey: [
            'ai-agent-verified-artifacts',
            projectUuid,
            agentUuid,
            pagination,
        ],
        queryFn: async ({ pageParam }) => {
            return getVerifiedArtifacts({
                projectUuid,
                agentUuid,
                ...pagination,
                page: (pageParam as number) ?? 1,
            });
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });
};
