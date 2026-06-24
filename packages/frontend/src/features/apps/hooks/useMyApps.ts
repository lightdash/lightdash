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
    excludePreviewProjects: boolean,
): Promise<MyAppsResult> => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        excludePreviewProjects: String(excludePreviewProjects),
    });

    const data = await lightdashApi<MyAppsResult>({
        method: 'GET',
        url: `/ee/user/apps?${params.toString()}`,
        body: undefined,
    });
    return data;
};

const FETCH_SIZE = 25;

export const useMyApps = (options: { excludePreviewProjects?: boolean } = {}) =>
    useInfiniteQuery<MyAppsResult, ApiError>({
        queryKey: [
            'myApps',
            FETCH_SIZE,
            options.excludePreviewProjects ?? true,
        ],
        queryFn: async ({ pageParam = 1 }) =>
            fetchMyApps(
                pageParam as number,
                FETCH_SIZE,
                options.excludePreviewProjects ?? true,
            ),
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });

export type { ApiAppSummary };
