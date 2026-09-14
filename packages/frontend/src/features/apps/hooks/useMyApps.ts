import {
    type ApiAppSummary,
    type ApiError,
    type ApiMyAppsResponse,
    type MyAppsSortBy,
} from '@lightdash/common';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type MyAppsResult = ApiMyAppsResponse['results'];

const fetchMyApps = async ({
    page,
    pageSize,
    excludePreviewProjects,
    projectUuids,
    search,
    sortBy,
}: {
    page: number;
    pageSize: number;
    excludePreviewProjects: boolean;
    projectUuids: string[];
    search?: string;
    sortBy?: MyAppsSortBy;
}): Promise<MyAppsResult> => {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        excludePreviewProjects: String(excludePreviewProjects),
    });
    if (search) {
        params.set('search', search);
    }
    if (sortBy) {
        params.set('sortBy', sortBy);
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
            fetchMyApps({
                page: pageParam as number,
                pageSize: FETCH_SIZE,
                excludePreviewProjects: options.excludePreviewProjects ?? true,
                projectUuids: options.projectUuids ?? [],
                search: options.search,
            }),
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });

export const useRecentApps = (
    projectUuid: string | undefined,
    pageSize: number,
) =>
    useQuery<MyAppsResult, ApiError>({
        queryKey: ['myApps', 'recent', projectUuid, pageSize, 'latestActivity'],
        queryFn: () =>
            fetchMyApps({
                page: 1,
                pageSize,
                excludePreviewProjects: false,
                projectUuids: [projectUuid!],
                sortBy: 'latestActivity',
            }),
        enabled: !!projectUuid,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

export type { ApiAppSummary };
