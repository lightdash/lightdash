import { DuckDBInstance } from '@duckdb/node-api';
import {
    DimensionType,
    QueryExecutionContext,
    WarehouseTypes,
} from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    PostgresWarehouseClient,
} from '@lightdash/warehouses';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import Logger from '../../logging/logger';
import {
    createLocalParquetUploadStream,
    PreAggregateResultsTooLargeError,
} from './LocalParquetUploadStream';

const fields = [
    { name: 'day', dataTypeID: 1082 },
    { name: 'wall_clock', dataTypeID: 1114 },
    { name: 'metric', dataTypeID: 23 },
];
const values = [
    ['2024-03-31', '2024-03-31 01:30:00', '2'],
    ['2024-06-30', '2024-06-30 00:00:00', '5'],
    ['2024-07-01', '2024-07-01 00:00:00.123456', '11'],
];

type CursorQuery = {
    handleRowDescription: (message: { fields: typeof fields }) => void;
    _result: { parseRow: (row: string[]) => Record<string, unknown> };
};

const mockPgQuery = (query: string | CursorQuery) => {
    if (typeof query === 'string') return Promise.resolve();
    query.handleRowDescription({ fields });
    return Readable.from(
        values.map((row) => ({ row: query._result.parseRow(row), fields })),
    );
};

vi.mock('pg', async (importOriginal) => ({
    ...(await importOriginal<{ default: typeof import('pg') }>()).default,
    Pool: class {
        connect(
            callback: (
                error: null,
                client: { on: () => void; query: typeof mockPgQuery },
                release: () => void,
            ) => void,
        ) {
            callback(
                null,
                {
                    on: vi.fn(),
                    query: mockPgQuery,
                },
                vi.fn(),
            );
        }
        on = vi.fn();
        end = vi.fn();
    },
}));

const createStream = (parquetS3Uri = 's3://bucket/file.parquet') =>
    createLocalParquetUploadStream({
        parquetS3Uri,
        s3Config: { endpoint: '', forcePathStyle: true, useSsl: false },
        logger: Logger,
    });

const writeWideRows = async (
    stream: ReturnType<typeof createLocalParquetUploadStream>,
) => {
    const fieldIds = ['orders_status', 'orders_city', 'orders_total'];
    await stream.write([
        { orders_status: 'shipped', orders_city: 'Lisbon', orders_total: 1 },
        { orders_status: 'placed', orders_city: 'Porto', orders_total: 2 },
    ]);
    stream.setColumns(
        Object.fromEntries(
            fieldIds.map((reference) => [
                reference,
                { reference, type: DimensionType.STRING },
            ]),
        ),
    );
};

describe('createLocalParquetUploadStream', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    test('reports the result size when DuckDB runs out of memory', async () => {
        vi.spyOn(
            DuckdbWarehouseClient.prototype,
            'runSqlWithMetrics',
        ).mockRejectedValue(
            new Error(
                'Out of Memory Error: failed to pin block of size 256.0 KiB (244.1 MiB/244.1 MiB used)',
            ),
        );
        const stream = createStream();
        await writeWideRows(stream);

        const closing = stream.close();
        await expect(closing).rejects.toBeInstanceOf(
            PreAggregateResultsTooLargeError,
        );
        await expect(closing).rejects.toMatchObject({
            name: 'PreAggregateResultsTooLargeError',
            statusCode: 422,
        });
        await expect(closing).rejects.toThrow(
            "This pre-aggregate's results are too large to store (2 rows and 3 columns, 1 MB).",
        );
    });

    test('rethrows other conversion errors unchanged', async () => {
        const error = new Error('IO Error: connection refused');
        vi.spyOn(
            DuckdbWarehouseClient.prototype,
            'runSqlWithMetrics',
        ).mockRejectedValue(error);
        const stream = createStream();
        await writeWideRows(stream);

        await expect(stream.close()).rejects.toBe(error);
    });

    test.each(['UTC', 'Europe/London'])(
        'preserves Postgres dates, timestamps and bucket totals in Parquet under %s',
        async (timezone) => {
            vi.stubEnv('TZ', timezone);
            const instance = await DuckDBInstance.create();
            const db = await instance.connect();
            const dir = mkdtempSync(join(tmpdir(), 'parquet-test-'));
            try {
                const parquetPath = join(dir, 'data.parquet');
                vi.spyOn(
                    DuckdbWarehouseClient.prototype,
                    'runSqlWithMetrics',
                ).mockImplementation(async (sql) => {
                    await db.run(sql);
                    return { totalMs: 0, bootstrapMs: 0, queryMs: 0 };
                });
                const stream = createStream(parquetPath);
                const warehouse = new PostgresWarehouseClient({
                    type: WarehouseTypes.POSTGRES,
                    host: '',
                    port: 5432,
                    user: '',
                    password: '',
                    dbname: '',
                    schema: '',
                });
                await warehouse.executeAsyncQuery(
                    {
                        sql: 'SELECT day, wall_clock, metric FROM events',
                        tags: {
                            query_context:
                                QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                        },
                    },
                    async (rows, columns) => {
                        stream.setColumns(
                            Object.fromEntries(
                                Object.entries(columns).map(
                                    ([reference, column]) => [
                                        reference,
                                        { reference, ...column },
                                    ],
                                ),
                            ),
                        );
                        await stream.write(rows);
                    },
                );
                await stream.close();

                const table = `read_parquet('${parquetPath}')`;
                const stored = await db.runAndReadAll(
                    `SELECT typeof(day), typeof(wall_clock), day::VARCHAR, wall_clock::VARCHAR
                     FROM ${table} ORDER BY metric`,
                );
                expect(stored.getRows()).toEqual([
                    ['DATE', 'TIMESTAMP', '2024-03-31', '2024-03-31 01:30:00'],
                    ['DATE', 'TIMESTAMP', '2024-06-30', '2024-06-30 00:00:00'],
                    [
                        'DATE',
                        'TIMESTAMP',
                        '2024-07-01',
                        '2024-07-01 00:00:00.123456',
                    ],
                ]);

                const bucketRows = ['day', 'week', 'month'].map(
                    (grain) =>
                        `SELECT '${grain}' AS grain, date_trunc('${grain}', day)::DATE::VARCHAR AS date_bucket,
                                date_trunc('${grain}', wall_clock)::DATE::VARCHAR AS timestamp_bucket, sum(metric) AS total
                         FROM ${table} GROUP BY 2, 3`,
                );
                const buckets = await db.runAndReadAll(
                    `${bucketRows.join(' UNION ALL ')} ORDER BY grain, date_bucket`,
                );
                expect(buckets.getRows()).toEqual([
                    ['day', '2024-03-31', '2024-03-31', 2],
                    ['day', '2024-06-30', '2024-06-30', 5],
                    ['day', '2024-07-01', '2024-07-01', 11],
                    ['month', '2024-03-01', '2024-03-01', 2],
                    ['month', '2024-06-01', '2024-06-01', 5],
                    ['month', '2024-07-01', '2024-07-01', 11],
                    ['week', '2024-03-25', '2024-03-25', 2],
                    ['week', '2024-06-24', '2024-06-24', 5],
                    ['week', '2024-07-01', '2024-07-01', 11],
                ]);
            } finally {
                db.closeSync();
                instance.closeSync();
                rmSync(dir, { recursive: true, force: true });
            }
        },
    );
});
