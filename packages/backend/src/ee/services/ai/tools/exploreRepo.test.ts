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

const execute = async (
    exploreRepo: import('vitest').Mock,
): Promise<ExecuteResult> => {
    const exploreRepoTool = getExploreRepo({ exploreRepo });
    // `tool()` always defines execute for our definition, and it resolves to an
    // object (not a stream); the casts keep TS happy without changing behaviour.
    const result = await exploreRepoTool.execute!(
        { command: 'ls models', target: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as ExecuteResult;
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
