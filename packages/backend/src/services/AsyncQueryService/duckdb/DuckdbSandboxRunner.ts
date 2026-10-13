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
    DUCKDB_INPUT_DIR,
    DUCKDB_MAX_RESULT_BYTES,
    DUCKDB_OUTPUT_DIR,
    DUCKDB_OUTPUT_META_PATH,
    DUCKDB_OUTPUT_PROBE_PATH,
    DUCKDB_OUTPUT_RESULT_PATH,
    DUCKDB_PROBE_SQL_PATH,
    DUCKDB_RUN_SQL_PATH,
    DUCKDB_RUNNER_PATH,
    DUCKDB_RUNNER_SOURCE,
    DUCKDB_SETTINGS_PATH,
    DUCKDB_TEMP_DIR,
    DUCKDB_WORK_DIR,
    parseDuckdbProbeOutput,
    parseDuckdbRunMeta,
    type DuckdbSandboxFields,
    type DuckdbSandboxSettings,
} from './duckdbSandboxHarness';

/** One referenced result, written to `/work/in/<table>.jsonl`. */
export type DuckdbSandboxInput = {
    table: string;
    bytes: Buffer;
};

export type DuckdbSandboxCreateArgs = {
    queryUuid: string;
    projectUuid: string;
    /** Per-command timeout for the probe and the run; defaults to {@link DuckdbSandboxRunner.DUCKDB_RUN_TIMEOUT_MS}. */
    commandTimeoutMs?: number;
    /** Longest the caller may still wait for inputs after creation; 0 when they are ready. */
    referenceWaitMs: number;
};

export type DuckdbSandboxOpenArgs = DuckdbSandboxCreateArgs & {
    inputs: DuckdbSandboxInput[];
};

export type DuckdbSandboxRunResult = {
    fields: DuckdbSandboxFields;
    rowCount: number;
    /** `result.jsonl`: one `JSON.stringify(row)` line per row. */
    resultBytes: Buffer;
};

export type DuckdbSandboxSession = {
    probe(sql: string): Promise<{ fields: DuckdbSandboxFields }>;
    /** A null limit runs without a row cap; the result size cap always applies. */
    run(
        sql: string,
        options: { limit: number | null },
    ): Promise<DuckdbSandboxRunResult>;
    /** Destroys the sandbox; never throws. */
    close(): Promise<void>;
};

/** A created sandbox: inputs can be written once they are known. */
export type DuckdbSandbox = DuckdbSandboxSession & {
    writeInputs(inputs: DuckdbSandboxInput[]): Promise<void>;
};

/** Raised when the SQL fails, times out or produces too much; the message is safe to show. */
export class DuckdbSandboxExecutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DuckdbSandboxExecutionError';
    }
}

/** Lifetime budgeted for writing inputs and reading the output. */
export const DUCKDB_TRANSFER_MARGIN_MS = 2 * 60 * 1000;

/**
 * What the sandbox must outlive: the remaining reference wait, the probe and
 * the run, and the transfers. Expiry pauses an e2b sandbox and nothing resumes it.
 */
export const getDuckdbSandboxLifetimeMs = ({
    referenceWaitMs,
    commandTimeoutMs,
}: {
    referenceWaitMs: number;
    commandTimeoutMs: number;
}): number =>
    referenceWaitMs + 2 * commandTimeoutMs + DUCKDB_TRANSFER_MARGIN_MS;

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_META_BYTES = 1024 * 1024;
const TABLE_NAME = /^[A-Za-z0-9_-]+$/;

export const getDuckdbRunnerVersionHash = (runnerSource: string): string =>
    createHash('sha256').update(runnerSource).digest('hex').slice(0, 16);

/**
 * Runs DuckDB-over-results SQL in a one-shot sandbox: create, write inputs,
 * probe and/or run, read the output, destroy. The sandbox gets no credentials
 * and no egress; every byte crosses through the provider's file API.
 */
export class DuckdbSandboxRunner {
    static readonly DUCKDB_RUN_TIMEOUT_MS = 5 * 60 * 1000;

    private readonly lightdashConfig: LightdashConfig;

    private readonly logger: SandboxLogger;

    private readonly runnerSource: string;

