import type { ApiError, PullRequestPreview } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getPullRequestPreview = async (
    projectUuid: string,
    prUrl: string,
): Promise<PullRequestPreview> =>
    lightdashApi<PullRequestPreview>({
        version: 'v1',
        url: `/projects/${projectUuid}/pull-requests/preview?prUrl=${encodeURIComponent(
            prUrl,
        )}`,
        method: 'GET',
        body: undefined,
    });

// The dbt repo's CI publishes the preview asynchronously and comments its URL
// on the PR, so we poll until a URL appears, then stop.
const PREVIEW_POLL_INTERVAL_MS = 20_000;

// Give up waiting ~10 min after the PR was opened. If the CI hasn't published a
// preview URL by then it most likely failed, was skipped, or the PR was closed.
const PREVIEW_WAIT_TIMEOUT_MS = 10 * 60_000;

/**
 * Whether the preview wait window (~10 min from when the PR was opened) has
 * elapsed. Drives both stopping the poll and the timed-out UI.
 */
export const isPreviewWaitTimedOut = (
    prCreatedAt: string | null | undefined,
): boolean => {
    if (!prCreatedAt) return false;
    const openedAt = new Date(prCreatedAt).getTime();
    if (Number.isNaN(openedAt)) return false;
    return Date.now() - openedAt > PREVIEW_WAIT_TIMEOUT_MS;
};

/**
 * Resolve (and poll for) the Lightdash preview-environment URL of a write-back
 * pull request. Disabled until both a project and a PR URL are known; stops
 * polling once a preview URL is found OR the ~10 min wait window from
 * `prCreatedAt` elapses.
 */
export const usePullRequestPreview = (
    projectUuid: string | undefined,
    prUrl: string | null | undefined,
    prCreatedAt?: string | null,
) =>
    useQuery<PullRequestPreview, ApiError>({
        queryKey: ['pullRequestPreview', projectUuid, prUrl],
        queryFn: () => getPullRequestPreview(projectUuid!, prUrl!),
        enabled: !!projectUuid && !!prUrl,
        refetchInterval: (data) =>
            data?.previewUrl || isPreviewWaitTimedOut(prCreatedAt)
                ? false
                : PREVIEW_POLL_INTERVAL_MS,
        refetchOnWindowFocus: false,
        retry: false,
    });
