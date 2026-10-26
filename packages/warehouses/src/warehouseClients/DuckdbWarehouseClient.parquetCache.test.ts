import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
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
        await b['withEphemeralQuerySession'](async (connection) => {
            const native = connection as unknown as DuckDBConnection;
            const [settings] = (
                await native.runAndReadAll(
                    "SELECT current_setting('temp_directory') AS directory",
                )
            ).getRowObjectsJson();
            const otherSpillFile = path.join(
                String(settings.directory),
                'private-probe',
            );
            await fs.writeFile(otherSpillFile, 'other-organization');
            const otherFile = String(writes.mock.calls.at(-1)![0]);
            await a['withEphemeralQuerySession'](async (db) => {
                await expect(
                    db.run(`SELECT * FROM read_text('${otherSpillFile}')`),
                ).rejects.toThrow(/disabled|permission|not allowed/i);
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
    it('locks bounded private spill configuration while allowing query timezones', async () => {
        const writes = vi.spyOn(fs, 'writeFile');
        const client = reader(source('a'));
        await client['withEphemeralQuerySession'](async (connection) => {
            const db = connection as unknown as DuckDBConnection;
            const [settings] = (
                await db.runAndReadAll(
                    "SELECT current_setting('temp_directory') AS directory, current_setting('max_temp_directory_size') AS cap, current_setting('allowed_directories') AS directories",
                )
            ).getRowObjectsJson();
            expect(settings.cap).toBe('488.2 MiB');
            expect(settings.directories).toEqual([
                `${await fs.realpath(String(settings.directory))}/`,
            ]);
            expect(
                (await fs.stat(path.dirname(String(settings.directory)))).mode %
                    0o1000,
            ).toBe(0o700);
            expect(
                (await fs.stat(String(settings.directory))).mode % 0o1000,
            ).toBe(0o700);
            expect(String(settings.directory)).toMatch(
                /lightdash-analytics-query-.*\/spill$/,
            );
            const [permissions] = (
                await db.runAndReadAll(
                    "SELECT current_setting('allowed_paths') AS paths",
                )
            ).getRowObjectsJson();
            expect(permissions.paths).toEqual(
                await Promise.all(
                    writes.mock.calls.map(([file]) =>
                        fs.realpath(String(file)),
                    ),
                ),
            );
            await db.run("SET TimeZone = 'Europe/Madrid'");
            for (const sql of [
                "SET temp_directory = '/tmp/shared'",
                "SET max_temp_directory_size = '2GB'",
                "SET memory_limit = '2GB'",
                'SET lock_configuration = false',
                "SET allowed_directories = ['/tmp/']",
                "SET allowed_configs = ['memory_limit']",
            ]) {
                // eslint-disable-next-line no-await-in-loop -- One native connection.
                await expect(db.run(sql)).rejects.toThrow(
                    /locked|configuration|disabled/i,
                );
            }
            await fs.mkdir(String(settings.directory), { recursive: true });
            await fs.writeFile(
                path.join(String(settings.directory), 'probe'),
                'private',
            );
            await fs.writeFile(
                path.join(String(settings.directory), 'probe.csv'),
                'value\nprivate\n',
            );
            for (const sql of [
                `SELECT * FROM read_text('${settings.directory}/probe')`,
                `SELECT * FROM read_parquet('${settings.directory}/*')`,
                `SELECT * FROM read_blob('${settings.directory}/probe')`,
                `SELECT * FROM main.read_text('${settings.directory}/probe')`,
                `SELECT * FROM "read_text"('${settings.directory}/probe')`,
                String.raw`SELECT * FROM U&"read_\0074ext"('${settings.directory}/probe')`,
                String.raw`SELECT * FROM U&"duckdb_\0076iews"()`,
                `SELECT * FROM "${settings.directory}/probe.csv"`,
                `SELECT * FROM query_events, "${settings.directory}/probe.csv"`,
                `SELECT * FROM ("${settings.directory}/probe.csv")`,
            ]) {
                // eslint-disable-next-line no-await-in-loop -- Validate before attempting the public boundary.
                await expect(
                    client['validateUserSql'](connection, sql),
                ).rejects.toThrow(/not allowed|validation|not supported/i);
                // eslint-disable-next-line no-await-in-loop -- Keep native sessions bounded.
                await expect(client.runQuery(sql)).rejects.toThrow(
                    /not allowed|not supported|query permissions/i,
                );
            }
            for (const sql of [
                'WITH "custom CTE.v1" AS (SELECT value FROM query_events) SELECT value AS "custom value" FROM "custom CTE.v1"',
                'SELECT "value" / "value" FROM query_events',
                `SELECT '"display/path"' AS label FROM query_events`,
                `SELECT $$"display/path"$$ AS label FROM query_events`,
            ]) {
                // eslint-disable-next-line no-await-in-loop -- One native connection.
                await expect(
                    client['validateUserSql'](connection, sql),
                ).resolves.toBeUndefined();
            }
            const parentCanary = path.join(
                path.dirname(String(settings.directory)),
                'parent-probe',
            );
            await fs.writeFile(parentCanary, 'parent-private');
            await expect(
                db.run(`SELECT * FROM read_text('${parentCanary}')`),
            ).rejects.toThrow(/disabled|permission|not allowed/i);
            await expect(
                db.run(
                    `SELECT * FROM read_parquet('https://example.invalid/foreign.parquet')`,
                ),
            ).rejects.toThrow(/disabled|permission|not allowed/i);
        }, 'SELECT * FROM query_events');
    });

    it('spills a bounded sort and removes the session directory after success', async () => {
        let sessionDirectory = '';
        const client = new DuckdbWarehouseClient(
            { type: 'duckdb_parquet', resolveSource: async () => source('a') },
            { sharedResourceLimits: { memoryLimit: '16MB', threads: 1 } },
        );
        await client['withEphemeralQuerySession'](async (connection) => {
            const db = connection as unknown as DuckDBConnection;
            const [settings] = (
                await db.runAndReadAll(
                    "SELECT current_setting('temp_directory') AS directory",
                )
            ).getRowObjectsJson();
            sessionDirectory = path.dirname(String(settings.directory));
            let observedSpill = false;
            const poll = setInterval(() => {
                fs.readdir(String(settings.directory))
                    .then((files) => {
                        observedSpill ||= files.length > 0;
                    })
                    .catch(() => {});
            }, 1);
            let result;
            try {
                result = await db.runAndReadAll(
                    'SELECT COUNT(*) AS n FROM (SELECT i, hash(i) AS h FROM range(2000000) t(i) ORDER BY h)',
                );
            } finally {
                clearInterval(poll);
            }
            expect(result.getRowObjectsJson()).toEqual([{ n: '2000000' }]);
            expect(observedSpill).toBe(true);
        }, 'SELECT * FROM query_events');
        await expect(fs.stat(sessionDirectory)).rejects.toThrow();
    });

    it('cleans up an exhausted spill budget without changing the next session', async () => {
        const nativeRun = DuckDBConnection.prototype.run;
        const run = vi
            .spyOn(DuckDBConnection.prototype, 'run')
            .mockImplementation(function run(
                this: DuckDBConnection,
                sql,
                ...args
            ) {
                return nativeRun.call(
                    this,
                    sql === "SET max_temp_directory_size = '512MB';"
                        ? "SET max_temp_directory_size = '1MB';"
                        : sql,
                    ...args,
                );
            });
        const directories = vi.spyOn(fs, 'mkdtemp');
        const client = new DuckdbWarehouseClient(
            { type: 'duckdb_parquet', resolveSource: async () => source('a') },
            { sharedResourceLimits: { memoryLimit: '16MB', threads: 1 } },
        );
        await expect(
            client['withEphemeralQuerySession'](async (connection) => {
                await connection.run(
                    'SELECT COUNT(*) FROM (SELECT i, hash(i) AS h FROM range(1000000) t(i) ORDER BY h)',
                );
            }, 'SELECT * FROM query_events'),
        ).rejects.toThrow(/max_temp_directory_size|memory|offload/i);
        run.mockRestore();
        const ownedDirectories = await Promise.all(
            directories.mock.results.map(
                (result) => result.value as Promise<string>,
            ),
        );
        await Promise.all(
            ownedDirectories.map((owned) =>
                expect(fs.stat(owned)).rejects.toThrow(),
            ),
        );
        expect(
            (
                await reader(source('b')).runQuery(
                    'SELECT value FROM query_events',
                )
            ).rows,
        ).toEqual([{ value: 42 }]);
    });

    it('removes staged files after native out-of-memory failure and allows the next query', async () => {
        const directories = vi.spyOn(fs, 'mkdtemp');
        const client = new DuckdbWarehouseClient(
            { type: 'duckdb_parquet', resolveSource: async () => source('a') },
            { sharedResourceLimits: { memoryLimit: '4MB', threads: 1 } },
        );
        await expect(
            client['withEphemeralQuerySession'](async (connection) => {
                await connection.run('SELECT list(i) FROM range(1000000) t(i)');
            }, 'SELECT * FROM query_events'),
        ).rejects.toThrow(/out of memory/i);
        const ownedDirectories = await Promise.all(
            directories.mock.results.map(
                (result) => result.value as Promise<string>,
            ),
        );
        await Promise.all(
            ownedDirectories.map((owned) =>
                expect(fs.stat(owned)).rejects.toThrow(),
            ),
        );
        expect(
            (
                await reader(source('b')).runQuery(
                    'SELECT value FROM query_events',
                )
            ).rows,
        ).toEqual([{ value: 42 }]);
    });
});
