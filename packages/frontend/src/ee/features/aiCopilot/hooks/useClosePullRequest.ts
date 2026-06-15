import { type ApiError, type ClosePullRequestResult } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

type CloseArgs = { prUrl: string };

const closePullRequest = (
    projectUuid: string,
    { prUrl }: CloseArgs,
): Promise<ClosePullRequestResult> =>
    lightdashApi<ClosePullRequestResult>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/close-pull-request`,
        method: 'POST',
        body: JSON.stringify({ prUrl }),
    });

/**
 * Close a write-back pull request without merging. On success it invalidates
 * the PR's CI/merge status so the card flips to its terminal "Closed" state.
 */
export const useClosePullRequest = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<ClosePullRequestResult, ApiError, CloseArgs>({
        mutationFn: (args) => closePullRequest(projectUuid, args),
        onSuccess: (_result, { prUrl }) => {
            showToastSuccess({ title: 'Pull request closed' });
            void queryClient.invalidateQueries({
                queryKey: ['pullRequestCiChecks', projectUuid, prUrl],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to close pull request',
                apiError: error,
            });
        },
    });
};
