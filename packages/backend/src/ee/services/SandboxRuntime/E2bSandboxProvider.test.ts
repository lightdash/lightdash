import {
    CommandExitError,
    NotFoundError,
    SandboxError,
    SandboxNotFoundError,
    TimeoutError,
} from 'e2b';
import { normalizeError } from './E2bSandboxProvider';
import {
    SandboxCommandError,
    SandboxConnectionError,
    SandboxNotRunningError,
    SandboxTimeoutError,
} from './errors';

const getNormalizedError = (error: unknown): unknown => {
    try {
        return normalizeError(error);
    } catch (normalizedError) {
        return normalizedError;
    }
};

describe('normalizeError', () => {
    it('maps an unmapped RPC SandboxError to SandboxConnectionError', () => {
        const error = new SandboxError('2: [unknown] terminated');
        const normalizedError = getNormalizedError(error);

        expect(normalizedError).toBeInstanceOf(SandboxConnectionError);
        expect(normalizedError).toMatchObject({ message: error.message });
    });

    it('maps SandboxNotFoundError to SandboxNotRunningError', () => {
        const error = new SandboxNotFoundError(
            'Sandbox is probably not running anymore',
        );
        const normalizedError = getNormalizedError(error);

        expect(normalizedError).toBeInstanceOf(SandboxNotRunningError);
        expect(normalizedError).toMatchObject({ message: error.message });
    });

    it('maps a fetch-failed TypeError to SandboxConnectionError', () => {
        const error = new TypeError('fetch failed');
        const normalizedError = getNormalizedError(error);

        expect(normalizedError).toBeInstanceOf(SandboxConnectionError);
        expect(normalizedError).toMatchObject({ message: error.message });
    });

    it('maps CommandExitError to SandboxCommandError', () => {
        const error = new CommandExitError({
            exitCode: 42,
            stderr: 'failure',
            stdout: 'progress',
        });
        const normalizedError = getNormalizedError(error);

        expect(normalizedError).toBeInstanceOf(SandboxCommandError);
        expect(normalizedError).toMatchObject({
            exitCode: 42,
            stderr: 'failure',
            stdout: 'progress',
        });
    });

    it('maps TimeoutError to SandboxTimeoutError', () => {
        const error = new TimeoutError('deadline exceeded');
        const normalizedError = getNormalizedError(error);

        expect(normalizedError).toBeInstanceOf(SandboxTimeoutError);
        expect(normalizedError).toMatchObject({ message: error.message });
    });

    it('rethrows unknown errors unchanged', () => {
        const error = new Error('unexpected');

        expect(getNormalizedError(error)).toBe(error);
    });

    it('does not map SandboxError subclasses as connection errors', () => {
        const error = new NotFoundError('missing file');

        expect(getNormalizedError(error)).toBe(error);
    });

    it('does not map a SandboxError subclass with an RPC-shaped message', () => {
        const error = new NotFoundError('2: [unknown] terminated');

        expect(getNormalizedError(error)).toBe(error);
    });

    it('does not map a base SandboxError without an RPC-shaped message', () => {
        const error = new SandboxError('unexpected sandbox failure');

        expect(getNormalizedError(error)).toBe(error);
    });
});
