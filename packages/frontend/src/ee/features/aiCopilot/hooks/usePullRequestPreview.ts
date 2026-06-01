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

/**
 * Resolve (and poll for) the Lightdash preview-environment URL of a write-back
 * pull request. Disabled until both a project and a PR URL are known; stops
 * polling as soon as a preview URL is found.
 */
export const usePullRequestPreview = (
    projectUuid: string | undefined,
    prUrl: string | null | undefined,
) =>
    useQuery<PullRequestPreview, ApiError>({
        queryKey: ['pullRequestPreview', projectUuid, prUrl],
        queryFn: () => getPullRequestPreview(projectUuid!, prUrl!),
        enabled: !!projectUuid && !!prUrl,
        refetchInterval: (data) =>
            data?.previewUrl ? false : PREVIEW_POLL_INTERVAL_MS,
        refetchOnWindowFocus: false,
        retry: false,
    });
