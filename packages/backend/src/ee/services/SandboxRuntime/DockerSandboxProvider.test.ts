import { PassThrough } from 'node:stream';
import { DockerSandboxProvider } from './DockerSandboxProvider';
import { SandboxCommandError, SandboxOutputLimitError } from './errors';
import { type SnapshotStore } from './SnapshotStore';

const { getContainer } = vi.hoisted(() => ({ getContainer: vi.fn() }));
vi.mock('dockerode', () => ({
    default: class {
        getContainer = getContainer;
    },
}));

describe('Docker transfer limits', () => {
    const createHandle = async (
        chunks: { channel: 'stdout' | 'stderr'; value: string }[],
        exitCode = 0,
    ) => {
        const stream = new PassThrough();
        let delivered = 0;
        const inspectExec = vi.fn(async () => ({ ExitCode: exitCode }));
        getContainer.mockReturnValue({
            inspect: vi.fn(async () => ({})),
            exec: vi.fn(async () => ({
                start: async () => stream,
                inspect: inspectExec,
            })),
            modem: {
                demuxStream: (
                    _stream: unknown,
                    stdout: NodeJS.WritableStream,
                    stderr: NodeJS.WritableStream,
                ) => {
                    queueMicrotask(() => {
                        for (const chunk of chunks) {
                            if (stream.destroyed) break;
                            delivered += 1;
                            (chunk.channel === 'stdout'
                                ? stdout
                                : stderr
                            ).write(Buffer.from(chunk.value));
                        }
                        if (!stream.destroyed) stream.emit('end');
                    });
                },
            },
        });
        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
        };
        const handle = await new DockerSandboxProvider(
            'python',
            logger,
            {} as SnapshotStore,
        ).connect('test');
        return { handle, stream, inspectExec, delivered: () => delivered };
    };

    it.each(['stdout', 'stderr'] as const)(
        'stops oversized %s before buffering the response',
        async (channel) => {
            const { handle, stream, inspectExec, delivered } =
                await createHandle(
                    Array.from({ length: 10000 }, () => ({
                        channel,
                        value: '12345',
                    })),
                );
            await expect(
                handle.commands.run('python', { maxOutputBytes: 8 }),
            ).rejects.toBeInstanceOf(SandboxOutputLimitError);
            expect(delivered()).toBe(2);
            expect(stream.destroyed).toBe(true);
            expect(inspectExec).not.toHaveBeenCalled();
        },
    );

    it('counts stdout and stderr together', async () => {
        const { handle } = await createHandle([
            { channel: 'stdout', value: '12345' },
            { channel: 'stderr', value: '6789' },
        ]);
        await expect(
            handle.commands.run('python', { maxOutputBytes: 8 }),
        ).rejects.toBeInstanceOf(SandboxOutputLimitError);
    });

    it('bounds files during transfer', async () => {
        const { handle, stream } = await createHandle([
            { channel: 'stdout', value: '12345' },
            { channel: 'stdout', value: '6789' },
        ]);
        await expect(
            handle.files.readBytes('/result', { maxBytes: 8 }),
        ).rejects.toBeInstanceOf(SandboxOutputLimitError);
        expect(stream.destroyed).toBe(true);
    });

    it('accepts a file exactly at its byte limit', async () => {
        const { handle } = await createHandle([
            { channel: 'stdout', value: '12345' },
        ]);
        await expect(
            handle.files.read('/result', { maxBytes: 5 }),
        ).resolves.toBe('12345');
    });

    it('preserves unbounded callers and nonzero exit errors', async () => {
        const { handle } = await createHandle(
            [
                { channel: 'stdout', value: 'old logs' },
                { channel: 'stderr', value: 'old error' },
            ],
            42,
        );
        await expect(handle.commands.run('npm build')).rejects.toEqual(
            new SandboxCommandError(42, 'old error', 'old logs'),
        );
    });
});
