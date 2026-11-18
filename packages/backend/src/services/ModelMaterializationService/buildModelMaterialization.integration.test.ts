import { DuckDBInstance } from '@duckdb/node-api';
import { WarehouseTypes } from '@lightdash/common';
import { PostgresWarehouseClient } from '@lightdash/warehouses';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPostgresServer } from '../../testing/migratedDatabase';
import { buildModelMaterialization } from './buildModelMaterialization';

let directory: string;
beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'materialization-test-'));
});
const { host, port, user, password, adminDatabase } = getPostgresServer();
const warehouse = new PostgresWarehouseClient({
    type: WarehouseTypes.POSTGRES,
    host,
    port,
    user,
    password,
    dbname: adminDatabase,
    schema: 'public',
    sslmode: 'disable',
});
const build = (name: string, sourceSql: string, maxRows: number) =>
    buildModelMaterialization({
        warehouse,
        sourceSql,
        maxRows,
        parquetUri: join(directory, name),
        s3Config: {
            endpoint: 'localhost',
            accessKey: 'test',
            secretKey: 'test',
            useSsl: false,
            forcePathStyle: true,
        },
    });

afterAll(async () => rm(directory, { recursive: true, force: true }));

describe('materialized model Parquet', () => {
    it('preserves native values, duplicate rows and nulls at the exact limit', async () => {
        const source = `SELECT
              9223372036854775807::bigint AS id,
              98765432109876543210.123456789012345678::numeric(38,18) AS amount,
              DATE '2025-03-30' AS day,
              TIMESTAMP '2025-03-30 02:30:00.654321' AS local_time,
              TIMESTAMPTZ '2025-03-30 02:30:00.123456+02' AS instant,
              NULL::integer AS nullable, TRUE AS enabled,
              'quote"'::varchar AS label, 1.25::real AS weight,
              2.125::double precision AS ratio, 3::smallint AS quantity
              FROM generate_series(1, 100)`;
        const file = 'exact.parquet';
        const result = await build(file, source, 100);
        expect(result.rowCount).toBe(100);
        expect(result.byteCount).toBe((await stat(join(directory, file))).size);
        expect(result.nativeSchema.map((c) => c.duckdbType)).toEqual([
            'BIGINT',
            'DECIMAL(38,18)',
            'DATE',
            'TIMESTAMP',
            'TIMESTAMP WITH TIME ZONE',
            'INTEGER',
            'BOOLEAN',
            'VARCHAR',
            'FLOAT',
            'DOUBLE',
            'SMALLINT',
        ]);
        const db = await DuckDBInstance.create(':memory:');
        const connection = await db.connect();
        try {
            const relation = await connection.runAndReadAll(
                `SELECT id::varchar, amount::varchar, day::varchar, local_time::varchar,
                 (instant AT TIME ZONE 'UTC')::varchar, nullable, enabled, label, weight, ratio, quantity, count(*)::integer
                 FROM read_parquet($1) GROUP BY ALL`,
                [join(directory, file)],
            );
            expect(relation.getRows()).toEqual([
                [
                    '9223372036854775807',
                    '98765432109876543210.123456789012345678',
                    '2025-03-30',
                    '2025-03-30 02:30:00.654321',
                    '2025-03-30 00:30:00.123456',
                    null,
                    true,
                    'quote"',
                    1.25,
                    2.125,
                    3,
                    100,
                ],
            ]);
        } finally {
            connection.closeSync();
            db.closeSync();
        }
    });
    it('stores fixed-width character columns as text, padded as Postgres returns them', async () => {
        const file = 'bpchar.parquet';
        const result = await build(
            file,
            `SELECT 'GB'::char(2) AS country, 'EU'::char(3) AS region`,
            10,
        );
        expect(result.nativeSchema.map((c) => c.duckdbType)).toEqual([
            'VARCHAR',
            'VARCHAR',
        ]);
        const db = await DuckDBInstance.create(':memory:');
        const connection = await db.connect();
        try {
            const relation = await connection.runAndReadAll(
                'SELECT country, region FROM read_parquet($1)',
                [join(directory, file)],
            );
            expect(relation.getRows()).toEqual([['GB', 'EU ']]);
        } finally {
            connection.closeSync();
            db.closeSync();
        }
    });
    it('preserves the native schema of an empty result', async () => {
        const result = await build(
            'empty.parquet',
            'SELECT 1::numeric(20,4) AS amount WHERE false',
            1,
        );
        expect(result.rowCount).toBe(0);
        expect(result.nativeSchema).toEqual([
            {
                name: 'amount',
                dataTypeID: 1700,
                dataTypeModifier: 20 * 65536 + 4 + 4,
                duckdbType: 'DECIMAL(20,4)',
            },
        ]);
        expect(result.byteCount).toBeGreaterThan(0);
    });
    it.each([
        [
            'overflow',
            'SELECT i FROM generate_series(1, 101) s(i)',
            'exceeds max_rows',
        ],
        [
            'unbounded numeric',
            'SELECT 1::numeric AS amount WHERE false',
            'Unsupported Postgres column type',
        ],
        [
            'wide numeric',
            'SELECT 1::numeric(40,5) AS amount',
            'Unsupported Postgres column type',
        ],
        [
            'json',
            'SELECT NULL::jsonb AS value',
            'Unsupported Postgres column type',
        ],
        [
            'duplicate columns',
            'SELECT 1 AS x, 2 AS "X"',
            'uniquely named columns',
        ],
    ])('rejects %s before uploading', async (name, query, error) => {
        await expect(build(name, query, 100)).rejects.toThrow(error);
        await expect(stat(join(directory, name))).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });
});
