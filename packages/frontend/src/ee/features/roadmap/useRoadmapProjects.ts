import {
    type ApiError,
    type RoadmapProjectQuery,
    type RoadmapProjectRequestsQuery,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { roadmapApi } from './roadmapApi';

export function useRoadmapProjects(
    query: RoadmapProjectQuery,
    cacheKey: string,
) {
    return useInfiniteQuery<
        Awaited<ReturnType<typeof roadmapApi.getProjects>>,
        ApiError
    >({
        queryKey: ['roadmap-projects', cacheKey, query],
        queryFn: ({ pageParam = 1 }) =>
            roadmapApi.getProjects({ ...query, page: pageParam }),
        getNextPageParam: (last) =>
            last.pagination.page < last.pagination.totalPages
                ? last.pagination.page + 1
                : undefined,
        retry: false,
        refetchOnWindowFocus: true,
    });
}

export function useRoadmapRequests(
    query: RoadmapProjectRequestsQuery,
    cacheKey: string,
    enabled: boolean,
) {
    return useInfiniteQuery<
        Awaited<ReturnType<typeof roadmapApi.getRequests>>,
        ApiError
    >({
        queryKey: ['roadmap-project-requests', cacheKey, query],
        queryFn: ({ pageParam = 1 }) =>
            roadmapApi.getRequests({ ...query, page: pageParam }),
        getNextPageParam: (last) =>
            last.pagination.page < last.pagination.totalPages
                ? last.pagination.page + 1
                : undefined,
        enabled,
        retry: false,
    });
}
