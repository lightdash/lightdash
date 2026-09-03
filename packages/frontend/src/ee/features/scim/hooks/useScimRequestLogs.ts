import {
    type ApiError,
    type ApiScimRequestLogListResponse,
} from '@lightdash/common';
import {
    useInfiniteQuery,
    type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

export const SCIM_REQUEST_LOGS_QUERY_KEY = 'scim_request_logs';

const getScimRequestLogs = async (
    page: number,
    pageSize: number,
): Promise<ApiScimRequestLogListResponse['results']> => {
    const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
    });
    return lightdashApi<ApiScimRequestLogListResponse['results']>({
        url: `/scim/request-logs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useScimRequestLogs = ({
    pageSize,
}: {
    pageSize: number;
}): UseInfiniteQueryResult<
    ApiScimRequestLogListResponse['results'],
    ApiError
> =>
    useInfiniteQuery<ApiScimRequestLogListResponse['results'], ApiError>({
        queryKey: [SCIM_REQUEST_LOGS_QUERY_KEY, pageSize],
        queryFn: async ({ pageParam = 0 }) =>
            getScimRequestLogs((pageParam as number) + 1, pageSize),
        getNextPageParam: (lastGroup, groups) => {
            const currentPage = groups.length - 1;
            const totalPages = lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages - 1 ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
