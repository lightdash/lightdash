import {
    type ApiAppSummary,
    type ApiError,
    type ApiMyAppsResponse,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type MyAppsResult = ApiMyAppsResponse['results'];

const fetchMyApps = async (
    page: number,
    pageSize: number,
): Promise<MyAppsResult> => {
    const data = await lightdashApi<MyAppsResult>({
        method: 'GET',
        url: `/ee/user/apps?page=${page}&pageSize=${pageSize}`,
        body: undefined,
    });
    return data;
};

const FETCH_SIZE = 25;

export const useMyApps = () =>
    useInfiniteQuery<MyAppsResult, ApiError>({
        queryKey: ['myApps', FETCH_SIZE],
        queryFn: async ({ pageParam = 1 }) =>
            fetchMyApps(pageParam as number, FETCH_SIZE),
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });

export type { ApiAppSummary };
