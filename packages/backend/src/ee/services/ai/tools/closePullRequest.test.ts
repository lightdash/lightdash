import {
    ForbiddenError,
    toolClosePullRequestOutputSchema,
    UnexpectedServerError,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import type { ClosePullRequestFn } from '../types/aiAgentDependencies';
import { getClosePullRequest } from './closePullRequest';

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

const executeClosePullRequest = async (
    closePullRequest: ClosePullRequestFn,
) => {
    const tool = getClosePullRequest({ closePullRequest });
    if (!tool.execute) throw new Error('tool has no execute');
    const output = await tool.execute(
        { prUrl },
        { messages: [], toolCallId: 'tool-call-1' },
    );
    if (Symbol.asyncIterator in output) {
        throw new Error('expected a single tool output, got a stream');
    }
    return output;
};

describe('getClosePullRequest', () => {
    it('closes the pull request and mirrors the closed state in structuredContent', async () => {
        const closePullRequest = vi.fn().mockResolvedValue(undefined);

        const output = await executeClosePullRequest(closePullRequest);

        expect(closePullRequest).toHaveBeenCalledWith({ prUrl });
        expect(output).toEqual({
            result: 'Closed the pull request. The card above reflects its closed state, so do NOT repeat the pull request URL — just confirm it was closed.',
            metadata: { status: 'success' },
            structuredContent: { prUrl, state: 'closed' },
        });
        expect(toolClosePullRequestOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('relays a ForbiddenError without a retry suggestion and mirrors it as { error }', async () => {
        const closePullRequest = vi
            .fn()
            .mockRejectedValue(new ForbiddenError('Not your repo'));

        const output = await executeClosePullRequest(closePullRequest);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('could not be closed');
        expect(output.result).toContain('Not your repo');
        expect(output.result).not.toContain('Try again');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolClosePullRequestOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });

    it('routes other errors through the tool error handler with { error }', async () => {
        const closePullRequest = vi
            .fn()
            .mockRejectedValue(new UnexpectedServerError('GitHub is down'));

        const output = await executeClosePullRequest(closePullRequest);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error closing the pull request.');
        expect(output.result).toContain('GitHub is down');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(toolClosePullRequestOutputSchema.safeParse(output).success).toBe(
            true,
        );
    });
});
