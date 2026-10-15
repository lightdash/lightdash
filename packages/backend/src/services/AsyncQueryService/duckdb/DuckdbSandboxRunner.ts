import { getErrorMessage } from '@lightdash/common';
import { createHash } from 'crypto';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    SandboxCommandError,
    SandboxOutputLimitError,
    SandboxTimeoutError,
    type SandboxFileEntry,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
} from '../../../ee/services/SandboxRuntime';
import { traceSpan } from '../../../tracing/tracing';
import { OneShotSandboxProvider } from '../sandbox/OneShotSandboxProvider';
import {
    DUCKDB_MAX_RESULT_BYTES,
    DUCKDB_RUNNER_SOURCE,
    getDuckdbNodeWorkPaths,
    parseDuckdbProbeOutput,
    parseDuckdbRunMeta,
    type DuckdbSandboxFields,
    type DuckdbSandboxSettings,
} from './duckdbSandboxHarness';

/** One referenced result, written to `<node work dir>/in/<table>.jsonl`. */
export type DuckdbSandboxInput = {
    table: string;
    bytes: Buffer;
};

export type DuckdbSandboxLeaseArgs = {
    projectUuid: string;
    /** Nodes that will claim the lease; the sandbox dies when all released. */
    nodeCount: number;
    /** Per-command timeout for the probe and the run; defaults to {@link DuckdbSandboxRunner.DUCKDB_RUN_TIMEOUT_MS}. */
    commandTimeoutMs?: number;
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
    /** Releases the node's claim; the sandbox is destroyed with the last one. Never throws. */
    close(): Promise<void>;
};

/** A node's view of a sandbox: inputs are staged and land with the next command. */
export type DuckdbSandbox = DuckdbSandboxSession & {
    stageInputs(inputs: DuckdbSandboxInput[]): void;
};

/** Raised when the SQL fails, times out or produces too much; the message is safe to show. */
export class DuckdbSandboxExecutionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DuckdbSandboxExecutionError';
    }
}

/** Lifetime budgeted per node for writing inputs and reading the output. */
export const DUCKDB_TRANSFER_MARGIN_MS = 2 * 60 * 1000;

/**
 * What the sandbox must outlive: the remaining reference wait, then for every
 * node its probe, its run and its transfers. Expiry pauses an e2b sandbox and
 * nothing resumes it.
 */
export const getDuckdbSandboxLifetimeMs = ({
    referenceWaitMs,
    commandTimeoutMs,
    nodeCount = 1,
}: {
    referenceWaitMs: number;
    commandTimeoutMs: number;
    nodeCount?: number;
}): number =>
    referenceWaitMs +
    nodeCount * (2 * commandTimeoutMs + DUCKDB_TRANSFER_MARGIN_MS);

/** Longest a probe or a run may take inside the sandbox. */
export const DUCKDB_RUN_TIMEOUT_MS = 5 * 60 * 1000;

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_META_BYTES = 1024 * 1024;
const TABLE_NAME = /^[A-Za-z0-9_-]+$/;

export const getDuckdbRunnerVersionHash = (runnerSource: string): string =>
    createHash('sha256').update(runnerSource).digest('hex').slice(0, 16);

type LeaseContext = {
    provider: SandboxProvider;
    providerName: string;
    buildSpec: OneShotSandboxProvider['buildSpec'];
    logger: SandboxLogger;
    settings: DuckdbSandboxSettings;
    runnerSource: string;
};

/**
 * A node's claim on a lease. `open` joins (or creates) the sandbox and
 * returns the node's session; `release` counts the node down whether or not
 * it ever opened.
 */
export class DuckdbSandboxClaim {
    private readonly lease: DuckdbSandboxLease;

    private readonly queryUuid: string;

    private readonly commandTimeoutMs: number;

    private released = false;

    constructor(
        lease: DuckdbSandboxLease,
        queryUuid: string,
        commandTimeoutMs: number,
    ) {
        this.lease = lease;
        this.queryUuid = queryUuid;
        this.commandTimeoutMs = commandTimeoutMs;
    }

