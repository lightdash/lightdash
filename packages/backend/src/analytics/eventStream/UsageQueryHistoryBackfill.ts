import { Upload } from '@aws-sdk/lib-storage';
import { type AnalyticsHistoryBackfillStatus } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { S3BaseClient } from '../../clients/Aws/S3BaseClient';
import type { S3Config } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import type { UsageQueryHistoryModel } from '../../models/UsageQueryHistoryModel';
import { getDuckdbRuntimeConfig } from '../../utils/duckdb/getDuckdbRuntimeConfig';
import { UsageDimensionsRefresher } from './UsageDimensionsRefresher';
import {
    usageHistoryKey,
    usageHistorySources,
    type UsageHistorySource,
} from './usageHistorySources';
import { usageProcessingStartDate } from './usageProcessingWindow';

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sameIdentity = (identity: string[], left: string, right: string) =>
    identity
        .map((key) => `${left}.${key} IS NOT DISTINCT FROM ${right}.${key}`)
        .join(' AND ');

/** One atomically replaced, org-scoped history file; no completion flag. */
export class UsageQueryHistoryBackfill extends S3BaseClient {
    constructor(
        private readonly storage: Omit<S3Config, 'expirationTime'>,
        private readonly history: Pick<UsageQueryHistoryModel, 'getJsonLines'>,
        private readonly source: UsageHistorySource = usageHistorySources[0],
    ) {
        super(storage);
    }

