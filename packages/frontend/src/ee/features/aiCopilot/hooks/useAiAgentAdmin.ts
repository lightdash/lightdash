import {
    type AiAgentAdminFilters,
    type AiAgentAdminSort,
    type AiAgentReviewItemSummary,
    type AiAgentReviewItemStatus,
    type ApiAiAgentAdminConversationsResponse,
    type ApiAiAgentReviewItemActivityResponse,
    type ApiAiAgentReviewItemPrDiffResponse,
    type ApiAiAgentReviewItemResponse,
    type ApiAiAgentReviewItemsResponse,
    type ApiAiAgentReviewItemWritebackPreviewResponse,
    type ApiAiAgentReviewSignalsResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentVerifiedArtifactsResponse,
    type ApiError,
    type ApiUpstreamDiffResponse,
    type UpdateAiAgentReviewItemAssignee,
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
                if ((error as ApiError).error?.statusCode === 404) return null;
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
            showToastSuccess({ title: 'Review item updated' });
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
                title: 'Failed to update review item',
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
            showToastSuccess({ title: 'Assignee updated' });
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
                title: 'Failed to update assignee',
                apiError: error,
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
            title: 'Writeback queued',
            subtitle: 'The review item will update as it runs.',
        };
    }

    if (reviewItem.linkedPrUrl) {
        return { title: 'Pull request opened' };
    }

    if (reviewItem.prWritebackStatus === 'completed') {
        return {
            title: 'Writeback completed',
            subtitle: reviewItem.prWritebackMessage ?? undefined,
        };
    }

    return { title: 'Writeback queued' };
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
                        children: 'View pull request',
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
                title: 'Failed to open pull request',
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
