import {
    type ApiError,
    type ApiQueryHistoryListResponse,
    type QueryHistoryListFilters,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type InfiniteData,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

export type QueryHistoryListResults = ApiQueryHistoryListResponse['results'];

const createQueryString = (params: Record<string, unknown>): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((entry) => query.append(key, String(entry)));
        } else if (value !== undefined && value !== '') {
            query.append(key, String(value));
        }
    }
    return query.toString();
};

const getQueryHistory = async (
    projectUuid: string,
    filters: QueryHistoryListFilters,
    page: number,
    pageSize: number,
) =>
    lightdashApi<QueryHistoryListResults>({
        version: 'v2',
        url: `/projects/${projectUuid}/query/history?${createQueryString({
            trigger: filters.trigger,
            language: filters.language,
            status: filters.statuses,
            search: filters.search,
            window: filters.window,
            sortBy: filters.sortBy,
            page,
            pageSize,
        })}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Derived from the data being rendered rather than react-query's
 * `hasNextPage`, which resets while `keepPreviousData` shows the old pages.
 */
export const getQueryHistoryHasNextPage = (
    data: InfiniteData<QueryHistoryListResults> | undefined,
): boolean => {
    const pagination = data?.pages[data.pages.length - 1]?.pagination;
    return pagination ? pagination.page < pagination.totalPageCount : false;
};

export const useInfiniteQueryHistory = (
    projectUuid: string | undefined,
    filters: QueryHistoryListFilters,
    pageSize: number,
    infiniteQueryOpts: UseInfiniteQueryOptions<
        QueryHistoryListResults,
        ApiError
    > = {},
) =>
    useInfiniteQuery<QueryHistoryListResults, ApiError>({
        queryKey: ['query-history', projectUuid, filters, pageSize],
        queryFn: ({ pageParam }) =>
            getQueryHistory(
                projectUuid!,
                filters,
                (pageParam as number) ?? 1,
                pageSize,
            ),
        getNextPageParam: (lastPage) => {
            const { pagination } = lastPage;
            if (!pagination) return undefined;
            return pagination.page < pagination.totalPageCount
                ? pagination.page + 1
                : undefined;
        },
        ...infiniteQueryOpts,
        enabled: !!projectUuid && (infiniteQueryOpts.enabled ?? true),
    });
