import { FeatureFlags, getErrorMessage } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { createHash, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { z } from 'zod';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import { S3Config } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import PrometheusMetrics from '../../prometheus/PrometheusMetrics';
import type {
    UsageProcessingResult,
    UsageProcessingStage,
} from '../../prometheus/UsageProcessingMetrics';
import { quoteDuckdbIdentifier } from '../../utils/duckdb/duckdbSqlTables';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { getCompactedStreamColumns } from './registry';
import { CompactedStreamColumn } from './types';
import {
    UsageDimensionsRefresher,
    type DimensionRefreshSummary,
} from './UsageDimensionsRefresher';
import { usageProcessingStartDate } from './usageProcessingWindow';
import {
    UsageUserActivityBuilder,
    type UserActivitySummary,
} from './UsageUserActivityBuilder';

const RAW_KEY_PREFIX = 'events/raw/';
const COMPACTED_KEY_PREFIX = 'events/compacted';
export const MAX_PARTITIONS_PER_RUN = 500;
const DELETE_BATCH_SIZE = 1000;
export const DELETE_MAX_ATTEMPTS = 3;
const DELETE_RETRY_BASE_DELAY_MS = 1_000;

const sleep = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const RAW_KEY_PATTERN =
    /^events\/raw\/org_id=([^/=]+)\/stream=([^/=]+)\/dt=(\d{4}-\d{2}-\d{2})\/[^/]+\.jsonl\.gz$/;

export type RawPartition = {
    orgId: string;
    stream: string;
    dt: string;
    keys: string[];
};

export type ParsedRawKey = {
    orgId: string;
    stream: string;
    dt: string;
    key: string;
};

export const parseRawKey = (key: string): ParsedRawKey | null => {
    const match = key.match(RAW_KEY_PATTERN);
    if (!match) return null;
    return { orgId: match[1], stream: match[2], dt: match[3], key };
};

/**
 * Groups raw object keys into (org_id, stream, dt) partitions, keeping only
 * closed partitions (dt strictly before today's UTC date). Unparseable keys
 * are ignored. Partitions are returned oldest-first so a capped run drains
 * the backlog in order.
 */
export const groupRawKeysIntoPartitions = (
    keys: string[],
    todayUtc: string,
): RawPartition[] => {
    const partitions = new Map<string, RawPartition>();
    keys.forEach((key) => {
        const parsed = parseRawKey(key);
        if (!parsed || parsed.dt >= todayUtc) return;
        const partitionKey = `${parsed.orgId}|${parsed.stream}|${parsed.dt}`;
        const partition = partitions.get(partitionKey);
        if (partition) {
            partition.keys.push(key);
        } else {
            partitions.set(partitionKey, {
                orgId: parsed.orgId,
                stream: parsed.stream,
                dt: parsed.dt,
                keys: [key],
            });
        }
    });
    return Array.from(partitions.values()).sort(
        (a, b) =>
            a.dt.localeCompare(b.dt) ||
            a.orgId.localeCompare(b.orgId) ||
            a.stream.localeCompare(b.stream),
    );
};

/**
 * Deterministic parquet part name derived from the raw input file set, so a
 * re-run over the same inputs overwrites the same part instead of duplicating
 * rows. Late-arriving raw files produce a different set and thus a new part.
 */
export const buildPartFileName = (rawKeys: string[]): string => {
    const hash = createHash('sha1')
        .update([...rawKeys].sort().join('\n'))
        .digest('hex');
    return `part-${hash}.parquet`;
};

const escapeSqlString = (value: string): string => value.replace(/'/g, "''");

export const buildCompactionSql = ({
    bucket,
    partition,
    columns,
    storageScheme = 's3',
}: {
    bucket: string;
    partition: RawPartition;
    columns: CompactedStreamColumn[];
    storageScheme?: 's3' | 'gs';
}): { sql: string; compactedKey: string } => {
    const compactedKey = `${COMPACTED_KEY_PREFIX}/org_id=${partition.orgId}/stream=${
        partition.stream
    }/dt=${partition.dt}/${buildPartFileName(partition.keys)}`;
    const columnDefs = columns
        .map(
            (column) =>
                `${quoteDuckdbIdentifier(column.name)}: '${column.type}'`,
        )
        .join(', ');
    const selectList = columns
        .map((column) => quoteDuckdbIdentifier(column.name))
        .join(', ');
    // Read the exact listed files (not a glob) so objects written between
    // listing and COPY are never deleted uncompacted nor compacted twice.
    const fileList = partition.keys
        .map(
            (key) =>
                `'${storageScheme}://${escapeSqlString(`${bucket}/${key}`)}'`,
        )
        .join(', ');
    const sql = `COPY (SELECT ${selectList} FROM read_json([${fileList}], format='newline_delimited', columns={${columnDefs}})) TO '${storageScheme}://${escapeSqlString(
        `${bucket}/${compactedKey}`,
    )}' (FORMAT PARQUET, COMPRESSION zstd)`;
    return { sql, compactedKey };
};

export type CompactionRunSummary = {
    partitionsDiscovered: number;
    partitionsCompacted: number;
    partitionsFailed: number;
    partitionsSkippedUnknownStream: number;
    rawObjectsDeleted: number;
};

export type UsageEventsCompactorArgs = {
    s3Config: Omit<S3Config, 'expirationTime'>;
    prometheusMetrics: PrometheusMetrics | null;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    usageDimensionsModel: Pick<
        UsageDimensionsModel,
        'getOrganizations' | 'getJsonLines'
    >;
};

/**
 * Nightly compaction of the usage-events raw zone: converts every closed
 * (org_id, stream, dt) partition of gzip JSONL objects into a typed zstd
 * parquet part, then deletes exactly the raw objects it read. Per-partition
 * failures are logged and counted without aborting the run.
 */
export class UsageEventsCompactor extends S3BaseClient {
    private readonly bucket: string;

    private readonly s3Config: Omit<S3Config, 'expirationTime'>;

    private readonly prometheusMetrics: PrometheusMetrics | null;

    private readonly usageDimensionsModel: Pick<
        UsageDimensionsModel,
        'getOrganizations' | 'getJsonLines'
    >;

    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    constructor(args: UsageEventsCompactorArgs) {
        super(args.s3Config);
        this.bucket = args.s3Config.bucket;
        this.featureFlagModel = args.featureFlagModel;
        this.s3Config = args.s3Config;
        this.prometheusMetrics = args.prometheusMetrics;
        this.usageDimensionsModel = args.usageDimensionsModel;
    }

    async run(now: Date = new Date()): Promise<
        CompactionRunSummary & {
            dimensions: DimensionRefreshSummary;
            users: UserActivitySummary;
        }
    > {
        const runId = randomUUID();
        try {
            return await this.monitorStage(
                runId,
                'pipeline',
                async () => {
                    const organizations: {
                        organization_id: number;
                        organization_uuid: string;
                    }[] = [];
                    for await (const organization of this.usageDimensionsModel.getOrganizations()) {
                        const { enabled } = await this.featureFlagModel.get({
                            featureFlagId: FeatureFlags.AnalyticsProject,
                            user: {
                                organizationUuid:
                                    organization.organization_uuid,
                            },
                        });
                        if (enabled) organizations.push(organization);
                    }
                    const orgIds = organizations.map(
                        (organization) => organization.organization_uuid,
                    );
                    const summary = await this.monitorStage(
                        runId,
                        'compaction',
                        () => this.compactEvents(now, orgIds),
                        UsageEventsCompactor.compactionOutcome,
                    );
                    const dimensions = await this.monitorStage(
                        runId,
                        'dimensions',
                        () =>
                            new UsageDimensionsRefresher(
                                this.s3Config,
                                {
                                    async *getOrganizations() {
                                        yield* organizations;
                                    },
                                    getJsonLines:
                                        this.usageDimensionsModel.getJsonLines.bind(
                                            this.usageDimensionsModel,
                                        ),
                                },
                                this.createDuckdbClient(),
                            ).run(),
                        (result) => ({
                            outcome: result.failed > 0 ? 'failed' : 'success',
                            failed: result.failed,
                            remaining: result.failed,
                        }),
                    );
                    if (dimensions.failed > 0) {
                        throw new Error(
                            `Usage dimensions: ${dimensions.failed} refreshes failed; previous snapshots retained`,
                        );
                    }
                    const users = await this.monitorStage(
                        runId,
                        'users',
                        () =>
                            new UsageUserActivityBuilder(this.s3Config).runAll(
                                now,
                                orgIds,
                            ),
                        UsageEventsCompactor.usersOutcome,
                    );
                    if (users.failed > 0)
                        throw new Error(
                            `User activity: ${users.failed} partitions failed; previous output retained`,
                        );
                    return { ...summary, dimensions, users };
                },
                (result) => {
                    const rawOutcome =
                        UsageEventsCompactor.compactionOutcome(result).outcome;
                    const usersOutcome = UsageEventsCompactor.usersOutcome(
                        result.users,
                    ).outcome;
                    if (rawOutcome === 'failed') return { outcome: 'failed' };
                    return {
                        outcome:
                            rawOutcome === 'partial' ||
                            usersOutcome === 'partial'
                                ? 'partial'
                                : 'success',
                    };
                },
            );
        } finally {
            this.s3?.destroy();
        }
    }

    private static compactionOutcome(
        summary: CompactionRunSummary,
    ): UsageProcessingResult {
        const remaining =
            summary.partitionsDiscovered - summary.partitionsCompacted;
        const outcome = remaining > 0 ? 'partial' : 'success';
        return {
            outcome: summary.partitionsFailed > 0 ? 'failed' : outcome,
            failed: summary.partitionsFailed,
            // Includes unknown streams, which must not count as complete catch-up.
            remaining,
            limitReached: summary.partitionsDiscovered > MAX_PARTITIONS_PER_RUN,
        };
    }

    private static usersOutcome(
        summary: UserActivitySummary,
    ): UsageProcessingResult {
        const outcome =
            summary.deferred > 0 || summary.limitReached
                ? 'partial'
                : 'success';
        return {
            outcome: summary.failed > 0 ? 'failed' : outcome,
            failed: summary.failed,
            remaining: summary.failed + summary.deferred,
            limitReached: summary.limitReached,
        };
    }

    private recordMetrics(record: () => void) {
        try {
            record();
        } catch {
            Logger.warn('Failed to record usage processing metrics');
        }
    }

    private async monitorStage<T>(
        runId: string,
        stage: UsageProcessingStage,
        run: () => Promise<T>,
        summarize: (result: T) => UsageProcessingResult,
    ): Promise<T> {
        const start = performance.now();
        let result: UsageProcessingResult = { outcome: 'failed' };
        this.recordMetrics(() =>
            this.prometheusMetrics?.usageProcessing?.start(stage),
        );
        Logger.info('Usage processing stage started', { runId, stage });
        try {
            const value = await run();
            result = summarize(value);
            return value;
        } finally {
            const durationSeconds = (performance.now() - start) / 1000;
            this.recordMetrics(() =>
                this.prometheusMetrics?.usageProcessing?.finish(
                    stage,
                    result,
                    durationSeconds,
                ),
            );
            // Fixed fields and counts only: never serialize SDK errors or event data.
            Logger.info('Usage processing stage finished', {
                runId,
                stage,
                durationSeconds,
                ...result,
            });
        }
    }

    private async compactEvents(
        now: Date,
        orgIds: string[],
    ): Promise<CompactionRunSummary> {
        const runStart = Date.now();
        const todayUtc = now.toISOString().slice(0, 10);
        const { keys: rawKeys, bytesByKey } = await this.listRawKeys(orgIds);
        let partitions = groupRawKeysIntoPartitions(rawKeys, todayUtc).filter(
            (partition) => partition.dt >= usageProcessingStartDate(now),
        );
        const summary: CompactionRunSummary = {
            partitionsDiscovered: partitions.length,
            partitionsCompacted: 0,
            partitionsFailed: 0,
            partitionsSkippedUnknownStream: 0,
            rawObjectsDeleted: 0,
        };
        if (partitions.length === 0) {
            this.recordMetrics(() => {
                this.prometheusMetrics?.setUsageEventsCompactionBacklog(0);
                this.prometheusMetrics?.setUsageEventsRawObjects(
                    rawKeys.length,
                );
                this.prometheusMetrics?.observeUsageEventsCompactionRunDuration(
                    Date.now() - runStart,
                    'success',
                );
            });
            Logger.info('Usage events compaction: no closed partitions found');
            return summary;
        }
        if (partitions.length > MAX_PARTITIONS_PER_RUN) {
            Logger.warn(
                `Usage events compaction: capping run to ${MAX_PARTITIONS_PER_RUN} of ${partitions.length} closed partitions`,
            );
            partitions = partitions.slice(0, MAX_PARTITIONS_PER_RUN);
        }

        const duckdb = this.createDuckdbClient();
        for (let i = 0; i < partitions.length; i += 1) {
            const partition = partitions[i];
            const partitionLabel = `org_id=${partition.orgId}/stream=${partition.stream}/dt=${partition.dt}`;
            const columns = getCompactedStreamColumns(partition.stream);
            if (columns === null) {
                summary.partitionsSkippedUnknownStream += 1;
                Logger.warn(
                    `Usage events compaction: skipping unknown stream partition ${partitionLabel} (${partition.keys.length} raw objects left in place)`,
                );
            } else {
                const partitionStart = Date.now();
                const partitionRawBytes = partition.keys.reduce(
                    (total, key) => total + (bytesByKey.get(key) ?? 0),
                    0,
                );
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const deleted = await this.compactPartition(
                        partition,
                        columns,
                        duckdb,
                    );
                    summary.partitionsCompacted += 1;
                    summary.rawObjectsDeleted += deleted;
                    this.recordMetrics(() => {
                        this.prometheusMetrics?.incrementUsageEventsCompactedPartitions();
                        this.prometheusMetrics?.observeUsageEventsCompactionPartition(
                            Date.now() - partitionStart,
                            'success',
                            partitionRawBytes,
                        );
                    });
                    Logger.info(
                        `Usage events compaction: processed ${partitionLabel}; ${deleted} raw objects deleted in ${Date.now() - partitionStart}ms`,
                    );
                } catch (error) {
                    summary.partitionsFailed += 1;
                    this.recordMetrics(() => {
                        this.prometheusMetrics?.incrementUsageEventsCompactionFailures();
                        this.prometheusMetrics?.observeUsageEventsCompactionPartition(
                            Date.now() - partitionStart,
                            'failed',
                            partitionRawBytes,
                        );
                    });
                    Logger.error(
                        `Usage events compaction: failed partition ${partitionLabel}: ${getErrorMessage(
                            error,
                        )}`,
                    );
                }
            }
        }

        // Failed and cap-deferred partitions stay in the raw zone for the
        // next run; a growing gauge means compaction is falling behind.
        // Unknown-stream partitions are excluded: they are not retryable work
        // (they compact only once their stream is registered) and are
        // surfaced via the warn log above instead.
        this.recordMetrics(() => {
            this.prometheusMetrics?.setUsageEventsCompactionBacklog(
                summary.partitionsDiscovered -
                    summary.partitionsCompacted -
                    summary.partitionsSkippedUnknownStream,
            );
            // Raw objects left behind: open (today) partitions, failed/deferred
            // partitions, and unknown streams. Sustained growth here means the
            // writer is producing files faster than compaction reclaims them.
            this.prometheusMetrics?.setUsageEventsRawObjects(
                rawKeys.length - summary.rawObjectsDeleted,
            );
            this.prometheusMetrics?.observeUsageEventsCompactionRunDuration(
                Date.now() - runStart,
                summary.partitionsFailed > 0 ? 'partial' : 'success',
            );
        });
        Logger.info(
            `Usage events compaction complete in ${
                Date.now() - runStart
            }ms: ${summary.partitionsCompacted} partitions compacted (${summary.rawObjectsDeleted} raw objects deleted), ${summary.partitionsFailed} failed, ${summary.partitionsSkippedUnknownStream} skipped (unknown stream), ${summary.partitionsDiscovered} discovered`,
        );
        return summary;
    }

    private async compactPartition(
        partition: RawPartition,
        columns: CompactedStreamColumn[],
        duckdb: DuckdbWarehouseClient,
    ): Promise<number> {
        const prefix = `events/raw/org_id=${partition.orgId}/stream=${partition.stream}/dt=${partition.dt}/`;
        const checkpoint = `events/compaction/org_id=${partition.orgId}/stream=${partition.stream}/dt=${partition.dt}/pending.json`;
        let keys: string[];
        try {
            const pending = await this.s3!.getObject({
                Bucket: this.bucket,
                Key: checkpoint,
            });
            keys = z
                .array(z.string().startsWith(prefix).endsWith('.jsonl.gz'))
                .nonempty()
                .parse(JSON.parse(await pending.Body!.transformToString()));
        } catch (error) {
            if (!UsageEventsCompactor.isMissingObject(error)) throw error;
            keys = partition.keys;
            // Persist the exact input set before publishing; cleanup may only partly succeed.
            await this.s3!.putObject({
                Bucket: this.bucket,
                Key: checkpoint,
                Body: JSON.stringify(keys),
                ContentType: 'application/json',
            });
        }
        const { sql, compactedKey } = buildCompactionSql({
            bucket: this.bucket,
            partition: { ...partition, keys },
            columns,
            storageScheme: this.s3Config.authMode === 'gcp_oauth' ? 'gs' : 's3',
        });
        try {
            await this.s3!.headObject({
                Bucket: this.bucket,
                Key: compactedKey,
            });
        } catch (error) {
            if (!UsageEventsCompactor.isMissingObject(error)) throw error;
            await duckdb.runSqlWithMetrics(sql);
        }
        await this.deleteRawKeys(keys);
        await this.s3!.deleteObject({ Bucket: this.bucket, Key: checkpoint });
        // Late arrivals are excluded from the recovered input set and remain for the next run.
        const published = new Set(keys);
        return partition.keys.filter((key) => published.has(key)).length;
    }

    private static isMissingObject(error: unknown): boolean {
        return z
            .object({ $metadata: z.object({ httpStatusCode: z.literal(404) }) })
            .safeParse(error).success;
    }

    private createDuckdbClient(): DuckdbWarehouseClient {
        const runtimeConfig = getDuckdbRuntimeConfig(this.s3Config);
        if (!runtimeConfig) {
            throw new Error(
                'Usage events compaction: missing S3 configuration for DuckDB',
            );
        }
        return new DuckdbWarehouseClient(
            {
                type: 'duckdb_s3',
                s3Config: {
                    ...runtimeConfig,
                    ...(this.s3Config.authMode === 'gcp_oauth'
                        ? {
                              scope: [`gs://${this.bucket}/`],
                          }
                        : {}),
                },
            },
            {
                resourceLimits: { memoryLimit: '256MB', threads: 1 },
                logger: Logger,
                enableQueryProfiling: true,
            },
        );
    }

    private async listRawKeys(orgIds: string[]): Promise<{
        keys: string[];
        bytesByKey: Map<string, number>;
    }> {
        if (!this.s3) {
            throw new Error('S3 client is not configured');
        }
        const keys: string[] = [];
        const bytesByKey = new Map<string, number>();
        for (const orgId of orgIds) {
            let continuationToken: string | undefined;
            do {
                // eslint-disable-next-line no-await-in-loop
                const response = await this.s3.listObjectsV2({
                    Bucket: this.bucket,
                    Prefix: `${RAW_KEY_PREFIX}org_id=${orgId}/`,
                    ContinuationToken: continuationToken,
                });
                (response.Contents ?? []).forEach((object) => {
                    if (object.Key) {
                        if (
                            !object.Key.startsWith(
                                `${RAW_KEY_PREFIX}org_id=${orgId}/`,
                            )
                        )
                            throw new Error('Unexpected raw usage scope');
                        keys.push(object.Key);
                        bytesByKey.set(object.Key, object.Size ?? 0);
                    }
                });
                continuationToken = response.IsTruncated
                    ? response.NextContinuationToken
                    : undefined;
                if (response.IsTruncated && !continuationToken)
                    throw new Error('Incomplete raw usage listing');
            } while (continuationToken);
        }
        return { keys, bytesByKey };
    }

    /** The checkpoint retains the published input set if cleanup needs another run. */
    private async deleteRawKeys(keys: string[]): Promise<void> {
        let pending = keys;
        let lastError = 'unknown error';
        for (let attempt = 1; attempt <= DELETE_MAX_ATTEMPTS; attempt += 1) {
            if (attempt > 1) {
                // eslint-disable-next-line no-await-in-loop
                await sleep(DELETE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 2));
                Logger.warn(
                    `Usage events compaction: retrying delete of ${pending.length} raw objects (attempt ${attempt}/${DELETE_MAX_ATTEMPTS})`,
                );
            }
            // eslint-disable-next-line no-await-in-loop
            const failed = await this.tryDeleteRawKeys(pending);
            if (failed.keys.length === 0) return;
            pending = failed.keys;
            lastError = failed.lastError;
        }
        throw new Error(
            `Failed to delete ${pending.length} raw objects after ${DELETE_MAX_ATTEMPTS} attempts (first: ${pending[0]}, last error: ${lastError}). ` +
                `The published input checkpoint is retained so the next run can retry cleanup without republishing rows`,
        );
    }

    private async tryDeleteRawKeys(
        keys: string[],
    ): Promise<{ keys: string[]; lastError: string }> {
        if (!this.s3) {
            throw new Error('S3 client is not configured');
        }
        const failedKeys: string[] = [];
        let lastError = 'unknown error';
        for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
            const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
            try {
                // eslint-disable-next-line no-await-in-loop
                const response = await this.s3.deleteObjects({
                    Bucket: this.bucket,
                    Delete: {
                        Objects: batch.map((Key) => ({ Key })),
                        Quiet: true,
                    },
                });
                const responseErrors = response.Errors ?? [];
                responseErrors.forEach((error) => {
                    if (error.Key) failedKeys.push(error.Key);
                });
                const lastMessage = responseErrors
                    .map((error) => error.Message)
                    .filter(Boolean)
                    .pop();
                if (lastMessage) lastError = lastMessage;
            } catch (error) {
                // Request-level failure: deletes are idempotent, retry the whole batch
                failedKeys.push(...batch);
                lastError = getErrorMessage(error);
            }
        }
        return { keys: failedKeys, lastError };
    }
}
