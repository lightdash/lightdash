import {
    type ApiError,
    type ApiMcpActivityResponse,
    type ApiMcpActivityStatsResponse,
    type McpActivityFilters,
    type McpActivitySort,
    type McpActivityStatsFilters,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useQuery,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

export type McpActivityArgs = {
    filters: McpActivityFilters;
    sort: McpActivitySort;
    pagination: {
        pageSize?: number;
        page?: number;
    };
};

function createQueryString(params: Record<string, unknown>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((v) => query.append(key, String(v)));
        } else if (value !== undefined) {
            query.append(key, String(value));
        }
    }
    return query.toString();
}

const getMcpActivity = async (
    lightdashApi: LightdashApi,
    args: McpActivityFilters & {
        sortField: McpActivitySort['field'];
        sortDirection: McpActivitySort['direction'];
    } & {
        pageSize?: number;
        page?: number;
    },
) => {
    const params = createQueryString(args);
    return lightdashApi<ApiMcpActivityResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/mcp-activity?${params}`,
        method: 'GET',
        body: undefined,
    });
};

const getMcpActivityStats = async (
    lightdashApi: LightdashApi,
    filters: McpActivityStatsFilters,
) => {
    const params = createQueryString(filters);
    return lightdashApi<ApiMcpActivityStatsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/mcp-activity/stats?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMcpActivityStats = (filters: McpActivityStatsFilters) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiMcpActivityStatsResponse['results'], ApiError>({
        queryKey: ['mcp-activity-stats', filters],
        queryFn: () => getMcpActivityStats(lightdashApi, filters),
        keepPreviousData: true,
    });
};

export const useInfiniteMcpActivity = (
    args: McpActivityArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiMcpActivityResponse['results'],
        ApiError
    > = {},
) => {
    const lightdashApi = useLightdashApi();
    return useInfiniteQuery<ApiMcpActivityResponse['results'], ApiError>({
        queryKey: ['mcp-activity', args],
        queryFn: async ({ pageParam }) => {
            return getMcpActivity(lightdashApi, {
                ...args.filters,
                sortField: args.sort.field,
                sortDirection: args.sort.direction,
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
