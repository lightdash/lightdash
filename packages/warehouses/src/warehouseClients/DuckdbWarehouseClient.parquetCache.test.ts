import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    DuckdbWarehouseClient,
    type DuckdbParquetSource,
} from './DuckdbWarehouseClient';

describe('private query staging of cached Parquet', () => {
    let directory: string;
    let bytes: Buffer;
    beforeAll(async () => {
        directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'analytics-cache-test-'),
        );
        const file = path.join(directory, 'fixture.parquet');
        const instance = await DuckDBInstance.create(':memory:');
        const db = await instance.connect();
        try {
            await db.run(
                `COPY (SELECT 42 AS value) TO '${file}' (FORMAT PARQUET)`,
            );
            bytes = await fs.readFile(file);
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    });
    afterAll(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });
    afterEach(() => vi.restoreAllMocks());

    const source = (org: string): DuckdbParquetSource => {
        const scope = `https://storage.example/bucket/events/compacted/org_id%3D${org}/`;
        const url = `${scope}stream%3Dquery_events/dt%3D2026-10-08/part.parquet?X-Amz-Signature=test`;
        return {
            scope,
            signedUrls: true,
            tables: [{ name: 'query_events', urls: [url] }],
            fileBuffers: new Map([[url, bytes]]),
        };
    };
    const reader = (manifest: DuckdbParquetSource) =>
        new DuckdbWarehouseClient({
            type: 'duckdb_parquet',
            resolveSource: async () => manifest,
        });

    it('reads cached bytes, preserves hive columns and removes private files after each query', async () => {
        const writes = vi.spyOn(fs, 'writeFile');
        const manifest = source('a');
        const client = reader(manifest);
        const sql =
            'SELECT value, org_id, CAST(dt AS VARCHAR) AS day FROM query_events';
        expect((await client.runQuery(sql)).rows).toEqual([
            { value: 42, org_id: 'a', day: '2026-10-08' },
        ]);
        expect((await client.runQuery(sql)).rows).toEqual([
            { value: 42, org_id: 'a', day: '2026-10-08' },
        ]);
        const files = writes.mock.calls.map(([file]) => String(file));
        expect(files).toHaveLength(2);
        expect(files[0]).not.toBe(files[1]);
        await Promise.all(
            files.map((file) =>
                expect(fs.stat(String(file))).rejects.toThrow(),
            ),
        );
        expect(manifest.tables[0].urls[0]).toMatch(/^https:/);
    });

    it('denies another organization cached file even at the engine boundary', async () => {
        const writes = vi.spyOn(fs, 'writeFile');
        const a = reader(source('a'));
        const b = reader(source('b'));
        // Deliberately bypass SQL validation to exercise DuckDB's exact-file allowlist.
        await b['withEphemeralQuerySession'](async () => {
            const otherFile = String(writes.mock.calls.at(-1)![0]);
            await a['withEphemeralQuerySession'](async (db) => {
                await expect(
                    db.run(`SELECT * FROM read_parquet('${otherFile}')`),
                ).rejects.toThrow(/disabled|permission|not allowed/i);
                await expect(
                    db.run(
                        `SELECT * FROM read_parquet('${path.dirname(otherFile)}/*.parquet')`,
                    ),
                ).rejects.toThrow();
                await expect(
                    db.run(`SELECT * FROM read_text('/etc/passwd')`),
                ).rejects.toThrow();
                await expect(
                    db.run('SET enable_external_access = true'),
                ).rejects.toThrow();
            }, 'SELECT * FROM query_events');
        }, 'SELECT * FROM query_events');
        await Promise.all(
            writes.mock.calls.map(([file]) =>
                expect(fs.stat(String(file))).rejects.toThrow(),
            ),
        );
        await expect(
            a.runQuery("SELECT * FROM read_parquet('/tmp/other-org.parquet')"),
        ).rejects.toThrow();
    });

    it('rejects out-of-scope URLs even when their bytes are cached', async () => {
        const manifest = source('a');
        const outside = source('b');
        await expect(
            reader({
                ...manifest,
                tables: outside.tables,
                fileBuffers: outside.fileBuffers,
            }).runQuery('SELECT * FROM query_events'),
        ).rejects.toThrow();
    });

    it('cleans up on SQL and invalid Parquet failures', async () => {
        const writes = vi.spyOn(fs, 'writeFile');
        const manifest = source('a');
        await expect(
            reader(manifest).runQuery('SELECT missing FROM query_events'),
        ).rejects.toThrow();
        await expect(
            reader({
                ...manifest,
                fileBuffers: new Map([
                    [manifest.tables[0].urls[0], Buffer.from('invalid')],
                ]),
            }).runQuery('SELECT * FROM query_events'),
        ).rejects.toThrow();
        expect(writes).toHaveBeenCalledTimes(2);
        await Promise.all(
            writes.mock.calls.map(([file]) =>
                expect(fs.stat(String(file))).rejects.toThrow(),
            ),
        );
    });
});
