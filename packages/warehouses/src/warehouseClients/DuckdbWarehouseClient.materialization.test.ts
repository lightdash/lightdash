import { DuckDBInstance } from '@duckdb/node-api';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';

it('limits reads to the pinned generation when another Parquet object is present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'materialization-scope-'));
    const first = join(dir, 'first.parquet');
    const second = join(dir, 'second.parquet');
    const db = await DuckDBInstance.create(':memory:');
    const connection = await db.connect();
    try {
        await connection.run(
            `COPY (SELECT 1 AS value) TO '${first}' (FORMAT PARQUET)`,
        );
        await connection.run(
            `COPY (SELECT 2 AS value) TO '${second}' (FORMAT PARQUET)`,
        );
        const client = DuckdbWarehouseClient.createForPreAggregate(
            {
                type: 'duckdb_s3',
                s3Config: {
                    endpoint: 'localhost',
                    accessKey: 'test',
                    secretKey: 'test',
                    forcePathStyle: true,
                    useSsl: false,
                    scope: [first],
                },
            },
            {
                objectStorageOnly: true,
                resourceLimits: { memoryLimit: '128MB', threads: 1 },
            },
        );
        await expect(
            client.runQuery(`SELECT * FROM read_parquet('${first}')`),
        ).resolves.toMatchObject({ rows: [{ value: 1 }] });
        await expect(
            client.runQuery(`SELECT * FROM read_parquet('${second}')`),
        ).rejects.toThrow(/permission|disabled/i);
    } finally {
        connection.closeSync();
        db.closeSync();
        await rm(dir, { recursive: true, force: true });
    }
});
