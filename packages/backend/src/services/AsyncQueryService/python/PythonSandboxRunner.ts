import {
    assertUnreachable,
    getErrorMessage,
    MissingConfigError,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    createSandboxProvider,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
    type CloudRunSandboxesConfig,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from '../../../ee/services/SandboxRuntime';
import { traceSpan } from '../../../tracing/tracing';
import {
    traceComposerQueryStage,
    type ComposerQueryStage,
    type ComposerQueryStageMetrics,
} from '../composerQueryStage';
import {
    PYTHON_INPUT_DIR,
    PYTHON_INPUT_META_PATH,
    PYTHON_MAIN_PATH,
    PYTHON_MAX_RESULT_BYTES,
    PYTHON_OUTPUT_DIR,
    PYTHON_OUTPUT_META_PATH,
    PYTHON_OUTPUT_RESULT_PATH,
    PYTHON_RUNNER_PATH,
    PYTHON_RUNNER_SOURCE,
    type PythonInputMeta,
} from './pythonQueryHarness';

/** One referenced result, as bytes the sandbox will read. */
export type PythonSandboxInput = {
    name: string;
    jsonl: Buffer;
};

export type PythonSandboxRunArgs = {
    queryUuid: string;
    code: string;
    inputs: PythonSandboxInput[];
    inputMeta: PythonInputMeta;
    timeoutMs: number;
};

export type PythonSandboxRunResult = {
    resultJsonl: Buffer;
    resultMeta: string;
    stdout: string;
};

/** Raised when the user's python fails to compile or run; the message is safe to show. */
export class PythonExecutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PythonExecutionError';
    }
}

const COMPILE_TIMEOUT_MS = 30_000;
const SANDBOX_IDLE_MARGIN_MS = 60_000;
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_META_BYTES = 1024 * 1024;
const CLOUD_RUN_PYTHON_TEMPLATE_REF = 'gcp-cloud-run-python-gateway';

/**
 * Runs one python query in a fresh sandbox: create, compile, feed inputs,
 * run the harness, read the output, destroy. The sandbox gets no credentials
 * and no egress; every byte crosses through the provider's file API.
 */
export class PythonSandboxRunner {
    private readonly lightdashConfig: LightdashConfig;

    private readonly logger: SandboxLogger;

    private readonly metrics: ComposerQueryStageMetrics | null;

