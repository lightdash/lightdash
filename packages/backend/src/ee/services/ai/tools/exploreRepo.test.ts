import { type ToolOutput } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import { ShellError } from '../repoFs/bashShell';
import { getExploreRepo } from './exploreRepo';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

type ExecuteResult = { result: string; metadata: { status: string } };

const toolOutputToExecuteResult = (output: ToolOutput): ExecuteResult => {
    const items = Array.isArray(output) ? output : [output];
    return {
        result: items
            .map((item) =>
                item.status === 'error' ? item.error : String(item.result),
            )
            .join('\n'),
        metadata: {
            status: items.some((item) => item.status === 'error')
                ? 'error'
                : 'success',
        },
    };
};

const execute = async (
    exploreRepo: import('vitest').Mock,
): Promise<ExecuteResult> => {
    const exploreRepoTool = getExploreRepo({ exploreRepo });
    const result = await exploreRepoTool.execute!(
        { command: 'ls models', target: null },
        { messages: [], toolCallId: 'test' },
    );

    if (Symbol.asyncIterator in result) {
        throw new Error('Unexpected streaming result');
    }

    return toolOutputToExecuteResult(result);
};

describe('exploreRepo tool error handling', () => {
    beforeEach(() => {
        captureException.mockClear();
        (Logger.error as import('vitest').Mock).mockClear();
    });

    it('returns a successful result unchanged', async () => {
        const exploreRepo = vi.fn().mockResolvedValue('models/orders.sql');
        const result = await execute(exploreRepo);
        expect(result).toEqual({
            result: 'models/orders.sql',
            metadata: { status: 'success' },
        });
        expect(captureException).not.toHaveBeenCalled();
    });

    it('does not page Sentry for an expected ShellError, but logs it', async () => {
        const error = new ShellError('ls: unsupported flag -name');
        const exploreRepo = vi.fn().mockRejectedValue(error);
        const result = await execute(exploreRepo);

        expect(result.metadata).toEqual({ status: 'error' });
        expect(result.result).toContain('ls: unsupported flag -name');
        expect(captureException).not.toHaveBeenCalled();
        expect(Logger.error).toHaveBeenCalled();
    });

    it('captures an unexpected error (e.g. GitHub access failure) to Sentry', async () => {
        const error = new Error('GitHub API 403');
        const exploreRepo = vi.fn().mockRejectedValue(error);
        const result = await execute(exploreRepo);

        expect(result.metadata).toEqual({ status: 'error' });
        expect(captureException).toHaveBeenCalledWith(error);
        expect(Logger.error).toHaveBeenCalled();
    });
});
