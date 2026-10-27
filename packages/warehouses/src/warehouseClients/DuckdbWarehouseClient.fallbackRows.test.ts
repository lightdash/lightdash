import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    DuckdbWarehouseClient,
    type DuckdbParquetColumns,
    type DuckdbParquetSource,
} from './DuckdbWarehouseClient';

describe('historical fallback rows in trusted Parquet sources', () => {
    const markerValue = 'query.history_backfilled';
    const scope = 'https://storage.example/bucket/fixtures/';
    const columns: DuckdbParquetColumns = [
        { name: 'org_id', type: 'VARCHAR' },
        { name: 'project_id', type: 'VARCHAR' },
        { name: 'query_id', type: 'VARCHAR' },
        { name: 'event_name', type: 'VARCHAR' },
        { name: 'event_ts', type: 'TIMESTAMP' },
    ];
    const fallbackRows = {
        keyColumns: ['org_id', 'project_id', 'query_id'],
        markerColumn: 'event_name',
        markerValue,
    };
    const files = new Map<string, Buffer>();
    let directory: string;

    beforeAll(async () => {
        directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'analytics-fallback-test-'),
        );
        const instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '128MB',
            threads: '1',
        });
        const db = await instance.connect();
        try {
            const fixtures = {
                history: `SELECT * FROM (VALUES
                    ('org-a', 'project-a', 'later', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-a', NULL, 'null-project', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-a', 'project-a', 'repeated', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-b', 'project-a', 'later', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-a', 'project-b', 'later', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-a', 'project-a', 'history-only', '${markerValue}', TIMESTAMP '2026-09-01'),
                    ('org-a', 'project-a', 'null-marker', '${markerValue}', TIMESTAMP '2026-09-01')
                    ) AS rows(org_id, project_id, query_id, event_name, event_ts)`,
                captured: `SELECT * FROM (VALUES
                    ('org-a', 'project-a', 'later', 'query.completed', TIMESTAMP '2026-10-02'),
                    ('org-a', NULL, 'null-project', 'query.completed', TIMESTAMP '2026-10-02'),
                    ('org-a', 'project-a', 'repeated', 'query.completed', TIMESTAMP '2026-10-02'),
                    ('org-a', 'project-a', 'repeated', 'query.completed', TIMESTAMP '2026-10-02'),
                    ('org-a', 'project-a', 'null-marker', NULL, TIMESTAMP '2026-10-02')
                    ) AS rows(org_id, project_id, query_id, event_name, event_ts)`,
                legacy: `SELECT 'org-a' AS org_id, 'project-a' AS project_id,
                    'legacy' AS query_id, TIMESTAMP '2026-09-01' AS event_ts`,
                quoted: `SELECT * FROM (VALUES
                    ('org-a', 'project-a', 'quoted', 'query.history''backfilled', TIMESTAMP '2026-09-01'),
                    ('org-a', 'project-a', 'quoted', 'query.completed', TIMESTAMP '2026-10-02')
                    ) AS rows(org_id, project_id, query_id, event_name, event_ts)`,
            };
            for (const [name, sql] of Object.entries(fixtures)) {
                const file = path.join(directory, `${name}.parquet`);
                // eslint-disable-next-line no-await-in-loop
                await db.run(`COPY (${sql}) TO '${file}' (FORMAT PARQUET)`);
                // eslint-disable-next-line no-await-in-loop
                files.set(name, await fs.readFile(file));
            }
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });

    afterAll(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    const source = (names: string[]): DuckdbParquetSource => {
        const urls = names.map(
            (name) => `${scope}${name}.parquet?X-Amz-Signature=test`,
        );
        return {
            scope,
            signedUrls: true,
            tables: [{ name: 'query_events', urls, columns, fallbackRows }],
            fileBuffers: new Map(
                urls.map((url, index) => [url, files.get(names[index])!]),
            ),
        };
    };

    const reader = (manifest: DuckdbParquetSource) =>
        new DuckdbWarehouseClient(
            {
                type: 'duckdb_parquet',
                resolveSource: async () => manifest,
            },
            { sharedResourceLimits: { memoryLimit: '128MB', threads: 1 } },
        );

    const allRows = 'SELECT * FROM query_events';

    it('counts users by day at preview volume within the default query memory budget', async () => {
        const instance = await DuckDBInstance.create(':memory:', {
            memory_limit: '128MB',
            threads: '1',
        });
        const db = await instance.connect();
        try {
            // Compressible UUIDs keep the fixture within the 8 MiB local-file
            // budget while exercising the real reader with 770k identities.
            for (const [name, start, count, marker] of [
                ['volume-captured', 0, 769268, 'query.completed'],
                ['volume-history', 769268, 352, markerValue],
            ] as const) {
                const file = path.join(directory, `${name}.parquet`);
                // eslint-disable-next-line no-await-in-loop
                await db.run(`COPY (SELECT
                    '4002e1f4-c710-43ef-8b7b-29eeb2be0447' AS org_id,
                    '3f20ca5f-22c7-4f5e-94d6-a5c2bfef6512' AS project_id,
                    substr(md5((i + ${start})::VARCHAR), 1, 4) || '0000-0000-0000-0000-' || lpad((i + ${start})::VARCHAR, 12, '0') AS query_id,
                    md5((i % 20000)::VARCHAR)::UUID::VARCHAR AS user_id,
                    TIMESTAMP '2026-10-07' + INTERVAL '1 minute' * (i % 28800) AS event_ts,
                    '${marker}' AS event_name
                    FROM range(${count}) AS rows(i)
                ) TO '${file}' (FORMAT PARQUET, COMPRESSION ZSTD)`);
                // eslint-disable-next-line no-await-in-loop
                files.set(name, await fs.readFile(file));
            }
        } finally {
            db.closeSync();
            instance.closeSync();
        }
        const manifest = source(['volume-captured', 'volume-history']);
        const client = new DuckdbWarehouseClient({
            type: 'duckdb_parquet',
            resolveSource: async () => manifest,
        });
        const { rows } = await client.runQuery(`SELECT
            CAST(date_trunc('day', event_ts) AS DATE) AS day,
            count(DISTINCT user_id) AS users,
            count(*) AS queries
            FROM query_events GROUP BY 1 ORDER BY 1`);
        expect(rows).toHaveLength(20);
        expect(rows.every((row) => Number(row.users) === 20000)).toBe(true);
        expect(
            rows.reduce((total, row) => total + Number(row.queries), 0),
        ).toBe(769620);
    });

    it('reconciles later captures across dates, keeping all captured deliveries and other identities', async () => {
        const manifest = source(['history']);
        const client = reader(manifest);
        expect((await client.runQuery(allRows)).rows).toHaveLength(7);

        const later = source(['history', 'captured']);
        manifest.tables = later.tables;
        manifest.fileBuffers = later.fileBuffers;
        const { rows } = await client.runQuery(allRows);
        expect(rows).toHaveLength(8);
        expect(rows.filter((row) => row.event_name === markerValue)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    org_id: 'org-b',
                    project_id: 'project-a',
                    query_id: 'later',
                }),
                expect.objectContaining({
                    org_id: 'org-a',
                    project_id: 'project-b',
                    query_id: 'later',
                }),
                expect.objectContaining({ query_id: 'history-only' }),
            ]),
        );
        expect(
            rows.filter((row) => row.event_name === markerValue),
        ).toHaveLength(3);
        expect(rows.filter((row) => row.query_id === 'repeated')).toHaveLength(
            2,
        );
        expect(rows.filter((row) => row.query_id === 'null-project')).toEqual([
            expect.objectContaining({
                project_id: null,
                event_name: 'query.completed',
            }),
        ]);
        expect(rows.filter((row) => row.query_id === 'null-marker')).toEqual([
            expect.objectContaining({ event_name: null }),
        ]);
        expect(
            (
                await client.runQuery(
                    "SELECT * FROM query_events WHERE event_ts < TIMESTAMP '2026-10-01'",
                )
            ).rows,
        ).toHaveLength(3);
        expect((await client.runQuery(allRows)).rows).toHaveLength(8);
    });

    it('preserves the existing union behavior when fallback handling is omitted', async () => {
        const manifest = source(['history', 'captured']);
        delete manifest.tables[0].fallbackRows;
        expect((await reader(manifest).runQuery(allRows)).rows).toHaveLength(
            12,
        );
    });

    it('reads captured partitions alongside a canonical history file without inferred Hive columns', async () => {
        const manifest = source(['history', 'captured']);
        manifest.scope =
            'https://storage.example/bucket/events/compacted/org_id%3Dorg-a/';
        const urls = [
            `${manifest.scope}history%3Dquery_events/history.parquet?X-Amz-Signature=test`,
            `${manifest.scope}stream%3Dquery_events/dt%3D2026-10-02/captured.parquet?X-Amz-Signature=test`,
        ];
        manifest.tables[0].urls = urls;
        manifest.tables[0].hivePartitioning = false;
        manifest.fileBuffers = new Map([
            [urls[0], files.get('history')!],
            [urls[1], files.get('captured')!],
        ]);
        const { rows } = await reader(manifest).runQuery(allRows);
        expect(rows).toHaveLength(8);
        expect(rows.some((row) => row.org_id === 'org-b')).toBe(true);
        for (const row of rows) {
            expect(row).not.toHaveProperty('history');
            expect(row).not.toHaveProperty('stream');
            expect(row).not.toHaveProperty('dt');
        }
    });

    it('rejects a non-boolean Hive partitioning option', async () => {
        const manifest = source(['history']);
        Object.assign(manifest.tables[0], { hivePartitioning: 'false' });
        await expect(reader(manifest).runQuery(allRows)).rejects.toThrow(
            'Invalid Parquet Hive partitioning configuration',
        );
    });

    it('supplies absent marker columns through the existing typed empty union', async () => {
        const { rows } = await reader(source(['legacy'])).runQuery(allRows);
        expect(rows).toEqual([
            expect.objectContaining({ query_id: 'legacy', event_name: null }),
        ]);
    });

    it('escapes the fallback marker value as a SQL literal', async () => {
        const manifest = source(['quoted']);
        manifest.tables[0].fallbackRows = {
            ...fallbackRows,
            markerValue: "query.history'backfilled",
        };
        expect((await reader(manifest).runQuery(allRows)).rows).toEqual([
            expect.objectContaining({ event_name: 'query.completed' }),
        ]);
    });

    it.each([
        { ...fallbackRows, keyColumns: [] },
        { ...fallbackRows, keyColumns: ['query_id', 'query_id'] },
        { ...fallbackRows, keyColumns: ['missing'] },
        { ...fallbackRows, keyColumns: ['query_id); DROP VIEW query_events'] },
        { ...fallbackRows, markerColumn: 'missing' },
        { ...fallbackRows, markerColumn: 'event_name"' },
    ])('rejects invalid fallback configuration: %j', async (configuration) => {
        const manifest = source(['history']);
        manifest.tables[0].fallbackRows = configuration;
        await expect(reader(manifest).runQuery(allRows)).rejects.toThrow(
            'Invalid Parquet fallback row configuration',
        );
    });

    it('requires a declared schema for fallback identity columns', async () => {
        const manifest = source(['history']);
        delete manifest.tables[0].columns;
        await expect(reader(manifest).runQuery(allRows)).rejects.toThrow(
            'Invalid Parquet fallback row configuration',
        );
    });
});
