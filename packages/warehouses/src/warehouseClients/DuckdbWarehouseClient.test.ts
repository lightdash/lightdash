import {
    DimensionType,
    QueryExecutionContext,
    WarehouseTypes,
} from '@lightdash/common';
import fs from 'fs/promises';
import {
    DuckdbWarehouseClient,
    mapFieldTypeFromTypeId,
} from './DuckdbWarehouseClient';

const createInstanceMock = jest.fn();

// Must provide DuckDBTypeId since mapFieldTypeFromTypeId references it at runtime
const DUCKDB_TYPE_IDS = {
    BOOLEAN: 1,
    TINYINT: 2,
    SMALLINT: 3,
    INTEGER: 4,
    BIGINT: 5,
    UTINYINT: 6,
    USMALLINT: 7,
    UINTEGER: 8,
    UBIGINT: 9,
    FLOAT: 10,
    DOUBLE: 11,
    TIMESTAMP: 12,
    DATE: 13,
    TIME: 14,
    DECIMAL: 19,
    HUGEINT: 25,
    TIMESTAMP_S: 27,
    TIMESTAMP_MS: 28,
    TIMESTAMP_NS: 29,
    TIMESTAMP_TZ: 31,
    TIME_TZ: 32,
    UHUGEINT: 49,
    // Not referenced in switch — used to test default→STRING
    VARCHAR: 17,
    BLOB: 18,
} as const;

jest.mock(
    '@duckdb/node-api',
    () => ({
        DuckDBTypeId: {
            BOOLEAN: 1,
            TINYINT: 2,
            SMALLINT: 3,
            INTEGER: 4,
            BIGINT: 5,
            UTINYINT: 6,
            USMALLINT: 7,
            UINTEGER: 8,
            UBIGINT: 9,
            FLOAT: 10,
            DOUBLE: 11,
            TIMESTAMP: 12,
            DATE: 13,
            TIME: 14,
            DECIMAL: 19,
            HUGEINT: 25,
            TIMESTAMP_S: 27,
            TIMESTAMP_MS: 28,
            TIMESTAMP_NS: 29,
            TIMESTAMP_TZ: 31,
            TIME_TZ: 32,
            UHUGEINT: 49,
        },
        DuckDBInstance: {
            create: (...args: unknown[]) => createInstanceMock(...args),
        },
    }),
    { virtual: true },
);

const getMockStreamResult = (
    chunks: Record<string, unknown>[][],
    columnTypeIds: number[],
) => {
    const columnNames = Object.keys(chunks[0]?.[0] || {});
    return {
        columnCount: columnNames.length,
        columnNames: () => columnNames,
        columnTypeId: (i: number) => columnTypeIds[i] ?? 0,
        // eslint-disable-next-line object-shorthand, func-names, no-restricted-syntax
        yieldRowObjectJson: async function* () {
            // eslint-disable-next-line no-restricted-syntax
            for (const chunk of chunks) {
                yield chunk;
            }
        },
    };
};

const createMockExtractStatements = (
    overrides?: Partial<{
        count: number;
        statementType: number;
    }>,
) =>
    jest.fn(async () => ({
        count: overrides?.count ?? 1,
        prepare: async () => ({
            statementType: overrides?.statementType ?? 1, // SELECT
            destroySync: jest.fn(),
        }),
    }));

const createMockConnection = (
    streamMock: jest.Mock,
    runMock: jest.Mock = jest.fn(),
    opts?: {
        extractStatements?: jest.Mock;
    },
) => ({
    connect: async () => ({
        run: runMock,
        stream: streamMock,
        extractStatements:
            opts?.extractStatements ?? createMockExtractStatements(),
        closeSync: jest.fn(),
        disconnectSync: jest.fn(),
    }),
    closeSync: jest.fn(),
});