    private provider: SandboxProvider | undefined;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        logger: SandboxLogger;
        metrics: ComposerQueryStageMetrics | null;
    }) {
        this.lightdashConfig = args.lightdashConfig;
        this.logger = args.logger;
        this.metrics = args.metrics;
    }

    private traceStage<T>(
        stage: ComposerQueryStage<'python'>,
        attributes: Record<string, string | number>,
        fn: () => Promise<T>,
    ): Promise<T> {
        return traceComposerQueryStage(
            this.metrics,
            'python',
            stage,
            { name: `python.sandbox.${stage}`, attributes },
            fn,
        );
    }

    private getProvider(): SandboxProvider {
        if (!this.provider) {
            const { appRuntime } = this.lightdashConfig;
            const provider = PythonSandboxRunner.getSupportedProvider(
                appRuntime.sandboxProvider,
            );
            this.provider = createSandboxProvider({
                provider,
                e2bApiKey: appRuntime.e2bApiKey,
                dockerImage: appRuntime.sandboxPythonDockerImage,
                lambdaMicroVm: null,
                azureSandboxes: null,
                gcpCloudRun:
                    provider === 'gcp-cloud-run'
                        ? this.getCloudRunConfig()
                        : null,
                // One-shot sandboxes are never suspended; Docker and Cloud Run
                // still require a store at construction.
                snapshotStore:
                    provider === 'e2b'
                        ? null
                        : new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          }),
                logger: this.logger,
            });
        }
        return this.provider;
    }

    private static getSupportedProvider(
        provider: LightdashConfig['appRuntime']['sandboxProvider'],
    ): 'e2b' | 'docker' | 'gcp-cloud-run' {
        switch (provider) {
            case 'e2b':
            case 'docker':
            case 'gcp-cloud-run':
                return provider;
            case 'lambda-microvm':
            case 'azure-sandboxes':
                throw new MissingConfigError(
                    `Python queries are not supported on the ${provider} sandbox provider yet`,
                );
            default:
                return assertUnreachable(
                    provider,
                    `Unknown sandbox provider ${provider}`,
                );
        }
    }

    private getCloudRunConfig(): CloudRunSandboxesConfig {
        const { sandboxUrl, sandboxSecret } =
            this.lightdashConfig.appRuntime.gcpCloudRunPython;
        if (!sandboxUrl || !sandboxSecret) {
            throw new MissingConfigError(
                'GCP Cloud Run python sandboxes are not configured (GCP_CLOUD_RUN_PYTHON_SANDBOX_URL / GCP_CLOUD_RUN_PYTHON_SANDBOX_SECRET)',
            );
        }
        return { sandboxUrl, sandboxSecret };
    }

    private getTemplateRef(): string {
        const { appRuntime } = this.lightdashConfig;
        switch (appRuntime.sandboxProvider) {
            case 'e2b':
                return `${appRuntime.e2bPythonTemplateName}:${appRuntime.e2bPythonTemplateTag}`;
            // The gateway bakes in its image; the ref only feeds `version`.
            case 'gcp-cloud-run':
                return CLOUD_RUN_PYTHON_TEMPLATE_REF;
            default:
                return appRuntime.sandboxPythonDockerImage;
        }
    }

    /** What runs the code: the sandbox template and the harness inside it. */
    get version(): string {
        const harness = createHash('sha256')
            .update(PYTHON_RUNNER_SOURCE)
            .digest('hex')
            .slice(0, 16);
        return `${this.lightdashConfig.appRuntime.sandboxProvider}:${this.getTemplateRef()}:${harness}`;
    }

    private buildSpec(timeoutMs: number): SandboxSpec {
        return {
            templateRef: this.getTemplateRef(),
            timeoutMs: timeoutMs + SANDBOX_IDLE_MARGIN_MS,
            egress: { allow: [] },
        };
    }

    async run(args: PythonSandboxRunArgs): Promise<PythonSandboxRunResult> {
        const { queryUuid, code, inputs, inputMeta, timeoutMs } = args;
        const provider = this.getProvider();
        const spec = this.buildSpec(timeoutMs);
        const attributes = {
            'lightdash.queryUuid': queryUuid,
            'lightdash.sandboxProvider':
                this.lightdashConfig.appRuntime.sandboxProvider,
            'lightdash.templateRef': spec.templateRef,
        };

        const handle = await this.traceStage('create', attributes, () =>
            provider.create(spec),
        );
        this.logger.info(
            `Python query ${queryUuid}: sandbox ${handle.sandboxId} created from ${spec.templateRef}`,
        );
        const sandboxAttributes = {
            ...attributes,
            'lightdash.sandboxId': handle.sandboxId,
        };

        try {
            await this.traceStage('compile', sandboxAttributes, () =>
                PythonSandboxRunner.compile(handle, code),
            );

            await this.traceStage(
                'write_inputs',
                {
                    ...sandboxAttributes,
                    'lightdash.inputCount': inputs.length,
                    'lightdash.inputBytes': inputs.reduce(
                        (total, input) => total + input.jsonl.byteLength,
                        0,
                    ),
                },
                () =>
                    PythonSandboxRunner.writeInputs(handle, inputs, inputMeta),
            );

            const stdout = await this.traceStage(
                'run',
                { ...sandboxAttributes, 'lightdash.timeoutMs': timeoutMs },
                () => PythonSandboxRunner.execute(handle, timeoutMs),
            );

            const [resultJsonl, resultMeta] = await this.traceStage(
                'read_output',
                sandboxAttributes,
                () =>
                    Promise.all([
                        handle.files.readBytes(PYTHON_OUTPUT_RESULT_PATH, {
                            maxBytes: PYTHON_MAX_RESULT_BYTES,
                        }),
                        handle.files.read(PYTHON_OUTPUT_META_PATH, {
                            maxBytes: MAX_META_BYTES,
                        }),
                    ]),
            );
            return { resultJsonl, resultMeta, stdout };
        } catch (error) {
            if (error instanceof SandboxOutputLimitError) {
                throw new PythonExecutionError(error.message);
            }
            throw error;
        } finally {
            await this.traceStage('destroy', sandboxAttributes, async () => {
                try {
                    await provider.destroy(handle.sandboxId);
                } catch (e) {
                    this.logger.warn(
                        `Python query ${queryUuid}: failed to destroy sandbox ${
                            handle.sandboxId
                        }: ${getErrorMessage(e)}`,
                    );
                }
            });
        }
    }

    /** Syntax errors surface here, before any data enters the sandbox. */
    private static async compile(
        handle: SandboxHandle,
        code: string,
    ): Promise<void> {
        await handle.files.write(PYTHON_MAIN_PATH, code);
        await handle.files.write(PYTHON_RUNNER_PATH, PYTHON_RUNNER_SOURCE);
        try {
            await handle.commands.run(
                `python3 -I -m py_compile ${PYTHON_MAIN_PATH}`,
                {
                    timeoutMs: COMPILE_TIMEOUT_MS,
                    maxOutputBytes: MAX_LOG_BYTES,
                },
            );
        } catch (e) {
            if (e instanceof SandboxCommandError) {
                throw new PythonExecutionError(
                    `Python code does not compile:\n${e.stderr.trim()}`,
                );
            }
            throw e;
        }
    }

    private static async writeInputs(
        handle: SandboxHandle,
        inputs: PythonSandboxInput[],
        inputMeta: PythonInputMeta,
    ): Promise<void> {
        await handle.commands.run(
            `mkdir -p ${PYTHON_INPUT_DIR} ${PYTHON_OUTPUT_DIR}`,
            { maxOutputBytes: MAX_LOG_BYTES },
        );
        await Promise.all(
            inputs.map((input) =>
                traceSpan(
                    {
                        op: 'python.sandbox.write_input',
                        name: 'python.sandbox.write_input',
                        attributes: {
                            'lightdash.inputName': input.name,
                            'lightdash.inputBytes': input.jsonl.byteLength,
                        },
                    },
                    () =>
                        handle.files.write(
                            `${PYTHON_INPUT_DIR}/${input.name}.jsonl`,
                            input.jsonl,
                        ),
                ),
            ),
        );
        await handle.files.write(
            PYTHON_INPUT_META_PATH,
            JSON.stringify(inputMeta),
        );
    }

    private static async execute(
        handle: SandboxHandle,
        timeoutMs: number,
    ): Promise<string> {
        try {
            const result = await handle.commands.run(
                `cd ${PYTHON_OUTPUT_DIR}/.. && python3 -I ${PYTHON_RUNNER_PATH}`,
                { timeoutMs, maxOutputBytes: MAX_LOG_BYTES },
            );
            return result.stdout;
        } catch (e) {
            if (e instanceof SandboxCommandError) {
                throw new PythonExecutionError(
                    e.stderr.trim() || `Python exited with code ${e.exitCode}`,
                );
            }
            if (e instanceof SandboxTimeoutError) {
                throw new PythonExecutionError(
                    `Python run exceeded ${Math.round(timeoutMs / 1000)}s`,
                );
            }
            throw e;
        }
    }
}