    /** Starts the sandbox without opening the node; see {@link DuckdbSandboxLease.start}. */
    start(referenceWaitMs: number): void {
        void this.lease.start(this.queryUuid, referenceWaitMs);
    }

    async open(referenceWaitMs: number): Promise<DuckdbSandbox> {
        const handle = await this.lease.start(this.queryUuid, referenceWaitMs);
        return this.session(handle);
    }

    async release(): Promise<void> {
        if (this.released) return;
        this.released = true;
        await this.lease.release();
    }

    private session(handle: SandboxHandle): DuckdbSandbox {
        const { queryUuid, commandTimeoutMs: timeoutMs } = this;
        const { settings, runnerSource, providerName } = this.lease.runtime;
        const paths = getDuckdbNodeWorkPaths(queryUuid);
        const attributes = {
            'lightdash.queryUuid': queryUuid,
            'lightdash.projectUuid': this.lease.projectUuid,
            'lightdash.sandboxProvider': providerName,
            'lightdash.timeoutMs': timeoutMs,
        };
        // Everything the next command needs, sent in one write: the runner
        // and settings the first time, the staged inputs, then the SQL
        let staged: SandboxFileEntry[] = [
            { path: paths.runnerPath, contents: runnerSource },
            { path: paths.settingsPath, contents: JSON.stringify(settings) },
        ];
        let stagedInputBytes = 0;

        const flush = async (sql: { path: string; contents: string }) => {
            const entries = [...staged, sql];
            const inputBytes = stagedInputBytes;
            staged = [];
            stagedInputBytes = 0;
            await traceSpan(
                {
                    op: 'duckdb.sandbox.write_inputs',
                    name: 'duckdb.sandbox.write_inputs',
                    attributes: {
                        ...attributes,
                        'lightdash.fileCount': entries.length,
                        'lightdash.inputBytes': inputBytes,
                    },
                },
                () => handle.files.writeMany(entries),
            );
        };

        const execute = (command: 'probe' | 'run') =>
            DuckdbSandboxClaim.execute(
                handle,
                command,
                paths.workDir,
                paths.runnerPath,
                timeoutMs,
            );

        return {
            stageInputs: (inputs) => {
                inputs.forEach((input) => {
                    if (!TABLE_NAME.test(input.table)) {
                        throw new DuckdbSandboxExecutionError(
                            `Invalid sandbox input name: ${input.table}`,
                        );
                    }
                    staged.push({
                        path: `${paths.inputDir}/${input.table}.jsonl`,
                        contents: input.bytes,
                    });
                    stagedInputBytes += input.bytes.byteLength;
                });
            },
            probe: (sql) =>
                traceSpan(
                    {
                        op: 'duckdb.sandbox.probe',
                        name: 'duckdb.sandbox.probe',
                        attributes,
                    },
                    async () => {
                        await flush({
                            path: paths.probeSqlPath,
                            contents: sql,
                        });
                        const { stdout } = await execute('probe');
                        return parseDuckdbProbeOutput(stdout);
                    },
                ),
            run: async (sql, { limit }) => {
                const meta = await traceSpan(
                    {
                        op: 'duckdb.sandbox.run',
                        name: 'duckdb.sandbox.run',
                        attributes,
                    },
                    async (span) => {
                        await flush({ path: paths.runSqlPath, contents: sql });
                        const { stdout } = await execute('run');
                        const parsed = parseDuckdbRunMeta(stdout);
                        span?.setAttributes({
                            'lightdash.rowCount': parsed.rowCount,
                        });
                        return parsed;
                    },
                );
                if (limit !== null && meta.rowCount > limit) {
                    throw new DuckdbSandboxExecutionError(
                        `SQL transformation returned ${meta.rowCount} rows, more than the limit of ${limit}`,
                    );
                }
                const resultBytes = await traceSpan(
                    {
                        op: 'duckdb.sandbox.read_output',
                        name: 'duckdb.sandbox.read_output',
                        attributes: {
                            ...attributes,
                            'lightdash.rowCount': meta.rowCount,
                        },
                    },
                    () =>
                        DuckdbSandboxClaim.readOutput(
                            'result',
                            DUCKDB_MAX_RESULT_BYTES,
                            () =>
                                handle.files.readBytes(paths.resultPath, {
                                    maxBytes: DUCKDB_MAX_RESULT_BYTES,
                                }),
                        ),
                );
                return {
                    fields: meta.fields,
                    rowCount: meta.rowCount,
                    resultBytes,
                };
            },
            close: () => this.release(),
        };
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

    /** Runs the command; its stdout is the metadata, capped like the logs. */
    private static async execute(
        handle: SandboxHandle,
        command: 'probe' | 'run',
        workDir: string,
        runnerPath: string,
        timeoutMs: number,
    ): Promise<{ stdout: string }> {
        try {
            const result = await handle.commands.run(
                `python3 -I ${runnerPath} ${command} ${workDir}`,
                {
                    timeoutMs,
                    maxOutputBytes: MAX_LOG_BYTES + MAX_META_BYTES,
                },
            );
            if (Buffer.byteLength(result.stdout, 'utf8') > MAX_META_BYTES) {
                throw new DuckdbSandboxExecutionError(
                    `SQL transformation metadata exceeds the ${
                        MAX_META_BYTES / (1024 * 1024)
                    } MiB limit`,
                );
            }
            return { stdout: result.stdout };
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
                    'SQL transformation produced too much output',
                );
            }
            throw e;
        }
    }
}

