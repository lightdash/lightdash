import { getErrorMessage } from '@lightdash/common';
import { createHash } from 'crypto';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
} from '../../../ee/services/SandboxRuntime';
import { traceSpan } from '../../../tracing/tracing';
import { OneShotSandboxProvider } from '../sandbox/OneShotSandboxProvider';
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
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_META_BYTES = 1024 * 1024;

/**
 * Runs one python query in a fresh sandbox: create, compile, feed inputs,
 * run the harness, read the output, destroy. The sandbox gets no credentials
 * and no egress; every byte crosses through the provider's file API.
 */
export class PythonSandboxRunner {
    private readonly logger: SandboxLogger;

    private readonly sandboxProvider: OneShotSandboxProvider;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        logger: SandboxLogger;
        /** Overrides the configured provider; null resolves it lazily from config. */
        provider: SandboxProvider | null;
    }) {
        this.logger = args.logger;
        const { appRuntime } = args.lightdashConfig;
        this.sandboxProvider = new OneShotSandboxProvider({
            lightdashConfig: args.lightdashConfig,
            logger: args.logger,
            provider: args.provider,
            dockerImage: appRuntime.sandboxPythonDockerImage,
            e2bTemplateName: appRuntime.e2bPythonTemplateName,
            e2bTemplateTag: appRuntime.e2bPythonTemplateTag,
            runnerLabel: 'Python queries',
        });
    }

    /** Resolves the provider now so a submit fails fast on missing configuration. */
    assertConfigured(): void {
        this.sandboxProvider.get();
    }

    /** What runs the code: the sandbox template and the harness inside it. */
    get version(): string {
        return this.sandboxProvider.versionOf(
            createHash('sha256')
                .update(PYTHON_RUNNER_SOURCE)
                .digest('hex')
                .slice(0, 16),
        );
    }

    async run(args: PythonSandboxRunArgs): Promise<PythonSandboxRunResult> {
        const { queryUuid, code, inputs, inputMeta, timeoutMs } = args;
        const provider = this.sandboxProvider.get();
        const spec = this.sandboxProvider.buildSpec(timeoutMs);
        const attributes = {
            'lightdash.queryUuid': queryUuid,
            'lightdash.sandboxProvider': this.sandboxProvider.providerName,
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
