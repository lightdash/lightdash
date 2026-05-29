import {
    type AiAgentAdminFilters,
    type AiAgentAdminSort,
    type AiAgentReviewItemStatus,
    type ApiAiAgentAdminConversationsResponse,
    type ApiAiAgentReviewItemResponse,
    type ApiAiAgentReviewItemsResponse,
    type ApiAiAgentReviewSignalsResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentVerifiedArtifactsResponse,
    type ApiError,
    type UpdateAiAgentReviewItemStatus,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseInfiniteQueryOptions,
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

export const useAiAgentAdminReviewItems = (
    args: { statuses?: AiAgentReviewItemStatus[] },
    options?: { enabled?: boolean },
) => {
    return useQuery<ApiAiAgentReviewItemsResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-review-items', args],
        queryFn: () => getAiAgentAdminReviewItems(args),
        keepPreviousData: true,
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
        onSuccess: () => {
            showToastSuccess({ title: 'Review item updated' });
            void queryClient.invalidateQueries({
                queryKey: ['ai-agent-admin-review-items'],
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
            showToastSuccess({
                title: reviewItem.linkedPrUrl
                    ? 'Pull request opened'
                    : 'Writeback ran — no changes were needed',
                ...(reviewItem.linkedPrUrl && {
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