/**
 * One sandbox shared by the nodes of a submission. The first node to open
 * creates it; every node runs in its own directory under /work; the last
 * release destroys it. Claims that never open still count down, so a node
 * served from cache or refused before it runs does not strand the sandbox.
 */
export class DuckdbSandboxLease {
    private readonly context: LeaseContext;

    private readonly args: DuckdbSandboxLeaseArgs;

    private readonly commandTimeoutMs: number;

    private pending: number;

    private sandbox: Promise<SandboxHandle> | null = null;

    private destroyed = false;

    constructor(context: LeaseContext, args: DuckdbSandboxLeaseArgs) {
        this.context = context;
        this.args = args;
        this.commandTimeoutMs = args.commandTimeoutMs ?? DUCKDB_RUN_TIMEOUT_MS;
        this.pending = args.nodeCount;
    }

    get projectUuid(): string {
        return this.args.projectUuid;
    }

    /** Nodes still to release; the sandbox is destroyed when this reaches zero. */
    get pendingNodes(): number {
        return this.pending;
    }

    /**
     * Starts the sandbox now so the cold start overlaps a wait still to come.
     * `referenceWaitMs` budgets that wait into the lifetime; later starters
     * join the sandbox that already exists.
     */
    start(queryUuid: string, referenceWaitMs: number): Promise<SandboxHandle> {
        if (this.destroyed) {
            throw new Error('DuckDB sandbox lease already released');
        }
        if (!this.sandbox) {
            this.sandbox = this.create(queryUuid, referenceWaitMs);
            // Awaited by the node that opens; until then a failure must not go unhandled
            this.sandbox.catch(() => undefined);
        }
        return this.sandbox;
    }

    /** Nodes that will never claim: a submission that failed before dispatching them. */
    async forfeit(nodeCount: number): Promise<void> {
        for (let i = 0; i < nodeCount; i += 1) {
            // eslint-disable-next-line no-await-in-loop -- destroy happens once, on the last release
            await this.release();
        }
    }

    /** One node's claim: opens its own work directory in the shared sandbox. */
    claim(queryUuid: string): DuckdbSandboxClaim {
        return new DuckdbSandboxClaim(this, queryUuid, this.commandTimeoutMs);
    }

