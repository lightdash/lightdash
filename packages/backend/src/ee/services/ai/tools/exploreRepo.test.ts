import { toolExploreRepoOutputSchema } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import type { ToolExecutionOptions } from 'ai';
import type { Mock } from 'vitest';
import Logger from '../../../../logging/logger';
import { ShellError } from '../repoFs/bashShell';
import { getExploreRepo } from './exploreRepo';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = vi.mocked(Sentry.captureException);
const loggerError = vi.mocked(Logger.error);

const options: ToolExecutionOptions<Record<string, unknown>> = {
    toolCallId: 'call',
    messages: [],
    context: {},
};

const execute = async (exploreRepo: Mock) => {
    const exploreRepoTool = getExploreRepo({ exploreRepo, question: '' });
    if (!exploreRepoTool.execute) {
        throw new Error('Missing executor');
    }
    const output = await exploreRepoTool.execute(
        { command: 'ls models', target: null },
        options,
    );
    expect(toolExploreRepoOutputSchema.safeParse(output).success).toBe(true);
    return toolExploreRepoOutputSchema.parse(output);
};

describe('exploreRepo tool', () => {
    beforeEach(() => {
        captureException.mockClear();
        loggerError.mockClear();
    });

    it('returns the command output as both text and structured content', async () => {
        const exploreRepo = vi.fn().mockResolvedValue('models/orders.sql');
        const output = await execute(exploreRepo);
        expect(output).toEqual({
            result: 'models/orders.sql',
            metadata: { status: 'success' },
            structuredContent: { output: 'models/orders.sql' },
        });
        expect(exploreRepo).toHaveBeenCalledWith({
            command: 'ls models',
            target: null,
            rankMatches: null,
        });
        expect(captureException).not.toHaveBeenCalled();
    });

    it('does not page Sentry for an expected ShellError, but logs it', async () => {
        const error = new ShellError('ls: unsupported flag -name');
        const exploreRepo = vi.fn().mockRejectedValue(error);
        const output = await execute(exploreRepo);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('ls: unsupported flag -name');
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(captureException).not.toHaveBeenCalled();
        expect(loggerError).toHaveBeenCalled();
    });

    it('captures an unexpected error (e.g. GitHub access failure) to Sentry', async () => {
        const error = new Error('GitHub API 403');
        const exploreRepo = vi.fn().mockRejectedValue(error);
        const output = await execute(exploreRepo);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.structuredContent).toEqual({ error: output.result });
        expect(captureException).toHaveBeenCalledWith(error);
        expect(loggerError).toHaveBeenCalled();
    });

    it('has search results ranked for the question when decisions are available', async () => {
        const exploreRepo = vi.fn(async ({ rankMatches }) => {
            const ranked = await rankMatches?.([
                { path: 'a.sql', fragments: [] },
                { path: 'b.sql', fragments: [] },
            ]);
            return (ranked ?? [])
                .map(({ path }: { path: string }) => path)
                .join(',');
        });
        const evaluate = vi.fn(async () => ({
            fit_0: { type: 'noul' as const, noul: 0.1 },
            fit_1: { type: 'noul' as const, noul: 0.6 },
        }));
        const exploreRepoTool = getExploreRepo({
            exploreRepo,
            decisions: { evaluate },
            question: 'where is revenue defined',
        });
        const output = await exploreRepoTool.execute?.(
            { command: 'search revenue', target: null },
            options,
        );
        expect(toolExploreRepoOutputSchema.parse(output).result).toBe(
            'b.sql,a.sql',
        );
    });

    it('keeps the order found when no result stands out', async () => {
        const exploreRepo = vi.fn(async ({ rankMatches }) =>
            (
                await rankMatches([
                    { path: 'a.sql', fragments: [] },
                    { path: 'b.sql', fragments: [] },
                ])
            )
                .map(({ path }: { path: string }) => path)
                .join(','),
        );
        const output = await getExploreRepo({
            exploreRepo,
            decisions: {
                evaluate: async () => ({
                    fit_0: { type: 'noul' as const, noul: 0.1 },
                    fit_1: { type: 'noul' as const, noul: 0.15 },
                }),
            },
            question: 'q',
        }).execute?.({ command: 'search x', target: null }, options);
        expect(toolExploreRepoOutputSchema.parse(output).result).toBe(
            'a.sql,b.sql',
        );
    });

    it('leaves search results as found without decisions', async () => {
        const exploreRepo = vi.fn(async () => 'ok');
        await getExploreRepo({ exploreRepo, question: 'q' }).execute?.(
            { command: 'ls', target: null },
            options,
        );
        expect(exploreRepo).toHaveBeenCalledWith(
            expect.objectContaining({ rankMatches: null }),
        );
    });
});
