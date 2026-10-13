import { getErrorMessage, MissingConfigError } from '@lightdash/common';
import { createHash } from 'crypto';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    createSandboxProvider,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from '../../../ee/services/SandboxRuntime';
import { traceSpan } from '../../../tracing/tracing';
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

export type DuckdbSandboxOpenArgs = {
    queryUuid: string;
    projectUuid: string;
    inputs: DuckdbSandboxInput[];
    /** Per-command timeout for the probe and the run. */
    timeoutMs: number;
};

export type DuckdbSandboxRunResult = {
    fields: DuckdbSandboxFields;
    rowCount: number;
    /** `result.jsonl`: one `JSON.stringify(row)` line per row. */
    resultBytes: Buffer;
};

export type DuckdbSandboxSession = {
    probe(sql: string): Promise<{ fields: DuckdbSandboxFields }>;
    run(
        sql: string,
        options: { limit: number },
    ): Promise<DuckdbSandboxRunResult>;
    /** Destroys the sandbox; never throws. */
    close(): Promise<void>;
};

/** Raised when the SQL fails, times out or produces too much; the message is safe to show. */
export class DuckdbSandboxExecutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DuckdbSandboxExecutionError';
    }
}

const SANDBOX_IDLE_MARGIN_MS = 60_000;
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
    static DUCKDB_RUN_TIMEOUT_MS = 5 * 60 * 1000;

    private readonly lightdashConfig: LightdashConfig;

    private readonly logger: SandboxLogger;

    private readonly runnerSource: string;

    private provider: SandboxProvider | null;

    constructor(args: {
        lightdashConfig: LightdashConfig;
        logger: SandboxLogger;
        /** Overrides the configured provider; null resolves it lazily from config. */
        provider?: SandboxProvider | null;
        /** Overrides the runner script; tests only. */
        runnerSource?: string;
    }) {
        this.lightdashConfig = args.lightdashConfig;
        this.logger = args.logger;
        this.provider = args.provider ?? null;
        this.runnerSource = args.runnerSource ?? DUCKDB_RUNNER_SOURCE;
    }

    /** Resolves the provider now so a submit fails fast on missing configuration. */
    assertConfigured(): void {
        this.getProvider();
    }

    private getProvider(): SandboxProvider {
        if (!this.provider) {
            const { appRuntime } = this.lightdashConfig;
            if (
                appRuntime.sandboxProvider !== 'e2b' &&
                appRuntime.sandboxProvider !== 'docker'
            ) {
                throw new MissingConfigError(
                    `SQL transformations and merge queries need the e2b or docker sandbox provider (SANDBOX_PROVIDER), got ${appRuntime.sandboxProvider}`,
                );
            }
            this.provider = createSandboxProvider({
                provider: appRuntime.sandboxProvider,
                e2bApiKey: appRuntime.e2bApiKey,
                dockerImage: appRuntime.sandboxDuckdbDockerImage,
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

    private getTemplateRef(): string {
        const { appRuntime } = this.lightdashConfig;
        return appRuntime.sandboxProvider === 'e2b'
            ? `${appRuntime.e2bDuckdbTemplateName}:${appRuntime.e2bDuckdbTemplateTag}`
            : appRuntime.sandboxDuckdbDockerImage;
    }

    /** What runs the SQL: the sandbox template and the runner script inside it. */
    get version(): string {
        return `${
            this.lightdashConfig.appRuntime.sandboxProvider
        }:${this.getTemplateRef()}:${getDuckdbRunnerVersionHash(
            this.runnerSource,
        )}`;
    }

    private buildSpec(timeoutMs: number): SandboxSpec {
        return {
            templateRef: this.getTemplateRef(),
            timeoutMs: timeoutMs + SANDBOX_IDLE_MARGIN_MS,
            egress: { allow: [] },
        };
    }

    private getSettings(): DuckdbSandboxSettings {
        const { appRuntime } = this.lightdashConfig;
        return {
            memoryLimit: appRuntime.duckdbSandboxMemoryLimit,
            threads: appRuntime.duckdbSandboxThreads,
        };
    }

    async withSession<T>(
        args: DuckdbSandboxOpenArgs,
        fn: (session: DuckdbSandboxSession) => Promise<T>,
    ): Promise<T> {
        const session = await this.open(args);
        try {
            return await fn(session);
        } finally {
            await session.close();
        }
    }

    async open(args: DuckdbSandboxOpenArgs): Promise<DuckdbSandboxSession> {
        const { queryUuid, projectUuid, inputs, timeoutMs } = args;
        inputs.forEach((input) => {
            if (!TABLE_NAME.test(input.table)) {
                throw new DuckdbSandboxExecutionError(
                    `Invalid sandbox input name: ${input.table}`,
                );
            }
        });
        const provider = this.getProvider();
        const spec = this.buildSpec(timeoutMs);
        const settings = this.getSettings();
        const attributes = {
            'lightdash.queryUuid': queryUuid,
            'lightdash.projectUuid': projectUuid,
            'lightdash.sandboxProvider':
                this.lightdashConfig.appRuntime.sandboxProvider,
            'lightdash.templateRef': spec.templateRef,
            'lightdash.duckdbMemoryLimit': settings.memoryLimit,
            'lightdash.duckdbThreads': settings.threads,
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

        try {
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
                () => this.writeInputs(handle, inputs, settings),
            );
        } catch (e) {
            await close();
            throw e;
        }

        const execute = (command: 'probe' | 'run') =>
            DuckdbSandboxRunner.execute(handle, command, timeoutMs);

        return {
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
                        const raw = await DuckdbSandboxRunner.readOutput(() =>
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
                            await DuckdbSandboxRunner.readOutput(() =>
                                handle.files.read(DUCKDB_OUTPUT_META_PATH, {
                                    maxBytes: MAX_META_BYTES,
                                }),
                            ),
                        );
                        span?.setAttributes({
                            'lightdash.rowCount': meta.rowCount,
                        });
                        if (meta.rowCount > limit) {
                            throw new DuckdbSandboxExecutionError(
                                `SQL transformation returned ${meta.rowCount} rows, more than the limit of ${limit}`,
                            );
                        }
                        const resultBytes =
                            await DuckdbSandboxRunner.readOutput(() =>
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

    private async writeInputs(
        handle: SandboxHandle,
        inputs: DuckdbSandboxInput[],
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
        await Promise.all(
            inputs.map((input) =>
                handle.files.write(
                    `${DUCKDB_INPUT_DIR}/${input.table}.jsonl`,
                    input.bytes,
                ),
            ),
        );
    }

    private static async readOutput<T>(read: () => Promise<T>): Promise<T> {
        try {
            return await read();
        } catch (e) {
            if (e instanceof SandboxOutputLimitError) {
                throw new DuckdbSandboxExecutionError(
                    `SQL transformation result exceeds the ${
                        DUCKDB_MAX_RESULT_BYTES / (1024 * 1024)
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
