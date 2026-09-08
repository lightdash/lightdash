import {
    type ApiError,
    type RoadmapProjectQuery,
    type RoadmapProjectRequestsQuery,
} from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { roadmapApi } from './roadmapApi';

export function useRoadmapExpiry(expiresAt: string | undefined) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!expiresAt) return;
        const refresh = () => setNow(Date.now());
        const timer = window.setTimeout(
            refresh,
            Math.max(0, Date.parse(expiresAt) - Date.now()) + 1,
        );
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [expiresAt]);
    return (
        expiresAt !== undefined &&
        Date.parse(expiresAt) <= Math.max(now, Date.now())
    );
}

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