    private async keys(prefix: string): Promise<string[]> {
        if (!this.s3) throw new Error('Usage storage is not configured');
        const keys: string[] = [];
        let token: string | undefined;
        do {
            // eslint-disable-next-line no-await-in-loop
            const page = await this.s3.listObjectsV2(
                {
                    Bucket: this.storage.bucket,
                    Prefix: prefix,
                    ContinuationToken: token,
                },
                { abortSignal: AbortSignal.timeout(30_000) },
            );
            for (const { Key: key } of page.Contents ?? []) {
                if (!key || !key.startsWith(prefix))
                    throw new Error('Unexpected usage storage scope');
                keys.push(key);
            }
            if (keys.length > 10000)
                throw new Error('Too many usage files to check history safely');
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && !token)
                throw new Error('Incomplete usage storage listing');
        } while (token);
        return keys;
    }

    private async process(
        org: string,
        publish: boolean,
        dimensions?: UsageDimensionsModel,
    ): Promise<AnalyticsHistoryBackfillStatus> {
        if (
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
                org,
            )
        )
            throw new Error('Invalid organization');
        const {
            name: streamName,
            columns,
            keyColumns,
            replaceExisting,
        } = this.source;
        const historyKey = usageHistoryKey(org, streamName);
        const matches = (left: string, right: string) =>
            sameIdentity(keyColumns, left, right);
        const runtime = getDuckdbRuntimeConfig(this.storage);
        if (!runtime) throw new Error('Usage storage is not configured');
        const duckdb = new DuckdbWarehouseClient(
            {
                type: 'duckdb_s3',
                s3Config: {
                    ...runtime,
                    ...(this.storage.authMode === 'gcp_oauth'
                        ? { scope: [`gs://${this.storage.bucket}/events/`] }
                        : {}),
                },
            },
            {
                resourceLimits: { memoryLimit: '256MB', threads: 1 },
                logger: Logger,
            },
        );
        const directory = await mkdtemp(
            path.join(tmpdir(), 'usage-query-history-'),
        );
        let phase = 'read database';
        try {
            const now = new Date();
            const input = path.join(directory, 'history.jsonl');
            await pipeline(
                Readable.from(
                    this.history.getJsonLines(org, now.toISOString()),
                    { objectMode: false },
                ),
                createWriteStream(input, { mode: 0o600 }),
            );
            if ((await stat(input)).size === 0)
                return {
                    running: false,
                    missingQueries: 0,
                    existingQueries: 0,
                    pendingQueries: 0,
                    from: null,
                    to: null,
                };
            phase = 'read storage';
            // Read raw before compacted: compaction publishes before deleting raw.
            const raw = (
                streamName === 'historical_activity'
                    ? []
                    : await this.keys(
                          `events/raw/org_id=${org}/stream=${streamName}/`,
                      )
            ).filter((key) => {
                const match =
                    /\/dt=(\d{4}-\d{2}-\d{2})\/[^/]+\.jsonl\.gz$/.exec(key);
                // Older raw files are outside nightly processing. Import their
                // retained DB fallback; a later captured row still takes precedence.
                return match && match[1] >= usageProcessingStartDate(now);
            });
            const prefix = `events/compacted/org_id=${org}/`;
            const compacted = (await this.keys(prefix)).filter(
                (key) =>
                    new RegExp(
                        `^stream=${streamName}/dt=\\d{4}-\\d{2}-\\d{2}/[a-zA-Z0-9_-]+\\.parquet$`,
                    ).test(key.slice(prefix.length)) || key === historyKey,
            );
            const scheme = this.storage.authMode === 'gcp_oauth' ? 'gs' : 's3';
            const files = (keys: string[]) =>
                keys
                    .map((key) =>
                        literal(`${scheme}://${this.storage.bucket}/${key}`),
                    )
                    .join(',');
            const empty = `SELECT ${columns.map(({ name, type }) => `NULL::${type} AS ${name}`).join(',')} WHERE false`;
            const emptyIds = `SELECT ${keyColumns.map((key) => `NULL::VARCHAR ${key}`).join(',')} WHERE false`;
            const existing = compacted.length
                ? `SELECT * FROM read_parquet([${files(compacted)}], union_by_name=true, hive_partitioning=false) UNION ALL BY NAME ${empty}`
                : empty;
            // Historical records may retain a mutable status/feedback snapshot.
            // A changed row is importable again, but replaces its stable identity.
            const sameExisting = replaceExisting
                ? sameIdentity(
                      columns.map(({ name: column }) => column),
                      'h',
                      'e',
                  )
                : matches('h', 'e');
            const pending = raw.length
                ? `SELECT ${keyColumns.join(',')} FROM read_json([${files(raw)}], format='newline_delimited', columns={${keyColumns.map((key) => `${key}:'VARCHAR'`).join(',')}}, compression='gzip', hive_partitioning=false)`
                : emptyIds;
            const defs = columns
                .map(({ name, type }) => `${name}:'${type}'`)
                .join(',');
            const source = `SELECT * FROM read_json(${literal(input)}, format='newline_delimited', columns={${defs}})`;
            const missing = `SELECT h.* FROM history h WHERE NOT EXISTS (SELECT 1 FROM existing e WHERE ${sameExisting}) AND NOT EXISTS (SELECT 1 FROM pending p WHERE ${matches('h', 'p')})`;
            const ctes = `WITH history AS (${source}), existing AS (${existing}), pending AS (${pending}), missing AS (${missing})`;
            phase = 'reconcile history';
            const statsFile = path.join(directory, 'counts.json');
            await duckdb.runSqlWithMetrics(
                `COPY (${ctes} SELECT (SELECT COUNT(*) FROM missing) missingQueries, (SELECT COUNT(*) FROM history h WHERE EXISTS (SELECT 1 FROM existing e WHERE ${sameExisting})) existingQueries, (SELECT COUNT(*) FROM history h WHERE NOT EXISTS (SELECT 1 FROM existing e WHERE ${sameExisting}) AND EXISTS (SELECT 1 FROM pending p WHERE ${matches('h', 'p')})) pendingQueries, (SELECT CAST(MIN(event_ts) AS DATE)::VARCHAR FROM missing) "from", (SELECT CAST(MAX(event_ts) AS DATE)::VARCHAR FROM missing) "to") TO ${literal(statsFile)} (FORMAT JSON, ARRAY true)`,
            );
            const [counts] = JSON.parse(
                await readFile(statsFile, 'utf8'),
            ) as Omit<AnalyticsHistoryBackfillStatus, 'running'>[];
            if (publish && counts.missingQueries > 0) {
                phase = 'refresh metadata';
                if (dimensions) {
                    const refreshed = await new UsageDimensionsRefresher(
                        this.storage,
                        {
                            getOrganizations: () =>
                                dimensions.getOrganizations(org),
                            getJsonLines:
                                dimensions.getJsonLines.bind(dimensions),
                        },
                        duckdb,
                    ).run();
                    if (refreshed.failed)
                        throw new Error(
                            'Could not refresh current content metadata',
                        );
                }
                const previous = compacted.includes(historyKey)
                    ? `SELECT ${columns.map(({ name }) => name).join(',')} FROM (SELECT * FROM read_parquet([${files([historyKey])}], hive_partitioning=false) UNION ALL BY NAME ${empty})`
                    : empty;
                phase = 'publish history';
                const output = path.join(directory, 'history.parquet');
                await duckdb.runSqlWithMetrics(
                    `COPY (${ctes} SELECT * FROM (${previous}) p ${replaceExisting ? `WHERE NOT EXISTS (SELECT 1 FROM history h WHERE ${matches('h', 'p')})` : ''} UNION ALL SELECT * FROM ${replaceExisting ? 'history' : 'missing'} ORDER BY ${keyColumns.join(',')}) TO ${literal(output)} (FORMAT PARQUET, COMPRESSION zstd)`,
                );
                const body = createReadStream(output);
                try {
                    await new Upload({
                        client: this.s3!,
                        queueSize: 1,
                        partSize: 8 * 1024 * 1024,
                        params: {
                            Bucket: this.storage.bucket,
                            Key: historyKey,
                            Body: body,
                            ContentType: 'application/vnd.apache.parquet',
                        },
                    }).done();
                } finally {
                    body.destroy();
                }
            }
            return { ...counts, running: false };
        } catch {
            // Never log provider messages, which can include signed credentials.
            Logger.error('Analytics history backfill failed', {
                organizationUuid: org,
                source: streamName,
                phase,
            });
            throw new Error(
                'Unable to check or import retained analytics history. Check usage storage and retry.',
            );
        } finally {
            await duckdb.close();
            this.s3?.destroy();
            await rm(directory, { recursive: true, force: true });
        }
    }

    async inspect(org: string): Promise<AnalyticsHistoryBackfillStatus> {
        return this.process(org, false);
    }
    async run(
        org: string,
        dimensions?: UsageDimensionsModel,
    ): Promise<AnalyticsHistoryBackfillStatus> {
        return this.process(org, true, dimensions);
    }
}
