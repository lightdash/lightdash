import { Upload } from '@aws-sdk/lib-storage';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import type { S3Config } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import type { StreamName } from './projection';
import { compactedStreamSchemas } from './registry';
import { analyticsStreams, userActivityKey } from './userActivity';

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const MAX_FILES_PER_DAY = 10_000;
const MAX_CHANGED_PARTITIONS = 500;
const DAY_MS = 86_400_000;
const MODEL_VERSION = '1';
export type UserActivitySummary = {
    published: number;
    unchanged: number;
    skipped: number;
    deferred: number;
    failed: number;
};
const emptySummary = (): UserActivitySummary => ({
    published: 0,
    unchanged: 0,
    skipped: 0,
    deferred: 0,
    failed: 0,
});

export const validateUserActivityRange = (
    orgId: string,
    from: string,
    to: string,
    now = new Date(),
): string[] => {
    if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            orgId,
        )
    ) {
        throw new Error('org-id must be a lowercase UUID');
    }
    for (const date of [from, to]) {
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date
        ) {
            throw new Error(
                'Dates must be valid UTC dates in YYYY-MM-DD format',
            );
        }
    }
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
    if (days < 1 || days > 31 || to >= now.toISOString().slice(0, 10)) {
        throw new Error('Select 1–31 closed UTC days, with from <= to');
    }
    return Array.from({ length: days }, (_, i) =>
        new Date(Date.parse(from) + i * DAY_MS).toISOString().slice(0, 10),
    );
};

const buildUserActivitySql = (
    orgId: string,
    stream: StreamName,
    date: string,
    sources: string[],
    output: string,
): string => {
    // The typed empty side supplies fields absent from older Parquet schemas.
    // Hive is disabled so a misplaced row cannot inherit its tenant from the path.
    const input = `SELECT * FROM read_parquet([${sources.map(literal).join(', ')}], union_by_name=true, hive_partitioning=false)
        UNION ALL BY NAME SELECT ${compactedStreamSchemas[stream].map(({ name, type }) => `NULL::${type} AS "${name}"`).join(', ')} WHERE false`;
    const tokens = [
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'reasoning_tokens',
        'total_tokens',
    ];
    return `COPY (
        SELECT org_id, project_id, user_id,
            ${literal(date)}::TIMESTAMP AS activity_date,
            ${literal(stream)}::VARCHAR AS stream, event_name,
            ${stream === 'export_events' ? 'format' : 'NULL::VARCHAR'} AS format,
            count(event_name)::BIGINT AS event_count,
            ${stream === 'query_events' ? 'count(query_id)' : '0'}::BIGINT AS query_count,
            ${tokens.map((name) => `${stream === 'ai_usage' ? `sum("${name}")` : 'NULL'}::BIGINT AS "${name}"`).join(', ')}
        FROM (${input}) events
        WHERE org_id = ${literal(orgId)}
            AND event_ts >= ${literal(date)}::TIMESTAMP
            AND event_ts < ${literal(date)}::TIMESTAMP + INTERVAL 1 DAY
        GROUP BY org_id, project_id, user_id, event_name${stream === 'export_events' ? ', format' : ''}
    ) TO ${literal(output)} (FORMAT PARQUET, COMPRESSION zstd, ROW_GROUP_SIZE 16384)`;
};

/** Independent, retryable nightly stage. Never changes captured events. */
export class UsageUserActivityBuilder extends S3BaseClient {
    private readonly duckdb: Pick<DuckdbWarehouseClient, 'runSqlWithMetrics'>;

    constructor(
        private readonly storage: Omit<S3Config, 'expirationTime'>,
        duckdb?: Pick<DuckdbWarehouseClient, 'runSqlWithMetrics'>,
    ) {
        super(storage);
        const runtime = getDuckdbRuntimeConfig(storage);
        this.duckdb =
            duckdb ??
            new DuckdbWarehouseClient(
                {
                    type: 'duckdb_s3',
                    s3Config: {
                        ...runtime!,
                        ...(storage.authMode === 'gcp_oauth'
                            ? { scope: [`gs://${storage.bucket}/`] }
                            : {}),
                    },
                },
                {
                    resourceLimits: { memoryLimit: '256MB', threads: 1 },
                    logger: Logger,
                },
            );
    }

    /** Manual closed-date backfill across all streams. Stops on the first failure. */
    async run(
        orgId: string,
        from: string,
        to: string,
        now = new Date(),
    ): Promise<UserActivitySummary> {
        try {
            const dates = validateUserActivityRange(orgId, from, to, now);
            const summary = emptySummary();
            for (const date of dates) {
                for (const stream of analyticsStreams) {
                    // eslint-disable-next-line no-await-in-loop
                    const outcome = await this.refresh(orgId, stream, date);
                    if (outcome === 'deferred')
                        throw new Error(
                            `${stream} for ${date} still awaits compaction`,
                        );
                    summary[outcome] += 1;
                }
            }
            return summary;
        } finally {
            this.s3?.destroy();
        }
    }

