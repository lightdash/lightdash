import { JobStatusType } from '@lightdash/common';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useJob } from '../../hooks/useRefreshServer';

const GOING_LIVE_KEY = 'semantic-studio-going-live';

/** Keeps the compile a merge started, so the change can say when it is live for everyone. */
export const rememberGoingLive = (
    queryClient: QueryClient,
    projectUuid: string,
    prUrl: string,
    compileJobUuid: string | null,
) =>
    queryClient.setQueryData(
        [GOING_LIVE_KEY, projectUuid, prUrl],
        compileJobUuid,
    );

/** Where a merged change's update for everyone stands; unknown when this tab did not merge it. */
export const useGoingLive = (
    projectUuid: string,
    prUrl: string | null,
): 'unknown' | 'running' | 'failed' | 'done' => {
    // ponytail: kept for the tab only, so after a reload a merge reads as merged, not live.
    const { data: jobUuid } = useQuery<string | null>({
        queryKey: [GOING_LIVE_KEY, projectUuid, prUrl],
        queryFn: () => null,
        enabled: false,
        staleTime: Infinity,
        cacheTime: Infinity,
    });
    const { data: job } = useJob(
        jobUuid ?? undefined,
        () => {},
        () => {},
    );
    if (!jobUuid) return 'unknown';
    if (job?.jobStatus === JobStatusType.DONE) return 'done';
    if (job?.jobStatus === JobStatusType.ERROR) return 'failed';
    return 'running';
};
