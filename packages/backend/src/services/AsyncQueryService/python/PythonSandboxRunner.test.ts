import { MissingConfigError } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../../config/parseConfig';
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

const { create, destroy, createSandboxProvider } = vi.hoisted(() => {
    const createFn = vi.fn();
    const destroyFn = vi.fn();
    return {
        create: createFn,
        destroy: destroyFn,
        createSandboxProvider: vi.fn(() => ({
            create: createFn,
            destroy: destroyFn,
        })),
    };
});
vi.mock('../../../ee/services/SandboxRuntime', async () => ({
    ...(await import('../../../ee/services/SandboxRuntime/errors')),
    createSandboxProvider,
    S3SnapshotStore: class {},
}));
const { spans } = vi.hoisted(() => ({
    spans: [] as { name: string; attributes: Record<string, unknown> }[],
}));
vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (
        options: { name: string; attributes: Record<string, unknown> },
        fn: (span: unknown) => Promise<unknown>,
    ) => {
        spans.push({ name: options.name, attributes: options.attributes });
        return fn({ setAttribute: vi.fn(), setAttributes: vi.fn() });
    },
}));

const silentLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
};

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
                logger: silentLogger,
                metrics: null,
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

describe('PythonSandboxRunner provider selection', () => {
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    };
    const runWith = (appRuntime: Partial<LightdashConfig['appRuntime']>) =>
        new PythonSandboxRunner({
            lightdashConfig: {
                ...lightdashConfigMock,
                appRuntime: {
                    ...lightdashConfigMock.appRuntime,
                    ...appRuntime,
                },
            },
            logger,
            metrics: null,
        }).run({
            queryUuid: 'query',
            code: 'def run(inputs, params):\n    return None',
            inputs: [],
            inputMeta: { inputs: {}, params: {}, limit: 10 },
            timeoutMs: 1000,
        });

    beforeEach(() => {
        createSandboxProvider.mockClear();
        create.mockRejectedValue(new Error('stop after create'));
    });

    it('includes the configured template in the results cache version', () => {
        const version = (tag: string) =>
            new PythonSandboxRunner({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    appRuntime: {
                        ...lightdashConfigMock.appRuntime,
                        sandboxProvider: 'e2b',
                        e2bPythonTemplateTag: tag,
                    },
                },
                logger,
                metrics: null,
            }).version;
        expect(version('v1')).toContain('lightdash-python-runner-warm:v1:');
        expect(version('v1')).not.toEqual(version('v2'));
    });

    it('creates the cloud run provider with the python gateway config', async () => {
        await expect(
            runWith({
                sandboxProvider: 'gcp-cloud-run',
                gcpCloudRun: {
                    sandboxUrl: 'https://data-app-gateway',
                    sandboxSecret: 'data-app-secret',
                },
                gcpCloudRunPython: {
                    sandboxUrl: 'https://python-gateway',
                    sandboxSecret: 'python-secret',
                },
            }),
        ).rejects.toThrow('stop after create');
        expect(createSandboxProvider).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'gcp-cloud-run',
                gcpCloudRun: {
                    sandboxUrl: 'https://python-gateway',
                    sandboxSecret: 'python-secret',
                },
                snapshotStore: expect.anything(),
            }),
        );
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                templateRef: 'gcp-cloud-run-python-gateway',
            }),
        );
    });

    it('rejects cloud run without python gateway config', async () => {
        await expect(
            runWith({
                sandboxProvider: 'gcp-cloud-run',
                gcpCloudRun: {
                    sandboxUrl: 'https://data-app-gateway',
                    sandboxSecret: 'data-app-secret',
                },
                gcpCloudRunPython: { sandboxUrl: null, sandboxSecret: null },
            }),
        ).rejects.toThrow(
            new MissingConfigError(
                'GCP Cloud Run python sandboxes are not configured (GCP_CLOUD_RUN_PYTHON_SANDBOX_URL / GCP_CLOUD_RUN_PYTHON_SANDBOX_SECRET)',
            ),
        );
        expect(createSandboxProvider).not.toHaveBeenCalled();
    });

    it.each(['lambda-microvm', 'azure-sandboxes'] as const)(
        'rejects %s as unsupported',
        async (sandboxProvider) => {
            await expect(runWith({ sandboxProvider })).rejects.toThrow(
                new MissingConfigError(
                    `Python queries are not supported on the ${sandboxProvider} sandbox provider yet`,
                ),
            );
            expect(createSandboxProvider).not.toHaveBeenCalled();
        },
    );
});

