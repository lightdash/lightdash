import {
    type AiAgentAdminFilters,
    type AiAgentAdminSort,
    type ApiAiAgentAdminConversationsResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentVerifiedArtifactsResponse,
    type ApiError,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useQuery,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

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

export const useAiAgentAdminAgents = () => {
    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: ['ai-agent-admin-list'],
        queryFn: getAiAgentAdminAgents,
        keepPreviousData: true,
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