    private readonly sandboxProvider: OneShotSandboxProvider;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        logger: SandboxLogger;
        /** Overrides the configured provider; null resolves it lazily from config. */
        provider: SandboxProvider | null;
        /** Overrides the runner script (tests only); null runs {@link DUCKDB_RUNNER_SOURCE}. */
        runnerSource: string | null;
    }) {
        this.lightdashConfig = args.lightdashConfig;
        this.logger = args.logger;
        this.runnerSource = args.runnerSource ?? DUCKDB_RUNNER_SOURCE;
        const { appRuntime } = args.lightdashConfig;
        this.sandboxProvider = new OneShotSandboxProvider({
            lightdashConfig: args.lightdashConfig,
            logger: args.logger,
            provider: args.provider,
            dockerImage: appRuntime.sandboxDuckdbDockerImage,
            e2bTemplateName: appRuntime.e2bDuckdbTemplateName,
            e2bTemplateTag: appRuntime.e2bDuckdbTemplateTag,
            runnerLabel: 'SQL transformations and merge queries',
        });
    }

    /** Resolves the provider now so a submit fails fast on missing configuration. */
    assertConfigured(): void {
        this.sandboxProvider.get();
    }

    /** What runs the SQL: the sandbox template and the runner script inside it. */
    get version(): string {
        return this.sandboxProvider.versionOf(
            getDuckdbRunnerVersionHash(this.runnerSource),
        );
    }

    private getSettings(): DuckdbSandboxSettings {
        const { appRuntime } = this.lightdashConfig;
        return {
            memoryLimit: appRuntime.duckdbSandboxMemoryLimit,
            threads: appRuntime.duckdbSandboxThreads,
        };
    }

    /** Creates a sandbox, writes the inputs, runs `fn` and destroys the sandbox. */
    async withSession<T>(
        { inputs, ...args }: DuckdbSandboxOpenArgs,
        fn: (session: DuckdbSandboxSession) => Promise<T>,
    ): Promise<T> {
        const sandbox = await this.create(args);
        try {
            await sandbox.writeInputs(inputs);
            return await fn(sandbox);
        } finally {
            await sandbox.close();
        }
    }

    /**
     * Creates the sandbox without inputs, so the cold start can overlap
     * waiting for them. Callers must `close()` it.
     */
    async create(args: DuckdbSandboxCreateArgs): Promise<DuckdbSandbox> {
        const {
            queryUuid,
            projectUuid,
            referenceWaitMs,
            commandTimeoutMs:
                timeoutMs = DuckdbSandboxRunner.DUCKDB_RUN_TIMEOUT_MS,
        } = args;
        const provider = this.sandboxProvider.get();
        const spec = this.sandboxProvider.buildSpec(
            getDuckdbSandboxLifetimeMs({
                referenceWaitMs,
                commandTimeoutMs: timeoutMs,
            }),
        );
        const settings = this.getSettings();
        const attributes = {
            'lightdash.queryUuid': queryUuid,
            'lightdash.projectUuid': projectUuid,
            'lightdash.sandboxProvider': this.sandboxProvider.providerName,
            'lightdash.templateRef': spec.templateRef,
            'lightdash.duckdbMemoryLimit': settings.memoryLimit,
            'lightdash.duckdbThreads': settings.threads,
            'lightdash.sandboxTimeoutMs': spec.timeoutMs,
        };

        const handle = await traceSpan(
            {
                op: 'duckdb.sandbox.create',
                name: 'duckdb.sandbox.create',
                attributes,
            },
            () => provider.create(spec),
        );
        this.logger.info(
            `DuckDB query ${queryUuid}: sandbox ${handle.sandboxId} created from ${spec.templateRef}`,
        );

        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            await traceSpan(
                {
                    op: 'duckdb.sandbox.destroy',
                    name: 'duckdb.sandbox.destroy',
                    attributes,
                },
                async () => {
                    try {
                        await provider.destroy(handle.sandboxId);
                    } catch (e) {
                        this.logger.warn(
                            `DuckDB query ${queryUuid}: failed to destroy sandbox ${
                                handle.sandboxId
                            }: ${getErrorMessage(e)}`,
                        );
                    }
                },
            );
        };

        const writeInputs = async (inputs: DuckdbSandboxInput[]) => {
            inputs.forEach((input) => {
                if (!TABLE_NAME.test(input.table)) {
                    throw new DuckdbSandboxExecutionError(
                        `Invalid sandbox input name: ${input.table}`,
                    );
                }
            });
            await traceSpan(
                {
                    op: 'duckdb.sandbox.write_inputs',
                    name: 'duckdb.sandbox.write_inputs',
                    attributes: {
                        ...attributes,
                        'lightdash.inputCount': inputs.length,
                        'lightdash.inputBytes': inputs.reduce(
                            (total, input) => total + input.bytes.byteLength,
                            0,
                        ),
                    },
                },
                () =>
                    Promise.all(
                        inputs.map((input) =>
                            handle.files.write(
                                `${DUCKDB_INPUT_DIR}/${input.table}.jsonl`,
                                input.bytes,
                            ),
                        ),
                    ),
            );
        };

        try {
            await this.prepare(handle, settings);
        } catch (e) {
            await close();
            throw e;
        }

        const execute = (command: 'probe' | 'run') =>
            DuckdbSandboxRunner.execute(handle, command, timeoutMs);

        return {
            writeInputs,
            probe: (sql) =>
                traceSpan(
                    {
                        op: 'duckdb.sandbox.probe',
                        name: 'duckdb.sandbox.probe',
                        attributes: {
                            ...attributes,
                            'lightdash.timeoutMs': timeoutMs,
                        },
                    },
                    async () => {
                        await handle.files.write(DUCKDB_PROBE_SQL_PATH, sql);
                        await execute('probe');
                        const raw = await DuckdbSandboxRunner.readOutput(
                            'metadata',
                            MAX_META_BYTES,
                            () =>
                                handle.files.read(DUCKDB_OUTPUT_PROBE_PATH, {
                                    maxBytes: MAX_META_BYTES,
                                }),
                        );
                        return parseDuckdbProbeOutput(raw);
                    },
                ),
            run: async (sql, { limit }) => {
                await traceSpan(
                    {
                        op: 'duckdb.sandbox.run',
                        name: 'duckdb.sandbox.run',
                        attributes: {
                            ...attributes,
                            'lightdash.timeoutMs': timeoutMs,
                        },
                    },
                    async () => {
                        await handle.files.write(DUCKDB_RUN_SQL_PATH, sql);
                        await execute('run');
                    },
                );
                return traceSpan(
                    {
                        op: 'duckdb.sandbox.read_output',
                        name: 'duckdb.sandbox.read_output',
                        attributes,
                    },
                    async (span) => {
                        const meta = parseDuckdbRunMeta(
                            await DuckdbSandboxRunner.readOutput(
                                'metadata',
                                MAX_META_BYTES,
                                () =>
                                    handle.files.read(DUCKDB_OUTPUT_META_PATH, {
                                        maxBytes: MAX_META_BYTES,
                                    }),
                            ),
                        );
                        span?.setAttributes({
                            'lightdash.rowCount': meta.rowCount,
                        });
                        if (limit !== null && meta.rowCount > limit) {
                            throw new DuckdbSandboxExecutionError(
                                `SQL transformation returned ${meta.rowCount} rows, more than the limit of ${limit}`,
                            );
                        }
                        const resultBytes =
                            await DuckdbSandboxRunner.readOutput(
                                'result',
                                DUCKDB_MAX_RESULT_BYTES,
                                () =>
                                    handle.files.readBytes(
                                        DUCKDB_OUTPUT_RESULT_PATH,
                                        { maxBytes: DUCKDB_MAX_RESULT_BYTES },
                                    ),
                            );
                        return {
                            fields: meta.fields,
                            rowCount: meta.rowCount,
                            resultBytes,
                        };
                    },
                );
            },
            close,
        };
    }

    /** Lays out `/work` and writes the runner and its settings; inputs come later. */
    private async prepare(
        handle: SandboxHandle,
        settings: DuckdbSandboxSettings,
    ): Promise<void> {
        await handle.commands.run(
            `mkdir -p ${DUCKDB_INPUT_DIR} ${DUCKDB_OUTPUT_DIR} ${DUCKDB_TEMP_DIR}`,
            { maxOutputBytes: MAX_LOG_BYTES },
        );
        await handle.files.write(DUCKDB_RUNNER_PATH, this.runnerSource);
        await handle.files.write(
            DUCKDB_SETTINGS_PATH,
            JSON.stringify(settings),
        );
    }

    private static async readOutput<T>(
        output: 'result' | 'metadata',
        maxBytes: number,
        read: () => Promise<T>,
    ): Promise<T> {
        try {
            return await read();
        } catch (e) {
            if (e instanceof SandboxOutputLimitError) {
                throw new DuckdbSandboxExecutionError(
                    `SQL transformation ${output} exceeds the ${
                        maxBytes / (1024 * 1024)
                    } MiB limit`,
                );
            }
            throw e;
        }
    }

    private static async execute(
        handle: SandboxHandle,
        command: 'probe' | 'run',
        timeoutMs: number,
    ): Promise<void> {
        try {
            await handle.commands.run(
                `node ${DUCKDB_RUNNER_PATH} ${command} ${DUCKDB_WORK_DIR}`,
                { timeoutMs, maxOutputBytes: MAX_LOG_BYTES },
            );
        } catch (e) {
            if (e instanceof SandboxCommandError) {
                throw new DuckdbSandboxExecutionError(
                    e.stderr.trim() || `exited with code ${e.exitCode}`,
                );
            }
            if (e instanceof SandboxTimeoutError) {
                throw new DuckdbSandboxExecutionError(
                    `SQL transformation exceeded ${Math.round(
                        timeoutMs / 1000,
                    )}s`,
                );
            }
            if (e instanceof SandboxOutputLimitError) {
                throw new DuckdbSandboxExecutionError(
                    'SQL transformation produced too much log output',
                );
            }
            throw e;
        }
    }
}
