import {
    type ApiError,
    type CiChecks,
    type MergePullRequestResult,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

type MergeArgs = {
    prUrl: string;
    /** Expected head SHA — the merge is rejected if the PR head has moved on. */
    sha: string | null;
};

const mergePullRequest = (
    projectUuid: string,
    { prUrl, sha }: MergeArgs,
): Promise<MergePullRequestResult> =>
    lightdashApi<MergePullRequestResult>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/merge-pull-request`,
        method: 'POST',
        body: JSON.stringify({ prUrl, sha: sha ?? undefined }),
    });

/**
 * Merge a write-back pull request from the chat PR card. On success it
 * invalidates the PR's CI/merge status so the card flips to its terminal
 * "Merged" state; failures (conflicts, blocked branch, stale head) surface as a
 * toast.
 */
export const useMergePullRequest = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<MergePullRequestResult, ApiError, MergeArgs>({
        mutationFn: (args) => mergePullRequest(projectUuid, args),
        onSuccess: (result, { prUrl }) => {
            // No success toast — the PR card flips to its "Merged" state with
            // confetti, which is feedback enough.
            // Optimistically flip the card to its merged state. Without this the
            // button briefly reverts to the clickable green "Merge PR" until the
            // CI-checks query refetches the merged verdict from GitHub (a few
            // seconds), and the "Merged" purple state + confetti only fire then.
            // Prefix match covers every pinned-commit variant of the key.
            if (result.merged) {
                queryClient.setQueriesData<CiChecks | null>(
                    { queryKey: ['pullRequestCiChecks', projectUuid, prUrl] },
                    (old) => (old ? { ...old, merged: true } : old),
                );
            }
            void queryClient.invalidateQueries({
                queryKey: ['pullRequestCiChecks', projectUuid, prUrl],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to merge pull request',
                apiError: error,
            });
        },
    });
};
