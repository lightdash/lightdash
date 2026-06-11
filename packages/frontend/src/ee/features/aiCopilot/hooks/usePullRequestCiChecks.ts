import {
    CiCheckState,
    CiMergeState,
    type ApiError,
    type CiChecks,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getPullRequestCiChecks = (
    projectUuid: string,
    prUrl: string,
    commitSha: string | null,
): Promise<CiChecks | null> => {
    const params = new URLSearchParams({ prUrl });
    // Pin the checks to this card's own commit so a later turn's commit doesn't
    // retroactively change them; omitted for cards persisted before commitSha
    // existed (the backend then falls back to the PR's live head).
    if (commitSha) {
        params.set('commitSha', commitSha);
    }
    return lightdashApi<CiChecks | null>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/ci-checks?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

// While any check is still running — or GitHub is still computing
// mergeability — we re-poll; once both have settled the status is stable.
const CI_POLL_INTERVAL_MS = 15_000;

/**
 * Resolve (and poll for) the live CI status of a write-back pull request.
 * Disabled until both a project and a PR URL are known; keeps polling while
 * checks are pending or the merge verdict is still unknown, then stops.
 */
export const usePullRequestCiChecks = (
    projectUuid: string | undefined,
    prUrl: string | null | undefined,
    commitSha: string | null,
) =>
    useQuery<CiChecks | null, ApiError>({
        queryKey: ['pullRequestCiChecks', projectUuid, prUrl, commitSha],
        queryFn: () => getPullRequestCiChecks(projectUuid!, prUrl!, commitSha),
        enabled: !!projectUuid && !!prUrl,
        refetchInterval: (data) =>
            // A merged PR is terminal — its mergeable_state often reads
            // `unknown`, so without this guard the poll would never settle.
            data &&
            !data.merged &&
            (data.overall === CiCheckState.PENDING ||
                data.mergeState === CiMergeState.UNKNOWN)
                ? CI_POLL_INTERVAL_MS
                : false,
        refetchOnWindowFocus: false,
        retry: false,
    });
