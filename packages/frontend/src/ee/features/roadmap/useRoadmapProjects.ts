import {
    type ApiError,
    type RoadmapProjectQuery,
    type RoadmapProjectRequestsQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRoadmapApi } from './roadmapApi';

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
    const api = useRoadmapApi();
    return useQuery<Awaited<ReturnType<typeof api.getProjects>>, ApiError>({
        queryKey: ['roadmap-projects', cacheKey, query],
        queryFn: () => api.getProjects(query),
        retry: false,
        refetchOnWindowFocus: true,
    });
}

export function useRoadmapRequests(
    query: RoadmapProjectRequestsQuery,
    cacheKey: string,
    enabled: boolean,
) {
    const api = useRoadmapApi();
    return useQuery({
        queryKey: ['roadmap-project-requests', cacheKey, query],
        queryFn: () => api.getRequests(query),
        enabled,
        retry: false,
    });
}
