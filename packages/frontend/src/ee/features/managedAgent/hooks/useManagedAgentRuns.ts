import { type ManagedAgentRunsListResponse } from '@lightdash/common';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';

const PAGE_SIZE = 20;
const FIRST_PAGE_REFETCH_MS = 30000;

const getRuns = async (
    projectUuid: string,
    cursor: string | null,
): Promise<ManagedAgentRunsListResponse> => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    return lightdashApi<ManagedAgentRunsListResponse>({
        url: `/projects/${projectUuid}/managed-agent/runs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useManagedAgentRuns = (opts: { enabled?: boolean } = {}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const isEnabled = opts.enabled ?? true;
    return useInfiniteQuery<ManagedAgentRunsListResponse>({
        queryKey: ['managed-agent-runs', projectUuid],
        queryFn: ({ pageParam }) =>
            getRuns(projectUuid!, (pageParam as string | null) ?? null),
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: !!projectUuid && isEnabled,
        // Only poll while the user is on the first page. Once they "Load
        // older runs" we have no reason to keep refetching the historical
        // pages every 30s — they don't change. `refetchOnWindowFocus`
        // (v4 default) still re-syncs when the user returns to the tab.
        refetchInterval: (data) => {
            if (!isEnabled) return false;
            if (data && data.pages.length > 1) return false;
            return FIRST_PAGE_REFETCH_MS;
        },
    });
};
