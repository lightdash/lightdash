import {
    CommandExitError,
    NotFoundError,
    Sandbox,
    SandboxError,
    SandboxNotFoundError,
    TimeoutError,
} from 'e2b';
import { E2bSandboxProvider, normalizeError } from './E2bSandboxProvider';
import {
    SandboxCommandError,
    SandboxConnectionError,
    SandboxNotRunningError,
    SandboxOutputLimitError,
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

describe('bounded E2B transfers', () => {
    afterEach(() => vi.restoreAllMocks());

    const createHandle = async (sandbox: unknown) => {
        vi.spyOn(Sandbox, 'create').mockResolvedValue(sandbox as Sandbox);
        return new E2bSandboxProvider('key').create({
            templateRef: 'python',
            timeoutMs: 1000,
            egress: { allow: [] },
        });
    };

    it.each(['stdout', 'stderr'] as const)(
        'stops SDK accumulation and kills a command with excessive %s',
        async (channel) => {
            let produced = 0;
            const sandbox = new Sandbox({
                sandboxId: 'test',
                envdVersion: '0.4.0',
                apiKey: 'key',
            });
            async function* events() {
                yield {
                    event: { event: { case: 'start', value: { pid: 1 } } },
                };
                for (let i = 0; i < 10000; i += 1) {
                    produced += 1;
                    yield {
                        event: {
                            event: {
                                case: 'data',
                                value: {
                                    output: {
                                        case: channel,
                                        value: new TextEncoder().encode(
                                            '12345',
                                        ),
                                    },
                                },
                            },
                        },
                    };
                }
            }
            // Mock only the RPC transport; use the installed SDK's real command
            // start, accumulator, iterator and wait paths.
            const { rpc } = sandbox.commands as unknown as {
                rpc: {
                    start: () => AsyncGenerator<unknown>;
                    sendSignal: () => Promise<void>;
                };
            };
            vi.spyOn(rpc, 'start').mockImplementation(() => events());
            const kill = vi.spyOn(rpc, 'sendSignal').mockResolvedValue();
            const handle = await createHandle(sandbox);
            await expect(
                handle.commands.run('python3 main.py', { maxOutputBytes: 8 }),
            ).rejects.toBeInstanceOf(SandboxOutputLimitError);
            expect(produced).toBe(2);
            expect(kill).toHaveBeenCalledOnce();
        },
    );

    it('bounds the combined stdout and stderr count', async () => {
        const run = vi.fn(
            async (
                _command: string,
                options: {
                    onStdout: (chunk: string) => void;
                    onStderr: (chunk: string) => void;
                },
            ) => {
                options.onStdout('12345');
                options.onStderr('12345');
            },
        );
        const handle = await createHandle({ commands: { run } });
        await expect(
            handle.commands.run('python', { maxOutputBytes: 8 }),
        ).rejects.toBeInstanceOf(SandboxOutputLimitError);
    });

    it('cancels oversized files during transfer without a stat check', async () => {
        let produced = 0;
        const cancel = vi.fn();
        const read = vi.fn(
            async () =>
                new ReadableStream<Uint8Array>(
                    {
                        pull(controller) {
                            produced += 1;
                            controller.enqueue(new Uint8Array(5));
                        },
                        cancel,
                    },
                    { highWaterMark: 0 },
                ),
        );
        const handle = await createHandle({ files: { read } });
        await expect(
            handle.files.readBytes('/result.jsonl', { maxBytes: 8 }),
        ).rejects.toBeInstanceOf(SandboxOutputLimitError);
        expect(read).toHaveBeenCalledWith('/result.jsonl', {
            format: 'stream',
        });
        expect(produced).toBe(2);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('keeps the SDK passthrough for callers without limits', async () => {
        const result = { stdout: 'existing logs', stderr: '', exitCode: 0 };
        const run = vi.fn(
            async (_command: string, _options: unknown) => result,
        );
        const read = vi.fn(async () => 'existing file');
        const handle = await createHandle({
            commands: { run },
            files: { read },
        });
        await expect(handle.commands.run('npm build')).resolves.toEqual(result);
        expect(run.mock.calls[0][1]).not.toHaveProperty('background');
        await expect(handle.files.read('/app/file')).resolves.toBe(
            'existing file',
        );
        expect(read).toHaveBeenCalledWith('/app/file');
    });
});
