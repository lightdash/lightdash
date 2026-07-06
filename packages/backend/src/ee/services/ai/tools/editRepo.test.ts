import { ForbiddenError, PullRequestProvider } from '@lightdash/common';
import { WritebackGitNotConnectedError } from '../../AiWritebackService/errors';
import { getEditRepo } from './editRepo';

type EditRepoTool = ReturnType<typeof getEditRepo>;
type EditRepoOutput = {
    result: string;
    metadata?: { status: string; errorCode?: string; reason?: string };
};

const executeEditRepo = (tool: EditRepoTool) =>
    tool.execute!(
        {
            repoTarget: 'acme/analytics',
            prompt: 'do the thing',
            prUrl: null,
            startNewPullRequest: false,
        },
        {
            messages: [],
            toolCallId: 'tool-call-1',
        },
    ) as Promise<EditRepoOutput>;

describe('getEditRepo error classification', () => {
    it('maps a missing GitHub app install to github_not_installed (not repo_write_forbidden)', async () => {
        const editRepo = vi
            .fn()
            .mockRejectedValue(
                new WritebackGitNotConnectedError(
                    PullRequestProvider.GITHUB,
                    'GitHub App is not installed for this organization',
                ),
            );
        const output = await executeEditRepo(getEditRepo({ editRepo }));

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('github_not_installed');
        expect(output.result).toContain('connect the GitHub app');
    });

    it('maps a missing GitLab app install to gitlab_not_installed', async () => {
        const editRepo = vi
            .fn()
            .mockRejectedValue(
                new WritebackGitNotConnectedError(
                    PullRequestProvider.GITLAB,
                    'GitLab App is not installed for this organization',
                ),
            );
        const output = await executeEditRepo(getEditRepo({ editRepo }));

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('gitlab_not_installed');
        expect(output.result).toContain('connect the GitLab app');
    });

    it('still maps a plain ForbiddenError to repo_write_forbidden', async () => {
        const editRepo = vi
            .fn()
            .mockRejectedValue(new ForbiddenError('not your repo'));
        const output = await executeEditRepo(getEditRepo({ editRepo }));

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('repo_write_forbidden');
    });
});
