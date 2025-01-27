import {
    type ApiContentResponse,
    type ApiError,
    type ContentSortByColumns,
    type ContentType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    useQuery,
    type UseInfiniteQueryOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';

export type ContentArgs = {
    projectUuids: string[];
    spaceUuids?: string[];
    contentTypes?: ContentType[];
    pageSize?: number;
    page?: number;
    search?: string;
    sortBy?: ContentSortByColumns;
    sortDirection?: 'asc' | 'desc';
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
const getContent = async (args: ContentArgs) => {
    const params = createQueryString(args);
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useContent = (
    args: ContentArgs,
    useQueryOptions?: UseQueryOptions<
        ApiContentResponse['results'],
        ApiError,
        ResourceViewItem[]
    >,
) => {
    return useQuery<
        ApiContentResponse['results'],
        ApiError,
        ResourceViewItem[]
    >({
        queryKey: ['content', args],
        queryFn: () => getContent(args),
        ...useQueryOptions,
    });
};

export const useInfiniteContent = (
    args: ContentArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiContentResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<ApiContentResponse['results'], ApiError>({
        queryKey: ['content', args],
        queryFn: async ({ pageParam }) => {
            return getContent({
                ...args,
                page: pageParam ?? 1,
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