    /** @internal called by claims */
    async release(): Promise<void> {
        if (this.pending === 0) return;
        this.pending -= 1;
        if (this.pending > 0 || this.destroyed) return;
        this.destroyed = true;
        const started = this.sandbox;
        this.sandbox = null;
        if (!started) return;
        const handle = await started.then(
            (sandbox) => sandbox,
            () => null,
        );
        if (!handle) return;
        await traceSpan(
            {
                op: 'duckdb.sandbox.destroy',
                name: 'duckdb.sandbox.destroy',
                attributes: this.attributes(),
            },
            async () => {
                try {
                    await this.context.provider.destroy(handle.sandboxId);
                } catch (e) {
                    this.context.logger.warn(
                        `DuckDB sandbox ${
                            handle.sandboxId
                        }: failed to destroy: ${getErrorMessage(e)}`,
                    );
                }
            },
        );
    }

    /** @internal */
    get runtime(): LeaseContext {
        return this.context;
    }

    private attributes(): Record<string, string | number> {
        return {
            'lightdash.projectUuid': this.args.projectUuid,
            'lightdash.sandboxProvider': this.context.providerName,
            'lightdash.duckdbMemoryLimit': this.context.settings.memoryLimit,
            'lightdash.duckdbThreads': this.context.settings.threads,
            'lightdash.sandboxNodeCount': this.args.nodeCount,
        };
    }

    private async create(
        queryUuid: string,
        referenceWaitMs: number,
    ): Promise<SandboxHandle> {
        const spec = this.context.buildSpec(
            getDuckdbSandboxLifetimeMs({
                referenceWaitMs,
                commandTimeoutMs: this.commandTimeoutMs,
                nodeCount: this.pending,
            }),
        );
        const handle = await traceSpan(
            {
                op: 'duckdb.sandbox.create',
                name: 'duckdb.sandbox.create',
                attributes: {
                    ...this.attributes(),
                    'lightdash.queryUuid': queryUuid,
                    'lightdash.templateRef': spec.templateRef,
                    'lightdash.sandboxTimeoutMs': spec.timeoutMs,
                },
            },
            () => this.context.provider.create(spec),
        );
        this.context.logger.info(
            `DuckDB query ${queryUuid}: sandbox ${handle.sandboxId} created from ${spec.templateRef} for ${this.pending} node(s)`,
        );
        return handle;
    }
}

/**
 * Runs DuckDB-over-results SQL in sandboxes leased per submission: the nodes
 * of one submission share a sandbox, each in its own directory. Per node:
 * one write of runner, inputs and SQL, one command whose stdout is the
 * metadata, one read of the rows. The sandbox gets no credentials and no
 * egress; every byte crosses through the provider's file API.
 */
export class DuckdbSandboxRunner {
    static readonly DUCKDB_RUN_TIMEOUT_MS = DUCKDB_RUN_TIMEOUT_MS;

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

    /** A sandbox to share between the DuckDB nodes of one submission. */
    createLease(args: DuckdbSandboxLeaseArgs): DuckdbSandboxLease {
        const provider = this.sandboxProvider.get();
        return new DuckdbSandboxLease(
            {
                provider,
                providerName: this.sandboxProvider.providerName,
                buildSpec: (timeoutMs) =>
                    this.sandboxProvider.buildSpec(timeoutMs),
                logger: this.logger,
                settings: this.getSettings(),
                runnerSource: this.runnerSource,
            },
            args,
        );
    }

    /** Creates a sandbox for one node, stages the inputs, runs `fn` and destroys the sandbox. */
    async withSession<T>(
        { inputs, ...args }: DuckdbSandboxOpenArgs,
        fn: (session: DuckdbSandboxSession) => Promise<T>,
    ): Promise<T> {
        const sandbox = await this.create(args);
        try {
            sandbox.stageInputs(inputs);
            return await fn(sandbox);
        } finally {
            await sandbox.close();
        }
    }

    /**
     * A sandbox for one node, created without inputs so the cold start can
     * overlap waiting for them. Callers must `close()` it.
     */
    create(args: DuckdbSandboxCreateArgs): Promise<DuckdbSandbox> {
        const { queryUuid, projectUuid, referenceWaitMs, commandTimeoutMs } =
            args;
        return this.createLease({ projectUuid, nodeCount: 1, commandTimeoutMs })
            .claim(queryUuid)
            .open(referenceWaitMs);
    }
}
