import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { readBoundedStream } from '../../../ee/services/SandboxRuntime/boundedOutput';
import {
    type FileReadOptions,
    type SandboxHandle,
    type SandboxProvider,
} from '../../../ee/services/SandboxRuntime/types';
import { LocalProcessSandboxProvider } from '../sandbox/LocalProcessSandboxProvider';
import {
    PYTHON_MAX_RESULT_BYTES,
    PYTHON_OUTPUT_META_PATH,
    PYTHON_OUTPUT_RESULT_PATH,
} from './pythonQueryHarness';
import {
    PythonExecutionError,
    PythonSandboxRunner,
} from './PythonSandboxRunner';

vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
}));

const createRunner = (provider: SandboxProvider) =>
    new PythonSandboxRunner({
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
        provider,
    });

const hasPython = spawnSync('python3', ['--version']).status === 0;

describe.skipIf(!hasPython)(
    'PythonSandboxRunner with an injected provider',
    () => {
        it('reports a compile error from the sandbox and destroys it', async () => {
            const sandboxIds: string[] = [];
            class RecordingProvider extends LocalProcessSandboxProvider {
                async create() {
                    const handle = await super.create();
                    sandboxIds.push(handle.sandboxId);
                    return handle;
                }
            }
            const runner = createRunner(new RecordingProvider());

            await expect(
                runner.run({
                    queryUuid: 'query',
                    code: 'def run(inputs, params)\n    return inputs',
                    inputs: [],
                    inputMeta: { inputs: {}, params: {}, limit: 10 },
                    timeoutMs: 10_000,
                }),
            ).rejects.toThrow(/^Python code does not compile:\n.*SyntaxError/s);
            expect(sandboxIds).toHaveLength(1);
            expect(existsSync(sandboxIds[0])).toBe(false);
        });
    },
);

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
            const destroy = vi.fn(async () => undefined);
            const runner = createRunner({
                create: async () => handle,
                destroy,
            } as unknown as SandboxProvider);
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
