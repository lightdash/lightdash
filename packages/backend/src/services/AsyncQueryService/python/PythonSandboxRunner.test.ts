import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { readBoundedStream } from '../../../ee/services/SandboxRuntime/boundedOutput';
import {
    type FileReadOptions,
    type SandboxHandle,
} from '../../../ee/services/SandboxRuntime/types';
import {
    PYTHON_MAX_RESULT_BYTES,
    PYTHON_OUTPUT_META_PATH,
    PYTHON_OUTPUT_RESULT_PATH,
} from './pythonQueryHarness';
import {
    PythonExecutionError,
    PythonSandboxRunner,
} from './PythonSandboxRunner';

const { create, destroy } = vi.hoisted(() => ({
    create: vi.fn(),
    destroy: vi.fn(),
}));
vi.mock('../../../ee/services/SandboxRuntime', async () => ({
    ...(await import('../../../ee/services/SandboxRuntime/errors')),
    createSandboxProvider: () => ({ create, destroy }),
}));
vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
}));

describe('PythonSandboxRunner output limits', () => {
    it.each([
        [PYTHON_OUTPUT_RESULT_PATH, PYTHON_MAX_RESULT_BYTES],
        [PYTHON_OUTPUT_META_PATH, 1024 * 1024],
    ] as const)(
        'rejects oversized %s during the transfer and destroys the sandbox',
        async (oversizedPath, maxBytes) => {
            const cancel = vi.fn();
            const readBytes = vi.fn(
                async (path: string, options?: FileReadOptions) => {
                    if (path !== oversizedPath) return Buffer.from('{}');
                    const stream = new ReadableStream<Uint8Array>(
                        {
                            pull(controller) {
                                controller.enqueue(
                                    new Uint8Array(maxBytes + 1),
                                );
                            },
                            cancel,
                        },
                        { highWaterMark: 0 },
                    );
                    // Exercise the same streaming transfer used by the E2B adapter.
                    return readBoundedStream(stream, options!.maxBytes);
                },
            );
            const handle = {
                sandboxId: 'python-test',
                commands: {
                    run: vi.fn(async () => ({
                        stdout: '',
                        stderr: '',
                        exitCode: 0,
                    })),
                },
                files: {
                    write: vi.fn(),
                    readBytes,
                    read: async (path: string, options?: FileReadOptions) =>
                        (await readBytes(path, options)).toString(),
                },
            } as unknown as SandboxHandle;
            create.mockResolvedValue(handle);
            destroy.mockResolvedValue(undefined);
            const runner = new PythonSandboxRunner({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    appRuntime: {
                        ...lightdashConfigMock.appRuntime,
                        sandboxProvider: 'e2b',
                    },
                },
                logger: {
                    info: vi.fn(),
                    warn: vi.fn(),
                    debug: vi.fn(),
                    error: vi.fn(),
                },
            });
            await expect(
                runner.run({
                    queryUuid: 'query',
                    code: 'def run(inputs, params):\n    return inputs["source"]',
                    inputs: [],
                    inputMeta: { inputs: {}, params: {}, limit: 10 },
                    timeoutMs: 1000,
                }),
            ).rejects.toEqual(
                new PythonExecutionError(
                    `Sandbox output exceeds ${maxBytes} bytes`,
                ),
            );
            expect(cancel).toHaveBeenCalledOnce();
            expect(destroy).toHaveBeenCalledWith('python-test');
            expect(handle.commands.run).toHaveBeenCalledWith(
                expect.stringContaining('python3 -I'),
                expect.objectContaining({ maxOutputBytes: 1024 * 1024 }),
            );
        },
    );
});
