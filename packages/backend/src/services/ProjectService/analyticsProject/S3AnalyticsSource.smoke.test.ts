import {
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DuckDBInstance } from '@duckdb/node-api';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { createS3AnalyticsSourceResolver } from './S3AnalyticsSource';

// Opt-in, disposable local MinIO bucket; never writes to a cloud bucket.
describe.skipIf(!process.env.ANALYTICS_S3_SMOKE_ENDPOINT)(
    'signed analytics URLs with real DuckDB and local S3',
    () => {
        beforeAll(() => vi.unstubAllGlobals());

        it('queries both streams and rejects changed org paths, PUTs and metadata access', async () => {
            const endpoint = process.env.ANALYTICS_S3_SMOKE_ENDPOINT ?? '';
            if (
                !['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname)
            ) {
                throw new Error(
                    'Smoke fixture writes require a loopback S3 endpoint',
                );
            }
            const storage = {
                endpoint,
                bucket: `ld-analytics-auth-${randomUUID()}`,
                region: process.env.S3_REGION ?? 'us-east-1',
                accessKey: process.env.S3_ACCESS_KEY,
                secretKey: process.env.S3_SECRET_KEY,
                forcePathStyle: true,
            };
            const org = '00000000-0000-0000-0000-000000000001';
            const otherOrg = '00000000-0000-0000-0000-000000000002';
            const keys = [
                `events/compacted/org_id=${org}/stream=query_events/dt=2026-09-07/part.parquet`,
                `events/compacted/org_id=${org}/stream=ai_usage/dt=2026-09-07/part.parquet`,
                `events/compacted/org_id=${otherOrg}/stream=query_events/dt=2026-09-07/part.parquet`,
                `events/compacted/org_id=${org}/stream=query_events/dt=2025-09-07/part.parquet`,
            ];
            const client = createS3ClientFromConfig(storage);
            const directory = await mkdtemp(
                path.join(tmpdir(), 'ld-analytics-auth-'),
            );
            const fixture = path.join(directory, 'fixture.parquet');
            const historicalFixture = path.join(
                directory,
                'historical.parquet',
            );
            let created = false;
            try {
                const instance = await DuckDBInstance.create(':memory:');
                const db = await instance.connect();
                try {
                    await db.run(
                        `COPY (SELECT 42::INTEGER AS tokens, TIMESTAMP '2026-09-07' AS event_ts, 7::INTEGER AS new_metric) TO '${fixture.replace(/'/g, "''")}' (FORMAT PARQUET)`,
                    );
                    await db.run(
                        `COPY (SELECT 42::INTEGER AS tokens, TIMESTAMP '2025-09-07' AS event_ts) TO '${historicalFixture.replace(/'/g, "''")}' (FORMAT PARQUET)`,
                    );
                } finally {
                    db.closeSync();
                    instance.closeSync();
                }
                await client.send(
                    new CreateBucketCommand({ Bucket: storage.bucket }),
                );
                created = true;
                const body = await readFile(fixture);
                const historicalBody = await readFile(historicalFixture);
                await Promise.all(
                    keys.map((Key) =>
                        client.send(
                            new PutObjectCommand({
                                Bucket: storage.bucket,
                                Key,
                                Body: Key.includes('/dt=2025-09-07/')
                                    ? historicalBody
                                    : body,
                            }),
                        ),
                    ),
                );
                const resolveSource = createS3AnalyticsSourceResolver({
                    storage,
                    organizationUuid: org,
                });
                const reader = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource,
                });
                expect(
                    (
                        await reader.runQuery(
                            'SELECT sum(tokens) AS total FROM query_events',
                        )
                    ).rows,
                ).toEqual([{ total: '84' }]);
                // Historical files may predate fields added to the stream.
                expect(
                    (
                        await reader.runQuery(
                            'SELECT count(new_metric) AS populated, sum(new_metric) AS total FROM query_events',
                        )
                    ).rows,
                ).toEqual([{ populated: '1', total: '7' }]);
                const otherReader = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource: createS3AnalyticsSourceResolver({
                        storage,
                        organizationUuid: otherOrg,
                    }),
                });
                expect(
                    (
                        await otherReader.runQuery(
                            'SELECT sum(tokens) AS total FROM query_events',
                        )
                    ).rows,
                ).toEqual([{ total: '42' }]);
                expect(
                    (
                        await reader.runQuery(
                            "SELECT sum(tokens) AS total FROM query_events WHERE event_ts >= TIMESTAMP '2025-09-07' AND event_ts < TIMESTAMP '2025-09-08'",
                        )
                    ).rows,
                ).toEqual([{ total: '42' }]);
                expect(
                    (
                        await reader.runQuery(
                            'SELECT sum(tokens) AS total FROM ai_usage',
                        )
                    ).rows,
                ).toEqual([{ total: '42' }]);
                await expect(
                    reader.runQuery('SELECT sql FROM duckdb_views()'),
                ).rejects.toThrow(/catalog access/);
                await expect(
                    reader.runQuery(
                        'SELECT * FROM duckdb_external_file_cache()',
                    ),
                ).rejects.toThrow(/catalog access/);
                const source = await resolveSource();
                expect(source).not.toHaveProperty('s3Config');
                const url = source.tables[0].urls[0];
                const otherPath = url.replace(org, otherOrg);
                const denied = await fetch(otherPath);
                expect(denied.status).toBe(403);
                await denied.body?.cancel();
                // A signed GET must not authorize a write, even with writer-origin credentials.
                const write = await fetch(url, {
                    method: 'PUT',
                    body: 'not-parquet',
                });
                expect(write.status).toBe(403);
                await write.body?.cancel();
                const expired = await getSignedUrl(
                    client,
                    new GetObjectCommand({
                        Bucket: storage.bucket,
                        Key: keys[0],
                    }),
                    {
                        expiresIn: 1,
                        signingDate: new Date(Date.now() - 60_000),
                    },
                );
                const failedReader = new DuckdbWarehouseClient({
                    type: 'duckdb_parquet',
                    resolveSource: async () => ({
                        ...source,
                        tables: [{ name: 'query_events', urls: [expired] }],
                    }),
                });
                await expect(
                    failedReader.runQuery('SELECT count(*) FROM query_events'),
                ).rejects.toThrow(
                    /^Internal analytics query failed\. Check storage access and query permissions\.$/,
                );
                // Neither denied attempt modified the original object.
                expect(
                    (
                        await reader.runQuery(
                            'SELECT sum(tokens) AS total FROM query_events',
                        )
                    ).rows,
                ).toEqual([{ total: '84' }]);
            } finally {
                if (created) {
                    await Promise.all(
                        keys.map((Key) =>
                            client.send(
                                new DeleteObjectCommand({
                                    Bucket: storage.bucket,
                                    Key,
                                }),
                            ),
                        ),
                    );
                    await client.send(
                        new DeleteBucketCommand({ Bucket: storage.bucket }),
                    );
                }
                client.destroy();
                await rm(fixture, { force: true });
                await rm(historicalFixture, { force: true });
                await rmdir(directory);
            }
        }, 120_000);
    },
);