describe('PythonSandboxRunner stage instrumentation', () => {
    it('traces the selected template and stages', async () => {
        const handle = {
            sandboxId: 'sandbox-1',
            commands: {
                run: vi.fn(async () => ({
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                })),
            },
            files: {
                write: vi.fn(),
                readBytes: vi.fn(async () => Buffer.from('{}')),
                read: vi.fn(async () => '{}'),
            },
        } as unknown as SandboxHandle;
        create.mockResolvedValue(handle);
        destroy.mockResolvedValue(undefined);
        const observeComposerQueryStageDuration = vi.fn();
        spans.length = 0;

        await new PythonSandboxRunner({
            lightdashConfig: {
                ...lightdashConfigMock,
                appRuntime: {
                    ...lightdashConfigMock.appRuntime,
                    sandboxProvider: 'e2b',
                    e2bPythonTemplateName: 'warm-template',
                    e2bPythonTemplateTag: 'warm-tag',
                },
            },
            logger: silentLogger,
            metrics: { observeComposerQueryStageDuration },
        }).run({
            queryUuid: 'query',
            code: 'def run(inputs, params):\n    return inputs["a"]',
            inputs: [
                { name: 'a', jsonl: Buffer.from('{"x":1}\n') },
                { name: 'b', jsonl: Buffer.from('{}\n') },
            ],
            inputMeta: { inputs: {}, params: {}, limit: 10 },
            timeoutMs: 1000,
        });

        expect(
            spans.find(({ name }) => name === 'python.sandbox.run')?.attributes,
        ).toMatchObject({
            'lightdash.sandboxId': 'sandbox-1',
            'lightdash.templateRef': 'warm-template:warm-tag',
        });
        expect(create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                templateRef: 'warm-template:warm-tag',
            }),
        );
        await vi.waitFor(() =>
            expect(
                observeComposerQueryStageDuration.mock.calls.map(
                    ([source, stage]) => `${source}.${stage}`,
                ),
            ).toEqual([
                'python.create',
                'python.write_inputs',
                'python.compile',
                'python.run',
                'python.read_output',
                'python.destroy',
            ]),
        );
    });
});

describe('PythonSandboxRunner batching', () => {
    beforeEach(() => silentLogger.warn.mockClear());
    it('batches uploads, keeps the compile check, detaches cleanup', async () => {
        let rejectDestroy: (error: Error) => void = () => {};
        destroy.mockImplementationOnce(
            () =>
                new Promise<void>((_resolve, reject) => {
                    rejectDestroy = reject;
                }),
        );
        const handle = {
            sandboxId: 'batch-test',
            files: {
                write: vi.fn(),
                writeMany: vi.fn(
                    async (
                        _files: {
                            path: string;
                            contents: string | Uint8Array;
                        }[],
                    ) => {},
                ),
                readBytes: vi.fn(async () => Buffer.from('{"x":1}\n')),
                read: vi.fn(async () => '{}'),
            },
            commands: {
                run: vi.fn(async () => ({
                    stdout: 'user logs',
                    stderr: '',
                    exitCode: 0,
                })),
            },
        };
        create.mockResolvedValueOnce(handle);
        const runner = new PythonSandboxRunner({
            lightdashConfig: {
                ...lightdashConfigMock,
                appRuntime: {
                    ...lightdashConfigMock.appRuntime,
                    sandboxProvider: 'e2b',
                },
            },
            logger: silentLogger,
            metrics: null,
        });
        const result = await runner.run({
            queryUuid: 'query',
            code: 'def run(inputs, params):\n    return inputs["a"]',
            inputs: [{ name: 'a', jsonl: Buffer.from('{"x":1}\n') }],
            inputMeta: { inputs: {}, params: {}, limit: 10 },
            timeoutMs: 1000,
        });
        expect(result.stdout).toBe('user logs');
        expect(handle.files.write).not.toHaveBeenCalled();
        expect(handle.files.writeMany).toHaveBeenCalledOnce();
        expect(handle.files.writeMany.mock.calls[0][0]).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: '/work/main.py' }),
                expect.objectContaining({ path: '/work/runner.py' }),
                {
                    path: '/work/in/a.jsonl',
                    contents: Buffer.from('{"x":1}\n'),
                },
                expect.objectContaining({ path: '/work/in/meta.json' }),
                { path: '/work/out/.keep', contents: '' },
            ]),
        );
        expect(handle.commands.run).toHaveBeenCalledTimes(2);
        expect(create).toHaveBeenLastCalledWith(
            expect.objectContaining({
                onTimeout: 'kill',
                timeoutMs: 61000,
            }),
        );
        expect(destroy).toHaveBeenLastCalledWith('batch-test');
        rejectDestroy(new Error('cleanup unavailable'));
        await vi.waitFor(() =>
            expect(silentLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('cleanup unavailable'),
            ),
        );
    });
    it('destroys the sandbox when a batched upload fails', async () => {
        const error = new Error('upload failed');
        const handle = {
            sandboxId: 'failed-upload',
            files: { writeMany: vi.fn().mockRejectedValue(error) },
        };
        create.mockResolvedValueOnce(handle);
        destroy.mockResolvedValueOnce(undefined);
        const runner = new PythonSandboxRunner({
            lightdashConfig: {
                ...lightdashConfigMock,
                appRuntime: {
                    ...lightdashConfigMock.appRuntime,
                    sandboxProvider: 'e2b',
                },
            },
            logger: silentLogger,
            metrics: null,
        });
        await expect(
            runner.run({
                queryUuid: 'query',
                code: 'code',
                inputs: [],
                inputMeta: { inputs: {}, params: {}, limit: 10 },
                timeoutMs: 1000,
            }),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenLastCalledWith('failed-upload');
    });
});
