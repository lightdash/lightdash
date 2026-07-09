import {
    ForbiddenError,
    PullRequestProvider,
    type ToolOutput,
} from '@lightdash/common';
import { WritebackGitNotConnectedError } from '../../AiWritebackService/errors';
import { getEditRepo } from './editRepo';

type EditRepoTool = ReturnType<typeof getEditRepo>;
type EditRepoOutput = Exclude<ToolOutput, ToolOutput[]>;

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
    value != null && typeof value === 'object' && Symbol.asyncIterator in value;

const executeEditRepo = (tool: EditRepoTool) =>
    (async (): Promise<EditRepoOutput> => {
        const output = await tool.execute!(
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
        );

        if (isAsyncIterable(output) || Array.isArray(output)) {
            throw new Error('Expected non-streaming single tool output item');
        }

        return output;
    })();

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

        expect(output.status).toBe('error');
        if (output.status === 'success') {
            throw new Error('Expected error output');
        }

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('github_not_installed');
        expect(output.error).toContain('connect the GitHub app');
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

        expect(output.status).toBe('error');
        if (output.status === 'success') {
            throw new Error('Expected error output');
        }

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('gitlab_not_installed');
        expect(output.error).toContain('connect the GitLab app');
    });

    it('still maps a plain ForbiddenError to repo_write_forbidden', async () => {
        const editRepo = vi
            .fn()
            .mockRejectedValue(new ForbiddenError('not your repo'));
        const output = await executeEditRepo(getEditRepo({ editRepo }));

        expect(output.status).toBe('error');
        if (output.status === 'success') {
            throw new Error('Expected error output');
        }

        expect(output.metadata?.status).toBe('error');
        expect(output.metadata?.errorCode).toBe('repo_write_forbidden');
    });
});
