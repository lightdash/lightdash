import {
    type AiAgentAdminFilters,
    type AiAgentAdminSort,
    type ApiAiAgentAdminConversationsResponse,
    type ApiError,
} from '@lightdash/common';
import {
    useInfiniteQuery,
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
