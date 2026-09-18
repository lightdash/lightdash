import {
    ForbiddenError,
    PullRequestProvider,
    toolEditRepoOutputSchema,
} from '@lightdash/common';
import type { Mock } from 'vitest';
import { DeniedPathError } from '../../AiWritebackService/deniedPaths';
import {
    RepoTooLargeError,
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from '../../AiWritebackService/errors';
import { getEditRepo } from './editRepo';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const runResult = {
    output: 'Renamed the column in models/orders.sql',
    exitCode: 0,
    prUrl: 'https://github.com/acme/analytics/pull/42',
    prAction: 'opened' as const,
    commitSha: 'abc123',
    additions: 3,
    deletions: 1,
    projectName: 'Analytics',
    repository: 'acme/analytics',
    steps: [{ kind: 'edit' as const, label: 'models/orders.sql' }],
};

const executeEditRepo = async (editRepo: Mock) => {
    const tool = getEditRepo({ editRepo });
    if (!tool.execute) {
        throw new Error('Missing executor');
    }
    const output = await tool.execute(
        {
            repoTarget: 'acme/analytics',
            prompt: 'do the thing',
            prUrl: null,
            startNewPullRequest: false,
        },
        { messages: [], toolCallId: 'tool-call-1', context: {} },
    );
    const parsed = toolEditRepoOutputSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
        throw new Error(parsed.error.message);
    }
    return parsed.data;
};

describe('getEditRepo success output', () => {
    it('reports an opened pull request as text and structured content', async () => {
        const output = await executeEditRepo(
            vi.fn().mockResolvedValue(runResult),
        );

        expect(output.result).toBe(
            `Opened a pull request against repository acme/analytics. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which repository it targeted.\n\nAgent summary:\n${runResult.output}`,
        );
        expect(output.metadata).toEqual({
            status: 'success',
            repository: 'acme/analytics',
            prUrl: runResult.prUrl,
            prAction: 'opened',
            commitSha: 'abc123',
            additions: 3,
            deletions: 1,
            steps: runResult.steps,
        });
        expect(output.structuredContent).toEqual({
            repository: 'acme/analytics',
            pullRequestAction: 'opened',
            agentSummary: runResult.output,
        });
    });

    it('reports an updated pull request', async () => {
        const output = await executeEditRepo(
            vi.fn().mockResolvedValue({ ...runResult, prAction: 'updated' }),
        );

        expect(output.result).toMatch(
            /^Updated a pull request against repository acme\/analytics\./,
        );
        expect(output.structuredContent).toMatchObject({
            pullRequestAction: 'updated',
        });
    });

    it('treats a pull request without a recorded action as opened', async () => {
        const output = await executeEditRepo(
            vi.fn().mockResolvedValue({ ...runResult, prAction: null }),
        );

        expect(output.result).toMatch(/^Opened a pull request/);
        expect(output.structuredContent).toMatchObject({
            pullRequestAction: 'opened',
        });
    });

    it('reports a run that made no file changes with a null pull request action', async () => {
        const output = await executeEditRepo(
            vi.fn().mockResolvedValue({
                ...runResult,
                prUrl: null,
                prAction: null,
                commitSha: null,
                additions: null,
                deletions: null,
                steps: [],
            }),
        );

        expect(output.result).toBe(
            `Ran against repository acme/analytics but made no file changes, so no pull request was opened.\n\nAgent summary:\n${runResult.output}`,
        );
        expect(output.metadata).toMatchObject({
            status: 'success',
            prUrl: null,
        });
        expect(output.structuredContent).toEqual({
            repository: 'acme/analytics',
            pullRequestAction: null,
            agentSummary: runResult.output,
        });
    });
});

describe('getEditRepo error classification', () => {
    it('maps a missing GitHub app install to github_not_installed (not repo_write_forbidden)', async () => {
        const output = await executeEditRepo(
            vi
                .fn()
                .mockRejectedValue(
                    new WritebackGitNotConnectedError(
                        PullRequestProvider.GITHUB,
                        'GitHub App is not installed for this organization',
                    ),
                ),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'github_not_installed',
        });
        expect(output.result).toContain('connect the GitHub app');
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('maps a missing GitLab app install to gitlab_not_installed', async () => {
        const output = await executeEditRepo(
            vi
                .fn()
                .mockRejectedValue(
                    new WritebackGitNotConnectedError(
                        PullRequestProvider.GITLAB,
                        'GitLab App is not installed for this organization',
                    ),
                ),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'gitlab_not_installed',
        });
        expect(output.result).toContain('connect the GitLab app');
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('still maps a plain ForbiddenError to repo_write_forbidden', async () => {
        const output = await executeEditRepo(
            vi.fn().mockRejectedValue(new ForbiddenError('not your repo')),
        );

        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'repo_write_forbidden',
            reason: 'not your repo',
        });
        expect(output.result).toContain('not your repo');
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('relays a closed pull request verbatim', async () => {
        const error = new WritebackThreadPrClosedError('merged');
        const output = await executeEditRepo(vi.fn().mockRejectedValue(error));

        expect(output.result).toBe(error.message);
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'pull_request_not_open',
        });
        expect(output.structuredContent).toEqual({ error: error.message });
    });

    it('relays a too-large repository verbatim', async () => {
        const error = new RepoTooLargeError('acme/analytics', 900, 500);
        const output = await executeEditRepo(vi.fn().mockRejectedValue(error));

        expect(output.result).toBe(error.message);
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'repo_too_large',
        });
        expect(output.structuredContent).toEqual({ error: error.message });
    });

    it('reports denied paths with the offending files as the reason', async () => {
        const output = await executeEditRepo(
            vi
                .fn()
                .mockRejectedValue(
                    new DeniedPathError(['.github/workflows/ci.yml', '.env']),
                ),
        );

        expect(output.result).toContain('.github/workflows/ci.yml, .env');
        expect(output.result).toContain('Do not retry this');
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'denied_path',
            reason: '.github/workflows/ci.yml, .env',
        });
        expect(output.structuredContent).toEqual({ error: output.result });
    });

    it('wraps an unexpected error with the generic coding agent message', async () => {
        const output = await executeEditRepo(
            vi.fn().mockRejectedValue(new Error('sandbox exploded')),
        );

        expect(output.result).toContain(
            'Error running the coding agent. No pull request was opened.',
        );
        expect(output.result).toContain('sandbox exploded');
        expect(output.metadata).toEqual({
            status: 'error',
            errorCode: 'unknown',
        });
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
