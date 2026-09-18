import {
    ForbiddenError,
    toolGetPullRequestDiffOutputSchema,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import { getGetPullRequestDiff } from './getPullRequestDiff';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const prUrl = 'https://github.com/acme/web-app/pull/42';

const execute = async (getPullRequestDiff: import('vitest').Mock) => {
    const prTool = getGetPullRequestDiff({ getPullRequestDiff });
    if (!prTool.execute) {
        throw new Error('getPullRequestDiff tool has no execute');
    }
    const output = await prTool.execute(
        { prUrl },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    // Parsing with the tool's own output schema is the assertion that the
    // envelope matches the contract, and it narrows the output for the tests.
    return toolGetPullRequestDiffOutputSchema.parse(output);
};

describe('getPullRequestDiff tool', () => {
    beforeEach(() => {
        vi.mocked(Sentry.captureException).mockClear();
        vi.mocked(Logger.error).mockClear();
    });

    it('returns the diff as text and as structured content', async () => {
        const diff =
            '--- a/models/orders.sql\n+++ b/models/orders.sql\n+select 1';
        const output = await execute(vi.fn().mockResolvedValue(diff));

        expect(output).toEqual({
            result: `Unified diff for acme/web-app #42:\n\n\`\`\`diff\n${diff}\n\`\`\``,
            metadata: { status: 'success' },
            structuredContent: {
                pullRequest: 'acme/web-app #42',
                diff,
                truncated: false,
                totalChars: diff.length,
            },
        });
        expect(
            toolGetPullRequestDiffOutputSchema.safeParse(output).success,
        ).toBe(true);
    });

    it('truncates a large diff and says so in both views', async () => {
        const diff = 'x'.repeat(40_010);
        const output = await execute(vi.fn().mockResolvedValue(diff));

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toContain(
            '[diff truncated at 40000 characters of 40010 total',
        );
        expect(output.result).toContain('x'.repeat(40_000));
        expect(output.result).not.toContain('x'.repeat(40_001));
        expect(output.structuredContent).toEqual({
            pullRequest: 'acme/web-app #42',
            diff: 'x'.repeat(40_000),
            truncated: true,
            totalChars: 40_010,
        });
    });

    it('reports a pull request with no file changes', async () => {
        const output = await execute(vi.fn().mockResolvedValue('  \n'));

        expect(output).toEqual({
            result: 'acme/web-app #42 has no file changes.',
            metadata: { status: 'success' },
            structuredContent: {
                pullRequest: 'acme/web-app #42',
                diff: '',
                truncated: false,
                totalChars: 0,
            },
        });
    });

    it('mirrors an unresolvable pull request as { error }', async () => {
        const output = await execute(vi.fn().mockResolvedValue(null));

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain(
            "I couldn't read the diff for acme/web-app #42.",
        );
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(
            toolGetPullRequestDiffOutputSchema.safeParse(output).success,
        ).toBe(true);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('mirrors a ForbiddenError as { error } without paging Sentry', async () => {
        const output = await execute(
            vi.fn().mockRejectedValue(new ForbiddenError('no source access')),
        );

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('no source access');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('captures an unexpected error to Sentry and mirrors it as { error }', async () => {
        const error = new Error('GitHub API 403');
        const output = await execute(vi.fn().mockRejectedValue(error));

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error reading the pull request diff.');
        expect(output.result).toContain('GitHub API 403');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
        expect(Logger.error).toHaveBeenCalled();
    });
});
