import {
    type ApiDataAppActivityResponse,
    type ApiError,
    type DataAppActivityFilters,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type DataAppActivityResults = ApiDataAppActivityResponse['results'];

const createQueryString = (params: Record<string, unknown>): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((entry) => query.append(key, String(entry)));
        } else if (value !== undefined) {
            query.append(key, String(value));
        }
    }
    return query.toString();
};

const getDataAppActivity = async (
    args: DataAppActivityFilters & { page: number },
) =>
    lightdashApi<DataAppActivityResults>({
        version: 'v1',
        url: `/ee/org/apps/activity?${createQueryString(args)}`,
        method: 'GET',
        body: undefined,
    });

export const useInfiniteDataAppActivity = (
    filters: DataAppActivityFilters,
    infiniteQueryOpts: UseInfiniteQueryOptions<
        DataAppActivityResults,
        ApiError
    > = {},
) =>
    useInfiniteQuery<DataAppActivityResults, ApiError>({
        queryKey: ['data-app-activity', filters],
        queryFn: ({ pageParam }) =>
            getDataAppActivity({
                ...filters,
                page: (pageParam as number) ?? 1,
            }),
        getNextPageParam: (lastPage) => {
            const { pagination } = lastPage;
            if (!pagination) return undefined;
            return pagination.page < pagination.totalPageCount
                ? pagination.page + 1
                : undefined;
        },
        ...infiniteQueryOpts,
    });
