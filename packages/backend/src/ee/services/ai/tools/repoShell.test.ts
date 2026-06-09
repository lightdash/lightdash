import * as Sentry from '@sentry/node';
import { ShellError } from '../repoFs/bashShell';
import { getRepoShell } from './repoShell';

jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
}));

jest.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
const Logger = require('../../../../logging/logger').default;

const captureException = Sentry.captureException as jest.Mock;

type ExecuteResult = { result: string; metadata: { status: string } };

const execute = async (repoShell: jest.Mock): Promise<ExecuteResult> => {
    const repoShellTool = getRepoShell({ repoShell });
    // `tool()` always defines execute for our definition, and it resolves to an
    // object (not a stream); the casts keep TS happy without changing behaviour.
    const result = await repoShellTool.execute!(
        { command: 'ls models' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as ExecuteResult;
};

describe('repoShell tool error handling', () => {
    beforeEach(() => {
        captureException.mockClear();
        Logger.error.mockClear();
    });

    it('returns a successful result unchanged', async () => {
        const repoShell = jest.fn().mockResolvedValue('models/orders.sql');
        const result = await execute(repoShell);
        expect(result).toEqual({
            result: 'models/orders.sql',
            metadata: { status: 'success' },
        });
        expect(captureException).not.toHaveBeenCalled();
    });

    it('does not page Sentry for an expected ShellError, but logs it', async () => {
        const error = new ShellError('ls: unsupported flag -name');
        const repoShell = jest.fn().mockRejectedValue(error);
        const result = await execute(repoShell);

        expect(result.metadata).toEqual({ status: 'error' });
        expect(result.result).toContain('ls: unsupported flag -name');
        expect(captureException).not.toHaveBeenCalled();
        expect(Logger.error).toHaveBeenCalled();
    });

    it('captures an unexpected error (e.g. GitHub access failure) to Sentry', async () => {
        const error = new Error('GitHub API 403');
        const repoShell = jest.fn().mockRejectedValue(error);
        const result = await execute(repoShell);

        expect(result.metadata).toEqual({ status: 'error' });
        expect(captureException).toHaveBeenCalledWith(error);
        expect(Logger.error).toHaveBeenCalled();
    });
});