    /** Discover retained closed partitions; fingerprints avoid reprocessing unchanged data. */
    async runAll(
        model: Pick<UsageDimensionsModel, 'getOrganizations'>,
        now = new Date(),
    ): Promise<UserActivitySummary> {
        const summary = emptySummary();
        const today = now.toISOString().slice(0, 10);
        try {
            // eslint-disable-next-line no-restricted-syntax
            for await (const org of model.getOrganizations()) {
                for (const stream of analyticsStreams) {
                    // Listing directory prefixes keeps event file lists out of memory.
                    // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
                    for await (const date of this.closedDates(
                        org.organization_uuid,
                        stream,
                        today,
                    )) {
                        if (
                            summary.published + summary.failed >=
                            MAX_CHANGED_PARTITIONS
                        ) {
                            Logger.warn(
                                'User activity refresh reached its 500-partition work limit; remaining partitions will be retried on the next run',
                            );
                            return summary;
                        }
                        try {
                            // eslint-disable-next-line no-await-in-loop
                            const outcome = await this.refresh(
                                org.organization_uuid,
                                stream,
                                date,
                            );
                            summary[outcome] += 1;
                        } catch {
                            summary.failed += 1;
                            // Native/SDK error messages can include credentials or SQL data.
                            Logger.error(
                                `User activity failed for org_id=${org.organization_uuid}/stream=${stream}/dt=${date}; previous output retained`,
                            );
                        }
                    }
                }
            }
            return summary;
        } finally {
            Logger.info(`User activity refresh: ${JSON.stringify(summary)}`);
            this.s3?.destroy();
        }
    }

    private async *closedDates(
        orgId: string,
        stream: StreamName,
        today: string,
    ) {
        const prefix = `events/compacted/org_id=${orgId}/stream=${stream}/`;
        let token: string | undefined;
        let pages = 0;
        do {
            // eslint-disable-next-line no-await-in-loop
            const page = await this.s3!.listObjectsV2({
                Bucket: this.storage.bucket,
                Prefix: prefix,
                Delimiter: '/',
                ContinuationToken: token,
            });
            for (const { Prefix } of page.CommonPrefixes ?? []) {
                const match = Prefix?.startsWith(prefix)
                    ? /^dt=(\d{4}-\d{2}-\d{2})\/$/.exec(
                          Prefix.slice(prefix.length),
                      )
                    : null;
                if (match && match[1] < today) {
                    validateUserActivityRange(
                        orgId,
                        match[1],
                        match[1],
                        new Date(`${today}T00:00:00Z`),
                    );
                    yield match[1];
                }
            }
            pages += 1;
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && (!token || pages >= 100))
                throw new Error('Incomplete user activity partition listing');
        } while (token);
    }

    private async refresh(
        orgId: string,
        stream: StreamName,
        date: string,
    ): Promise<'published' | 'unchanged' | 'skipped' | 'deferred'> {
        if (!this.s3) throw new Error('Usage event storage is not configured');
        const raw = await this.s3.listObjectsV2({
            Bucket: this.storage.bucket,
            Prefix: `events/raw/org_id=${orgId}/stream=${stream}/dt=${date}/`,
            MaxKeys: 1,
        });
        if (raw.Contents?.length) return 'deferred';
        const prefix = `events/compacted/org_id=${orgId}/stream=${stream}/dt=${date}/`;
        const keys: string[] = [];
        const hash = createHash('sha256').update(MODEL_VERSION);
        let token: string | undefined;
        let pages = 0;
        do {
            // eslint-disable-next-line no-await-in-loop
            const page = await this.s3.listObjectsV2({
                Bucket: this.storage.bucket,
                Prefix: prefix,
                ContinuationToken: token,
            });
            for (const object of page.Contents ?? []) {
                if (
                    object.Key?.startsWith(prefix) &&
                    object.Key.endsWith('.parquet')
                ) {
                    keys.push(object.Key);
                    hash.update(
                        JSON.stringify([object.Key, object.ETag, object.Size]),
                    );
                }
            }
            if (keys.length > MAX_FILES_PER_DAY)
                throw new Error(
                    `Too many input files for ${date}; limit is ${MAX_FILES_PER_DAY}`,
                );
            pages += 1;
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && (!token || pages >= 100))
                throw new Error('Incomplete S3 listing');
        } while (token);
        // Missing capture is unknown coverage, not evidence of zero activity.
        if (!keys.length) return 'skipped';
        const fingerprint = hash.digest('hex');
        try {
            const existing = await this.s3.headObject({
                Bucket: this.storage.bucket,
                Key: userActivityKey(orgId, stream, date),
            });
            if (existing.Metadata?.['source-hash'] === fingerprint)
                return 'unchanged';
        } catch (error) {
            if (
                (error as { $metadata?: { httpStatusCode?: number } }).$metadata
                    ?.httpStatusCode !== 404
            )
                throw error;
        }
        await this.publish(orgId, stream, date, keys, fingerprint);
        return 'published';
    }

    private async publish(
        orgId: string,
        stream: StreamName,
        date: string,
        keys: string[],
        fingerprint: string,
    ) {
        const directory = await mkdtemp(
            path.join(tmpdir(), 'usage-user-activity-'),
        );
        const output = path.join(directory, 'activity.parquet');
        try {
            const scheme = this.storage.authMode === 'gcp_oauth' ? 'gs' : 's3';
            await this.duckdb.runSqlWithMetrics(
                buildUserActivitySql(
                    orgId,
                    stream,
                    date,
                    keys.map(
                        (key) => `${scheme}://${this.storage.bucket}/${key}`,
                    ),
                    output,
                ),
            );
            const body = createReadStream(output);
            try {
                await new Upload({
                    client: this.s3!,
                    queueSize: 1,
                    partSize: 8 * 1024 * 1024,
                    leavePartsOnError: false,
                    params: {
                        Bucket: this.storage.bucket,
                        Key: userActivityKey(orgId, stream, date),
                        Body: body,
                        ContentType: 'application/vnd.apache.parquet',
                        Metadata: { 'source-hash': fingerprint },
                    },
                }).done();
            } finally {
                body.destroy();
            }
            Logger.info(
                `User activity ${stream}/${date}: published from ${keys.length} compacted files`,
            );
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}