describe('mapFieldTypeFromTypeId', () => {
    it('should map date types', () => {
        expect(mapFieldTypeFromTypeId(DUCKDB_TYPE_IDS.DATE)).toBe(
            DimensionType.DATE,
        );
    });

    it('should map timestamp types', () => {
        const timestampIds = [
            DUCKDB_TYPE_IDS.TIMESTAMP,
            DUCKDB_TYPE_IDS.TIMESTAMP_S,
            DUCKDB_TYPE_IDS.TIMESTAMP_MS,
            DUCKDB_TYPE_IDS.TIMESTAMP_NS,
            DUCKDB_TYPE_IDS.TIMESTAMP_TZ,
            DUCKDB_TYPE_IDS.TIME,
            DUCKDB_TYPE_IDS.TIME_TZ,
        ];
        timestampIds.forEach((id) => {
            expect(mapFieldTypeFromTypeId(id)).toBe(DimensionType.TIMESTAMP);
        });
    });

    it('should map boolean type', () => {
        expect(mapFieldTypeFromTypeId(DUCKDB_TYPE_IDS.BOOLEAN)).toBe(
            DimensionType.BOOLEAN,
        );
    });

    it('should map numeric types', () => {
        const numericIds = [
            DUCKDB_TYPE_IDS.TINYINT,
            DUCKDB_TYPE_IDS.SMALLINT,
            DUCKDB_TYPE_IDS.INTEGER,
            DUCKDB_TYPE_IDS.BIGINT,
            DUCKDB_TYPE_IDS.UTINYINT,
            DUCKDB_TYPE_IDS.USMALLINT,
            DUCKDB_TYPE_IDS.UINTEGER,
            DUCKDB_TYPE_IDS.UBIGINT,
            DUCKDB_TYPE_IDS.HUGEINT,
            DUCKDB_TYPE_IDS.UHUGEINT,
            DUCKDB_TYPE_IDS.FLOAT,
            DUCKDB_TYPE_IDS.DOUBLE,
            DUCKDB_TYPE_IDS.DECIMAL,
        ];
        numericIds.forEach((id) => {
            expect(mapFieldTypeFromTypeId(id)).toBe(DimensionType.NUMBER);
        });
    });

    it('should default to string for unknown types', () => {
        expect(mapFieldTypeFromTypeId(DUCKDB_TYPE_IDS.VARCHAR)).toBe(
            DimensionType.STRING,
        );
        expect(mapFieldTypeFromTypeId(DUCKDB_TYPE_IDS.BLOB)).toBe(
            DimensionType.STRING,
        );
        expect(mapFieldTypeFromTypeId(9999)).toBe(DimensionType.STRING);
    });
});

