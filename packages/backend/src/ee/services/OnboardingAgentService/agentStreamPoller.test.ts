import {
    SandboxConnectionError,
    SandboxNotRunningError,
    SandboxTimeoutError,
    type CommandResult,
    type SandboxHandle,
} from '../SandboxRuntime';
import { pollDetachedAgentRun } from './agentStreamPoller';

const EXIT_SEPARATOR = '__LIGHTDASH_AGENT_EXIT_SECTION__';
const PROCESS_SEPARATOR = '__LIGHTDASH_AGENT_PROCESS_SECTION__';

const tickResponse = (args: {
    exitCode: number | null;
    processCount: number;
    tail: string;
}): CommandResult => {
    const exitOutput = args.exitCode === null ? '' : `${args.exitCode}\n`;
    return {
        stdout:
            `${exitOutput}\n${EXIT_SEPARATOR}\n` +
            `${args.processCount}\n\n${PROCESS_SEPARATOR}\n${args.tail}`,
        stderr: '',
        exitCode: 0,
    };
};

const makeSandbox = (responses: Array<CommandResult | Error>) => {
    const run = vi.fn<SandboxHandle['commands']['run']>(async () => {
        const response = responses.shift();
        if (!response) {
            throw new Error('No scripted sandbox response remains');
        }
        if (response instanceof Error) throw response;
        return response;
    });
    const sandbox = { commands: { run } } as unknown as SandboxHandle;
    return { sandbox, run };
};

const makeLogger = () => ({
    debug: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
});

describe('pollDetachedAgentRun', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('delivers complete lines in order and holds partial trailing lines', async () => {
        const { sandbox, run } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: 1,
                tail: 'first\npart',
            }),
            tickResponse({
                exitCode: null,
                processCount: 1,
                tail: 'partial\nsecond\n',
            }),
            tickResponse({
                exitCode: 0,
                processCount: 0,
                tail: '',
            }),
        ]);
        const onLine = vi.fn<(line: string) => void>();
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine,
            logger: makeLogger(),
            timeouts: { pollIntervalMs: 1 },
        });

        await vi.advanceTimersByTimeAsync(2);

        await expect(promise).resolves.toEqual({ exitCode: 0 });
        expect(onLine.mock.calls).toEqual([['first'], ['partial'], ['second']]);
        expect(run).toHaveBeenCalledWith(
            expect.stringContaining("pgrep -cf 'ld-agent-runner[.]sh'"),
        );
    });

    it('returns the exit code and flushes a final unterminated line', async () => {
        const { sandbox } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: 1,
                tail: 'complete\npart',
            }),
            tickResponse({
                exitCode: 17,
                processCount: 0,
                tail: 'partial',
            }),
        ]);
        const onLine = vi.fn<(line: string) => void>();
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine,
            logger: makeLogger(),
            timeouts: { pollIntervalMs: 1 },
        });

        await vi.advanceTimersByTimeAsync(1);

        await expect(promise).resolves.toEqual({ exitCode: 17 });
        expect(onLine.mock.calls).toEqual([['complete'], ['partial']]);
    });

    it('recovers from transient RPC failures within the grace period', async () => {
        const { sandbox } = makeSandbox([
            new Error('temporary transport failure'),
            tickResponse({
                exitCode: 0,
                processCount: 0,
                tail: '',
            }),
        ]);
        const logger = makeLogger();
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine: vi.fn(),
            logger,
            timeouts: {
                pollIntervalMs: 10,
                disconnectGraceMs: 100,
            },
        });

        await vi.advanceTimersByTimeAsync(10);

        await expect(promise).resolves.toEqual({ exitCode: 0 });
        expect(logger.warn).toHaveBeenCalledOnce();
    });

    it('throws SandboxConnectionError after failures exceed the grace period', async () => {
        const { sandbox } = makeSandbox([
            new Error('transport failure 1'),
            new Error('transport failure 2'),
            new Error('transport failure 3'),
        ]);
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine: vi.fn(),
            logger: makeLogger(),
            timeouts: {
                pollIntervalMs: 10,
                disconnectGraceMs: 15,
            },
        });
        const rejection = promise.catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(20);

        await expect(rejection).resolves.toBeInstanceOf(SandboxConnectionError);
    });

    it('rethrows SandboxNotRunningError immediately', async () => {
        const error = new SandboxNotRunningError('sandbox was destroyed');
        const { sandbox, run } = makeSandbox([error]);

        await expect(
            pollDetachedAgentRun({
                sandbox,
                onLine: vi.fn(),
                logger: makeLogger(),
            }),
        ).rejects.toBe(error);
        expect(run).toHaveBeenCalledOnce();
    });

    it('throws when the runner is absent for two consecutive ticks', async () => {
        const { sandbox } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: 0,
                tail: '',
            }),
            tickResponse({
                exitCode: null,
                processCount: 0,
                tail: '',
            }),
        ]);
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine: vi.fn(),
            logger: makeLogger(),
            timeouts: { pollIntervalMs: 1 },
        });
        const rejection = promise.catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(1);

        await expect(rejection).resolves.toBeInstanceOf(SandboxConnectionError);
    });

    it('does not count repeated unavailable process checks as dead ticks', async () => {
        const { sandbox } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: -1,
                tail: '',
            }),
            tickResponse({
                exitCode: null,
                processCount: -1,
                tail: '',
            }),
            tickResponse({
                exitCode: null,
                processCount: -1,
                tail: '',
            }),
            tickResponse({
                exitCode: 0,
                processCount: -1,
                tail: '',
            }),
        ]);
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine: vi.fn(),
            logger: makeLogger(),
            timeouts: { pollIntervalMs: 1 },
        });

        await vi.advanceTimersByTimeAsync(3);

        await expect(promise).resolves.toEqual({ exitCode: 0 });
    });

    it('treats separator strings inside the stream tail as data', async () => {
        const poisonedLines =
            `real-line-1\n\n${EXIT_SEPARATOR}\n99\n` +
            `\n${PROCESS_SEPARATOR}\nreal-line-2\n`;
        const { sandbox } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: 1,
                tail: poisonedLines,
            }),
            tickResponse({
                exitCode: 0,
                processCount: 0,
                tail: '',
            }),
        ]);
        const onLine = vi.fn<(line: string) => void>();
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine,
            logger: makeLogger(),
            timeouts: { pollIntervalMs: 1 },
        });

        await vi.advanceTimersByTimeAsync(1);

        await expect(promise).resolves.toEqual({ exitCode: 0 });
        expect(onLine.mock.calls).toEqual([
            ['real-line-1'],
            [EXIT_SEPARATOR],
            ['99'],
            [PROCESS_SEPARATOR],
            ['real-line-2'],
        ]);
    });

    it('throws SandboxTimeoutError when the overall deadline expires', async () => {
        const { sandbox } = makeSandbox([
            tickResponse({
                exitCode: null,
                processCount: 1,
                tail: '',
            }),
        ]);
        const promise = pollDetachedAgentRun({
            sandbox,
            onLine: vi.fn(),
            logger: makeLogger(),
            timeouts: {
                pollIntervalMs: 10,
                deadlineMs: 10,
            },
        });
        const rejection = promise.catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(10);

        await expect(rejection).resolves.toBeInstanceOf(SandboxTimeoutError);
    });
});
