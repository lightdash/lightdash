import { DuckDBInstance } from '@duckdb/node-api';
import { DuckdbConnectionType, WarehouseTypes } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';

describe.sequential('DuckdbWarehouseClient embedded credentials', () => {
    let dataDirectory: string;
    let previousDataDirectory: string | undefined;

    beforeEach(async () => {
        previousDataDirectory = process.env.PLAYGROUND_DATA_DIR;
        dataDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-playground-'),
        );
        process.env.PLAYGROUND_DATA_DIR = dataDirectory;
    });

    afterEach(async () => {
        if (previousDataDirectory === undefined) {
            delete process.env.PLAYGROUND_DATA_DIR;
        } else {
            process.env.PLAYGROUND_DATA_DIR = previousDataDirectory;
        }
        await fs.rm(dataDirectory, { recursive: true, force: true });
    });

    const embeddedCredentials = (dataset: string) => ({
        type: WarehouseTypes.DUCKDB as const,
        connectionType: DuckdbConnectionType.EMBEDDED as const,
        dataset,
    });

    const createEmbeddedDatabase = async (dataset: string) => {
        const databasePath = path.join(dataDirectory, `${dataset}.duckdb`);
        const instance = await DuckDBInstance.create(databasePath);
        const connection = await instance.connect();
        await connection.run('CREATE TABLE sample AS SELECT 1 AS value');
        await connection.run(
            'CREATE MACRO csv_sniffer(file_path) AS TABLE (FROM sniff_csv(file_path))',
        );
        connection.closeSync();
        instance.closeSync();
    };

    it.each(['../etc', 'foo/bar', '/tmp/sample'])(
        'rejects unsafe dataset identifiers: %s',
        (dataset) => {
            expect(
                () => new DuckdbWarehouseClient(embeddedCredentials(dataset)),
            ).toThrow(
                'Embedded DuckDB dataset must contain only lowercase letters, numbers, hyphens, and underscores',
            );
        },
    );

    it('names the missing dataset and base directory', () => {
        expect(
            () => new DuckdbWarehouseClient(embeddedCredentials('missing')),
        ).toThrow(
            `Embedded DuckDB dataset "missing" was not found in ${dataDirectory}`,
        );
    });

    it('resolves datasets from the server-configured data directory', async () => {
        const databasePath = path.join(dataDirectory, 'sample.duckdb');
        const instance = await DuckDBInstance.create(databasePath);
        instance.closeSync();

        expect(
            () => new DuckdbWarehouseClient(embeddedCredentials('sample')),
        ).not.toThrow();
    });

    it('opens an embedded database read-only', async () => {
        await createEmbeddedDatabase('sample');

        const client = new DuckdbWarehouseClient(embeddedCredentials('sample'));

        await expect(
            client.runQuery('SELECT value FROM sample'),
        ).resolves.toMatchObject({
            rows: [{ value: 1 }],
        });
    });

    it('interrupts embedded queries that exceed their execution deadline', async () => {
        await createEmbeddedDatabase('sample');

        const client = new DuckdbWarehouseClient(
            embeddedCredentials('sample'),
            { embeddedQueryTimeoutMs: 50 },
        );

        await expect(
            client.runQuery(
                'SELECT sum(sqrt(i)) FROM range(1000000000000) values(i)',
            ),
        ).rejects.toThrow(
            'Playground query exceeded the 0.05 second execution limit and was stopped. Try a simpler query.',
        );
        await expect(
            client.runQuery('SELECT 1 AS value'),
        ).resolves.toMatchObject({ rows: [{ value: 1 }] });
    });

    it.each([
        `SELECT * FROM "read_parquet"('/etc/passwd')`,
        `SELECT * FROM parquet_metadata('/etc/passwd')`,
        `SELECT * FROM csv_sniffer('/etc/passwd')`,
        `SELECT * FROM sniff_csv('/etc/passwd')`,
    ])('confines file-reading table functions: %s', async (sql) => {
        await createEmbeddedDatabase('sample');
        const client = new DuckdbWarehouseClient(embeddedCredentials('sample'));

        await expect(client.runQuery(sql)).rejects.toThrow(
            'File system LocalFileSystem has been disabled by configuration',
        );
    });

    it.each([
        "SELECT '--' AS marker FROM read_csv('/tmp/data.csv')",
        `SELECT "--" FROM read_csv('/tmp/data.csv')`,
        "SELECT $$--$$ AS marker FROM read_csv('/tmp/data.csv')",
    ])(
        'rejects file functions after comment markers in literals',
        async (sql) => {
            await createEmbeddedDatabase('sample');
            const client = new DuckdbWarehouseClient(
                embeddedCredentials('sample'),
            );

            await expect(client.runQuery(sql)).rejects.toThrow(
                "SQL validation error: function 'read_csv' is not allowed",
            );
        },
    );

    it('rejects file functions split by block comments', async () => {
        await createEmbeddedDatabase('sample');
        const client = new DuckdbWarehouseClient(embeddedCredentials('sample'));

        await expect(
            client.runQuery("SELECT * FROM read_/**/csv('/tmp/data.csv')"),
        ).rejects.toThrow(
            "SQL validation error: function 'read_csv' is not allowed",
        );
    });
});
