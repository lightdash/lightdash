import { getErrorMessage, MissingConfigError } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    createSandboxProvider,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxTimeoutError,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from '../../../ee/services/SandboxRuntime';
import { traceSpan } from '../../../tracing/tracing';
import {
    PYTHON_INPUT_DIR,
    PYTHON_INPUT_META_PATH,
    PYTHON_MAIN_PATH,
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

/**
 * Runs one python query in a fresh sandbox: create, compile, feed inputs,
 * run the harness, read the output, destroy. The sandbox gets no credentials
 * and no egress; every byte crosses through the provider's file API.
 */
export class PythonSandboxRunner {
    private readonly lightdashConfig: LightdashConfig;

    private readonly logger: SandboxLogger;

    private provider: SandboxProvider | undefined;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        logger: SandboxLogger;
    }) {
        this.lightdashConfig = args.lightdashConfig;
        this.logger = args.logger;
    }

    private getProvider(): SandboxProvider {
        if (!this.provider) {
            const { appRuntime } = this.lightdashConfig;
            if (
                appRuntime.sandboxProvider !== 'e2b' &&
                appRuntime.sandboxProvider !== 'docker'
            ) {
                throw new MissingConfigError(
                    `Python queries are not supported on the ${appRuntime.sandboxProvider} sandbox provider yet`,
                );
            }
            this.provider = createSandboxProvider({
                provider: appRuntime.sandboxProvider,
                e2bApiKey: appRuntime.e2bApiKey,
                dockerImage: appRuntime.sandboxPythonDockerImage,
                lambdaMicroVm: null,
                azureSandboxes: null,
                gcpCloudRun: null,
                // One-shot sandboxes are never suspended; the Docker provider
                // still requires a store at construction.
                snapshotStore:
                    appRuntime.sandboxProvider === 'docker'
                        ? new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          })
                        : null,
                logger: this.logger,
            });
        }
        return this.provider;
    }

    private buildSpec(timeoutMs: number): SandboxSpec {
        const { appRuntime } = this.lightdashConfig;
        return {
            templateRef:
                appRuntime.sandboxProvider === 'e2b'
                    ? `${appRuntime.e2bPythonTemplateName}:${appRuntime.e2bPythonTemplateTag}`
                    : appRuntime.sandboxPythonDockerImage,
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

        const handle = await traceSpan(
            {
                op: 'python.sandbox.create',
                name: 'python.sandbox.create',
                attributes,
            },
            () => provider.create(spec),
        );
        this.logger.info(
            `Python query ${queryUuid}: sandbox ${handle.sandboxId} created from ${spec.templateRef}`,
        );

        try {
            await traceSpan(
                {
                    op: 'python.sandbox.compile',
                    name: 'python.sandbox.compile',
                    attributes,
                },
                () => PythonSandboxRunner.compile(handle, code),
            );

            await traceSpan(
                {
                    op: 'python.sandbox.write_inputs',
                    name: 'python.sandbox.write_inputs',
                    attributes: {
                        ...attributes,
                        'lightdash.inputCount': inputs.length,
                        'lightdash.inputBytes': inputs.reduce(
                            (total, input) => total + input.jsonl.byteLength,
                            0,
                        ),
                    },
                },
                () =>
                    PythonSandboxRunner.writeInputs(handle, inputs, inputMeta),
            );

            const stdout = await traceSpan(
                {
                    op: 'python.sandbox.run',
                    name: 'python.sandbox.run',
                    attributes: {
                        ...attributes,
                        'lightdash.timeoutMs': timeoutMs,
                    },
                },
                () => PythonSandboxRunner.execute(handle, timeoutMs),
            );

            const [resultJsonl, resultMeta] = await traceSpan(
                {
                    op: 'python.sandbox.read_output',
                    name: 'python.sandbox.read_output',
                    attributes,
                },
                () =>
                    Promise.all([
                        handle.files.readBytes(PYTHON_OUTPUT_RESULT_PATH),
                        handle.files.read(PYTHON_OUTPUT_META_PATH),
                    ]),
            );
            return { resultJsonl, resultMeta, stdout };
        } finally {
            await traceSpan(
                {
                    op: 'python.sandbox.destroy',
                    name: 'python.sandbox.destroy',
                    attributes,
                },
                async () => {
                    try {
                        await provider.destroy(handle.sandboxId);
                    } catch (e) {
                        this.logger.warn(
                            `Python query ${queryUuid}: failed to destroy sandbox ${
                                handle.sandboxId
                            }: ${getErrorMessage(e)}`,
                        );
                    }
                },
            );
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
                { timeoutMs: COMPILE_TIMEOUT_MS },
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
        );
        await Promise.all(
            inputs.map((input) =>
                handle.files.write(
                    `${PYTHON_INPUT_DIR}/${input.name}.jsonl`,
                    input.jsonl,
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
                { timeoutMs },
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
