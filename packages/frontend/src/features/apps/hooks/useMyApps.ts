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
    projectUuids: string[],
    search?: string,
): Promise<MyAppsResult> => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        excludePreviewProjects: String(excludePreviewProjects),
    });
    if (search) {
        params.set('search', search);
    }
    projectUuids.forEach((projectUuid) => {
        params.append('projectUuids', projectUuid);
    });

    const data = await lightdashApi<MyAppsResult>({
        method: 'GET',
        url: `/ee/user/apps?${params.toString()}`,
        body: undefined,
    });
    return data;
};

const FETCH_SIZE = 25;

export const useMyApps = (
    options: {
        excludePreviewProjects?: boolean;
        projectUuids?: string[];
        search?: string;
    } = {},
) =>
    useInfiniteQuery<MyAppsResult, ApiError>({
        queryKey: [
            'myApps',
            FETCH_SIZE,
            options.excludePreviewProjects ?? true,
            options.projectUuids ?? [],
            options.search,
        ],
        queryFn: async ({ pageParam = 1 }) =>
            fetchMyApps(
                pageParam as number,
                FETCH_SIZE,
                options.excludePreviewProjects ?? true,
                options.projectUuids ?? [],
                options.search,
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
