import { type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

type PullRequestDiff = { diff: string } | null;

const getPullRequestDiff = (
    projectUuid: string,
    prUrl: string,
    commitSha: string | null,
): Promise<PullRequestDiff> => {
    const params = new URLSearchParams({ prUrl });
    // Scope the diff to this card's pinned commit when known, matching the
    // per-commit add/del stat shown on the card; otherwise the whole PR.
    if (commitSha) {
        params.set('commitSha', commitSha);
    }
    return lightdashApi<PullRequestDiff>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/ci-diff?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

/**
 * Lazily fetch the raw unified diff of a write-back pull request for the card's
 * diff viewer. `enabled` defers the fetch until the viewer is actually opened.
 */
export const usePullRequestDiff = (
    projectUuid: string,
    prUrl: string,
    commitSha: string | null,
    enabled: boolean,
) =>
    useQuery<PullRequestDiff, ApiError>({
        queryKey: ['pullRequestDiff', projectUuid, prUrl, commitSha],
        queryFn: () => getPullRequestDiff(projectUuid, prUrl, commitSha),
        enabled: enabled && !!projectUuid && !!prUrl,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 60_000,
    });