describe('DuckdbWarehouseClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        DuckdbWarehouseClient.resetSharedDuckdbStateForTesting();
    });

    it('should return query rows and mapped fields', async () => {
        const rows = [
            {
                customer_name: 'Alice',
                order_count: 2,
                last_order_at: '2026-02-22 12:00:00',
            },
        ];

        const streamMock = jest.fn(async () =>
            getMockStreamResult(
                [rows],
                [
                    DUCKDB_TYPE_IDS.VARCHAR,
                    DUCKDB_TYPE_IDS.INTEGER,
                    DUCKDB_TYPE_IDS.TIMESTAMP,
                ],
            ),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = DuckdbWarehouseClient.createForPreAggregate({
            type: 'duckdb_s3',
            s3Config: {
                endpoint: 'localhost:9000',
                region: 'us-east-1',
                forcePathStyle: true,
                useSsl: false,
            },
        });
        const result = await client.runQuery('SELECT * FROM customers');

        expect(result.rows).toEqual(rows);
        expect(result.fields).toEqual({
            customer_name: { type: DimensionType.STRING },
            order_count: { type: DimensionType.NUMBER },
            last_order_at: { type: DimensionType.TIMESTAMP },
        });
    });

    it('should stream results in multiple chunks', async () => {
        const chunk1 = [{ id: 1 }, { id: 2 }];
        const chunk2 = [{ id: 3 }];

        const streamMock = jest.fn(async () =>
            getMockStreamResult([chunk1, chunk2], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = DuckdbWarehouseClient.createForPreAggregate();
        const streamCallback = jest.fn();
        const result = await client.executeAsyncQuery(
            {
                sql: 'SELECT id FROM t',
                tags: { project_uuid: 'proj-1' },
            },
            streamCallback,
        );

        expect(streamCallback).toHaveBeenCalledTimes(2);
        expect(streamCallback).toHaveBeenNthCalledWith(1, chunk1, {
            id: { type: DimensionType.NUMBER },
        });
        expect(streamCallback).toHaveBeenNthCalledWith(2, chunk2, {
            id: { type: DimensionType.NUMBER },
        });
        expect(result.totalRows).toBe(3);
    });

    it('should handle empty result set', async () => {
        const streamMock = jest.fn(async () =>
            getMockStreamResult([], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = DuckdbWarehouseClient.createForPreAggregate();
        const result = await client.runQuery('SELECT id FROM empty_table');

        expect(result.rows).toEqual([]);
        expect(result.fields).toEqual({});
    });

    it('should set timezone, S3 config, and shared resource limits before streaming', async () => {
        const runMock = jest.fn();
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const config = {
            type: 'duckdb_s3' as const,
            s3Config: {
                endpoint: 'localhost:9000',
                region: 'us-east-1',
                accessKey: 'key',
                secretKey: 'secret',
                forcePathStyle: true,
                useSsl: false,
            },
        };

        const clientA = new DuckdbWarehouseClient(config, {
            sharedResourceLimits: {
                memoryLimit: '3GB',
                threads: 4,
            },
            instanceCacheKey: 'pre-aggregate-query-instance',
        });
        const clientB = new DuckdbWarehouseClient(config, {
            sharedResourceLimits: {
                memoryLimit: '3GB',
                threads: 4,
            },
            instanceCacheKey: 'pre-aggregate-query-instance',
        });

        await clientA.runQuery('SELECT 1 AS val');
        await clientB.runQuery('SELECT 1 AS val');

        expect(createInstanceMock).toHaveBeenCalledTimes(1);
        expect(
            runMock.mock.calls.filter(([sql]) =>
                (sql as string).includes(
                    'CREATE OR REPLACE SECRET __lightdash_s3',
                ),
            ),
        ).toHaveLength(1);
        expect(streamMock).toHaveBeenCalledTimes(2);
    });

    it('should treat instanceCacheKey as the shared instance identity', async () => {
        const runMock = jest.fn();
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const clientA = new DuckdbWarehouseClient(
            {
                type: 'duckdb_s3',
                s3Config: {
                    endpoint: 'localhost:9000',
                    region: 'us-east-1',
                    accessKey: 'key-a',
                    secretKey: 'secret-a',
                    forcePathStyle: true,
                    useSsl: false,
                },
            },
            {
                sharedResourceLimits: {
                    memoryLimit: '3GB',
                },
                instanceCacheKey: 'pre-aggregate-query-instance',
            },
        );
        const clientB = new DuckdbWarehouseClient(
            {
                type: 'duckdb_s3',
                s3Config: {
                    endpoint: 'localhost:9000',
                    region: 'us-east-1',
                    accessKey: 'key-b',
                    secretKey: 'secret-b',
                    forcePathStyle: true,
                    useSsl: false,
                },
            },
            {
                sharedResourceLimits: {
                    memoryLimit: '6GB',
                    threads: 8,
                },
                instanceCacheKey: 'pre-aggregate-query-instance',
            },
        );

        await clientA.runQuery('SELECT 1 AS val');
        await clientB.runQuery('SELECT 1 AS val');

        expect(createInstanceMock).toHaveBeenCalledTimes(1);
        expect(
            runMock.mock.calls.filter(([sql]) =>
                (sql as string).includes(
                    'CREATE OR REPLACE SECRET __lightdash_s3',
                ),
            ),
        ).toHaveLength(1);
        expect(runMock).not.toHaveBeenCalledWith("SET memory_limit = '6GB';");
        expect(runMock).not.toHaveBeenCalledWith('SET threads = 8;');
    });

    it('should log structured DuckDB profile metrics with query tags', async () => {
        const runMock = jest.fn(async (sql: string) => {
            const match = sql.match(/^PRAGMA profiling_output='(.+)';$/);
            if (match) {
                await fs.writeFile(
                    match[1],
                    JSON.stringify({
                        latency: 4.747,
                        cpu_time: 4.731,
                        rows_returned: 68,
                        total_bytes_read: 20225287,
                        children: [
                            {
                                operator_name: 'READ_PARQUET ',
                                operator_timing: 4.632,
                                operator_cardinality: 9905024,
                                children: [],
                            },
                        ],
                    }),
                );
            }
        });
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );
        const logger = { info: jest.fn() };

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = new DuckdbWarehouseClient(undefined, { logger });
        await client.runQuery('SELECT 1 AS val', {
            query_uuid: 'query-123',
            chart_uuid: 'chart-123',
            dashboard_uuid: 'dashboard-123',
            query_context: QueryExecutionContext.DASHBOARD,
        });

        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'DuckDB query profile: latency=4747ms cpu=4731ms',
            ),
            expect.objectContaining({
                query_uuid: 'query-123',
                chart_uuid: 'chart-123',
                dashboard_uuid: 'dashboard-123',
                query_context: QueryExecutionContext.DASHBOARD,
                latencyMs: 4747,
                cpuMs: 4731,
                waitMs: 16,
                readParquetMs: 4632,
                rowsScanned: 9905024,
                rowsReturned: 68,
                bytesRead: 20225287,
                scanAmplification: 9905024 / 68,
            }),
        );
    });

    it('should log raw profile timings when DuckDB reports cpu above latency', async () => {
        const runMock = jest.fn(async (sql: string) => {
            const match = sql.match(/^PRAGMA profiling_output='(.+)';$/);
            if (match) {
                await fs.writeFile(
                    match[1],
                    JSON.stringify({
                        latency: 0.002,
                        cpu_time: 0.004,
                        rows_returned: 123,
                        total_bytes_read: 0,
                        children: [],
                    }),
                );
            }
        });
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );
        const logger = { info: jest.fn() };

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = new DuckdbWarehouseClient(undefined, { logger });
        await client.runQuery('SELECT 1 AS val');

        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining(
                'DuckDB query profile: latency=2ms cpu=4ms wait=-2ms',
            ),
            expect.objectContaining({
                latencyMs: 2,
                cpuMs: 4,
                waitMs: -2,
            }),
        );
    });

    describe('SQL security validation', () => {
        it('should reject SET statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType: 20, // SET
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery("SET s3_endpoint = 'attacker.com'"),
            ).rejects.toThrow(
                'SQL validation error: only SELECT statements are allowed',
            );
            expect(streamMock).not.toHaveBeenCalled();
        });

        it('should reject COPY statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType: 11, // COPY
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery("COPY t TO '/tmp/data.csv'"),
            ).rejects.toThrow(
                'SQL validation error: only SELECT statements are allowed',
            );
        });

        it('should reject ATTACH statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType: 25, // ATTACH
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery("ATTACH DATABASE 'file.db'"),
            ).rejects.toThrow(
                'SQL validation error: only SELECT statements are allowed',
            );
        });

        it('should reject multiple statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        count: 2,
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery('SELECT 1; DROP TABLE users'),
            ).rejects.toThrow(
                'SQL validation error: multiple SQL statements are not allowed',
            );
        });

        it('should reject queries with current_setting()', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery(
                    "SELECT current_setting('s3_secret_access_key')",
                ),
            ).rejects.toThrow(
                "SQL validation error: function 'current_setting' is not allowed",
            );
        });

        it('should reject queries with duckdb_settings()', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery('SELECT * FROM duckdb_settings()'),
            ).rejects.toThrow(
                "SQL validation error: function 'duckdb_settings' is not allowed",
            );
        });

        it('should reject queries with duckdb_secrets()', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery('SELECT * FROM duckdb_secrets()'),
            ).rejects.toThrow(
                "SQL validation error: function 'duckdb_secrets' is not allowed",
            );
        });

        it('should ignore blocked functions inside SQL comments', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            // Should NOT throw because current_setting is in a comment
            const result = await client.runQuery(
                "SELECT 1 -- current_setting('s3_secret_access_key')",
            );
            expect(result.rows).toEqual([{ val: 1 }]);
        });

        it('should allow COPY statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: 10, // COPY
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await client.runSql(
                "COPY table TO 's3://bucket/data.parquet' (FORMAT PARQUET)",
            );
            expect(runMock).toHaveBeenCalledWith(
                "COPY table TO 's3://bucket/data.parquet' (FORMAT PARQUET)",
            );
        });

        it('should reject SET statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: 20, // SET
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runSql("SET s3_endpoint = 'attacker.com'"),
            ).rejects.toThrow(
                'SQL validation error: statement type 20 is not allowed in internal SQL',
            );
        });

        it('should reject ATTACH statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: 25, // ATTACH
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runSql("ATTACH DATABASE 'file.db'"),
            ).rejects.toThrow(
                'SQL validation error: statement type 25 is not allowed in internal SQL',
            );
        });

        it('should reject LOAD statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: 21, // LOAD
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runSql("LOAD 'malicious_extension'"),
            ).rejects.toThrow(
                'SQL validation error: statement type 21 is not allowed in internal SQL',
            );
        });

        it('should reject introspection functions in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runSql(
                    "COPY (SELECT current_setting('s3_secret_access_key')) TO '/tmp/out.csv'",
                ),
            ).rejects.toThrow(
                "SQL validation error: function 'current_setting' is not allowed",
            );
        });

        it('should allow valid SELECT queries', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult(
                    [[{ id: 1, name: 'test' }]],
                    [DUCKDB_TYPE_IDS.INTEGER, DUCKDB_TYPE_IDS.VARCHAR],
                ),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            const result = await client.runQuery(
                'SELECT id, name FROM users WHERE id = 1',
            );
            expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
        });

        it('should reject EXPLAIN statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult(
                    [[{ explain_value: 'plan output' }]],
                    [DUCKDB_TYPE_IDS.VARCHAR],
                ),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType: 4, // EXPLAIN
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery('EXPLAIN SELECT * FROM users'),
            ).rejects.toThrow(
                'SQL validation error: only SELECT statements are allowed',
            );
        });
    });

    it('should pass token in connection string for MotherDuck', async () => {
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ id: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKDB,
            database: 'my_database',
            schema: 'main',
            token: 'my_motherduck_token',
        });

        await client.runQuery('SELECT 1 AS id');

        expect(createInstanceMock).toHaveBeenCalledWith(
            'md:my_database?motherduck_token=my_motherduck_token',
        );
    });

    it('should use local path when no token is provided', async () => {
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ id: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKDB,
            database: 'my_local.db',
            schema: 'main',
        });

        await client.runQuery('SELECT 1 AS id');

        expect(createInstanceMock).toHaveBeenCalledWith('my_local.db');
    });
});
