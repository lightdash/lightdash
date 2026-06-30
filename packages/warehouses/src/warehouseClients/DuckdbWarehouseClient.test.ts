import {
    DimensionType,
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    QueryExecutionContext,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import fs from 'fs/promises';
import type { Mock } from 'vitest';
import {
    DuckdbWarehouseClient,
    mapFieldTypeFromTypeId,
} from './DuckdbWarehouseClient';

const createInstanceMock = vi.fn();

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

vi.mock('@duckdb/node-api', () => ({
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
}));

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
    vi.fn(async () => ({
        count: overrides?.count ?? 1,
        prepare: async () => ({
            statementType: overrides?.statementType ?? 1, // SELECT
            destroySync: vi.fn(),
        }),
    }));

const createMockConnection = (
    streamMock: Mock,
    runMock: Mock = vi.fn(),
    opts?: {
        extractStatements?: Mock;
    },
) => ({
    connect: async () => ({
        run: runMock,
        stream: streamMock,
        extractStatements:
            opts?.extractStatements ?? createMockExtractStatements(),
        closeSync: vi.fn(),
        disconnectSync: vi.fn(),
    }),
    closeSync: vi.fn(),
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
        vi.clearAllMocks();
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

        const streamMock = vi.fn(async () =>
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

        const streamMock = vi.fn(async () =>
            getMockStreamResult([chunk1, chunk2], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = DuckdbWarehouseClient.createForPreAggregate();
        const streamCallback = vi.fn();
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
        const streamMock = vi.fn(async () =>
            getMockStreamResult([], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(createMockConnection(streamMock));

        const client = DuckdbWarehouseClient.createForPreAggregate();
        const result = await client.runQuery('SELECT id FROM empty_table');

        expect(result.rows).toEqual([]);
        expect(result.fields).toEqual({});
    });

    it('should set timezone, S3 config, and shared resource limits before streaming', async () => {
        const runMock = vi.fn();
        const streamMock = vi.fn(async () =>
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

    it('should use DuckDB credential chain for S3 config without static credentials', async () => {
        const runMock = vi.fn();
        const streamMock = vi.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = DuckdbWarehouseClient.createForPreAggregate({
            type: 'duckdb_s3',
            s3Config: {
                endpoint: 's3.eu-west-1.amazonaws.com',
                region: 'eu-west-1',
                forcePathStyle: false,
                useSsl: true,
            },
        });

        await client.runQuery('SELECT 1 AS val');

        expect(runMock).toHaveBeenCalledWith('INSTALL aws;');
        expect(runMock).toHaveBeenCalledWith('LOAD aws;');

        const secretSql = runMock.mock.calls
            .map(([sql]) => sql as string)
            .find((sql) =>
                sql.includes('CREATE OR REPLACE SECRET __lightdash_s3'),
            );

        expect(secretSql).toContain('PROVIDER credential_chain');
        expect(secretSql).toContain('REFRESH auto');
        expect(secretSql).toContain("VALIDATION 'none'");
        expect(secretSql).toContain("REGION 'eu-west-1'");
        expect(secretSql).toContain("ENDPOINT 's3.eu-west-1.amazonaws.com'");
        expect(secretSql).not.toContain('KEY_ID');
        expect(secretSql).not.toContain("SECRET '");
    });

    it('should use static DuckDB S3 credentials when configured', async () => {
        const runMock = vi.fn();
        const streamMock = vi.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = DuckdbWarehouseClient.createForPreAggregate({
            type: 'duckdb_s3',
            s3Config: {
                endpoint: 'localhost:9000',
                region: 'us-east-1',
                accessKey: 'key',
                secretKey: 'secret',
                forcePathStyle: true,
                useSsl: false,
            },
        });

        await client.runQuery('SELECT 1 AS val');

        expect(runMock).not.toHaveBeenCalledWith('INSTALL aws;');
        expect(runMock).not.toHaveBeenCalledWith('LOAD aws;');

        const secretSql = runMock.mock.calls
            .map(([sql]) => sql as string)
            .find((sql) =>
                sql.includes('CREATE OR REPLACE SECRET __lightdash_s3'),
            );

        expect(secretSql).not.toContain('PROVIDER credential_chain');
        expect(secretSql).toContain("KEY_ID 'key'");
        expect(secretSql).toContain("SECRET 'secret'");
        expect(secretSql).toContain("URL_STYLE 'path'");
        expect(secretSql).toContain('USE_SSL false');
    });

    it('should treat instanceCacheKey as the shared instance identity', async () => {
        const runMock = vi.fn();
        const streamMock = vi.fn(async () =>
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
        const runMock = vi.fn(async (sql: string) => {
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
        const streamMock = vi.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );
        const logger = { info: vi.fn() };

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
        const runMock = vi.fn(async (sql: string) => {
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
        const streamMock = vi.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );
        const logger = { info: vi.fn() };

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
        it.each([
            {
                name: 'SET statements',
                sql: "SET s3_endpoint = 'attacker.com'",
                statementType: 20,
            },
            {
                name: 'COPY statements',
                sql: "COPY t TO '/tmp/data.csv'",
                statementType: 11,
            },
            {
                name: 'ATTACH statements',
                sql: "ATTACH DATABASE 'file.db'",
                statementType: 25,
            },
            {
                name: 'EXPLAIN statements',
                sql: 'EXPLAIN SELECT * FROM users',
                statementType: 4,
            },
        ])('should reject $name', async ({ sql, statementType }) => {
            const streamMock = vi.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, vi.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType,
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(client.runQuery(sql)).rejects.toThrow(
                'SQL validation error: only SELECT statements are allowed',
            );
            expect(streamMock).not.toHaveBeenCalled();
        });

        it('should reject multiple statements', async () => {
            const streamMock = vi.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, vi.fn(), {
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

        it.each(['current_setting', 'duckdb_settings', 'duckdb_secrets'])(
            'should reject queries with %s()',
            async (blockedFunction) => {
                const streamMock = vi.fn(async () =>
                    getMockStreamResult(
                        [[{ val: 1 }]],
                        [DUCKDB_TYPE_IDS.INTEGER],
                    ),
                );

                createInstanceMock.mockResolvedValue(
                    createMockConnection(streamMock),
                );

                const client = new DuckdbWarehouseClient();
                await expect(
                    client.runQuery(`SELECT * FROM ${blockedFunction}()`),
                ).rejects.toThrow(
                    `SQL validation error: function '${blockedFunction}' is not allowed`,
                );
            },
        );

        it.each([
            'read_csv',
            'read_csv_auto',
            'read_json',
            'read_json_auto',
            'read_json_objects',
            'read_json_objects_auto',
            'read_ndjson',
            'read_ndjson_auto',
            'read_ndjson_objects',
            'read_ndjson_objects_auto',
            'read_parquet',
            'read_text',
            'read_blob',
            'read_xlsx',
        ])('should reject user queries with %s()', async (blockedFunction) => {
            const streamMock = vi.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery(`SELECT * FROM ${blockedFunction}('/tmp/a')`),
            ).rejects.toThrow(
                `SQL validation error: function '${blockedFunction}' is not allowed`,
            );
            expect(streamMock).not.toHaveBeenCalled();
        });

        it('should reject user queries that use file table paths', async () => {
            const streamMock = vi.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            await expect(
                client.runQuery("SELECT * FROM '/tmp/data.parquet'"),
            ).rejects.toThrow(
                'SQL validation error: file table paths are not allowed',
            );
            expect(streamMock).not.toHaveBeenCalled();
        });

        it('should ignore blocked functions inside SQL comments', async () => {
            const streamMock = vi.fn(async () =>
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

        it('should ignore blocked file readers inside SQL comments', async () => {
            const streamMock = vi.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock),
            );

            const client = new DuckdbWarehouseClient();
            const result = await client.runQuery(
                "SELECT 1 -- SELECT * FROM read_parquet('/tmp/data.parquet')",
            );
            expect(result.rows).toEqual([{ val: 1 }]);
        });

        it('should allow COPY statements in runSql', async () => {
            const streamMock = vi.fn();
            const runMock = vi.fn();

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

        it('should allow internal SQL to read staged files', async () => {
            const streamMock = vi.fn();
            const runMock = vi.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock),
            );

            const client = new DuckdbWarehouseClient();
            await client.runSql(
                "CREATE TABLE staged AS SELECT * FROM read_parquet('s3://bucket/data.parquet')",
            );
            expect(runMock).toHaveBeenCalledWith(
                "CREATE TABLE staged AS SELECT * FROM read_parquet('s3://bucket/data.parquet')",
            );
        });

        it.each([
            {
                name: 'SET statements',
                sql: "SET s3_endpoint = 'attacker.com'",
                statementType: 20,
            },
            {
                name: 'ATTACH statements',
                sql: "ATTACH DATABASE 'file.db'",
                statementType: 25,
            },
            {
                name: 'LOAD statements',
                sql: "LOAD 'malicious_extension'",
                statementType: 21,
            },
        ])('should reject $name in runSql', async ({ sql, statementType }) => {
            const streamMock = vi.fn();
            const runMock = vi.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType,
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await expect(client.runSql(sql)).rejects.toThrow(
                `SQL validation error: statement type ${statementType} is not allowed in internal SQL`,
            );
            expect(runMock).not.toHaveBeenCalledWith(sql);
        });

        it('should reject introspection functions in runSql', async () => {
            const streamMock = vi.fn();
            const runMock = vi.fn();

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
            expect(runMock).not.toHaveBeenCalledWith(
                "COPY (SELECT current_setting('s3_secret_access_key')) TO '/tmp/out.csv'",
            );
        });

        it('should allow valid SELECT queries', async () => {
            const streamMock = vi.fn(async () =>
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
    });

    it.each([
        {
            name: 'pass encoded token in SaaS-mode connection string for MotherDuck',
            credentials: {
                type: WarehouseTypes.DUCKDB as const,
                connectionType: DuckdbConnectionType.MOTHERDUCK as const,
                database: 'my_database',
                schema: 'main',
                token: 'my_motherduck_token+with=symbols',
            },
            expectedPath:
                'md:my_database?motherduck_token=my_motherduck_token%2Bwith%3Dsymbols&saas_mode=true',
        },
        {
            name: 'encode MotherDuck database names before adding connection parameters',
            credentials: {
                type: WarehouseTypes.DUCKDB as const,
                connectionType: DuckdbConnectionType.MOTHERDUCK as const,
                database: 'analytics?motherduck_token=other&saas_mode=false',
                schema: 'main',
                token: 'my_motherduck_token',
            },
            expectedPath:
                'md:analytics%3Fmotherduck_token%3Dother%26saas_mode%3Dfalse?motherduck_token=my_motherduck_token&saas_mode=true',
        },
    ])('should $name', async ({ credentials, expectedPath }) => {
        const runMock = vi.fn();
        const streamMock = vi.fn(async () =>
            getMockStreamResult([[{ id: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = new DuckdbWarehouseClient(credentials);

        await client.runQuery('SELECT 1 AS id');

        expect(createInstanceMock).toHaveBeenCalledWith(expectedPath);
        expect(runMock).toHaveBeenCalledWith(
            'SET allow_community_extensions = false;',
        );
        expect(runMock).toHaveBeenCalledWith(
            'SET autoinstall_known_extensions = false;',
        );
        expect(runMock).toHaveBeenCalledWith(
            'SET autoload_known_extensions = false;',
        );
        expect(runMock).toHaveBeenCalledWith(
            'SET allow_unredacted_secrets = false;',
        );
    });

    it('should require a MotherDuck token for direct DuckDB connections', () => {
        expect(
            () =>
                new DuckdbWarehouseClient({
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.MOTHERDUCK,
                    database: 'my_database',
                    schema: 'main',
                    token: '',
                }),
        ).toThrow(
            'MotherDuck token is required for DuckDB warehouse connections',
        );
    });

    it('should expose the configured start of week', () => {
        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'analytics',
            schema: 'main',
            token: 'motherduck_token',
            startOfWeek: WeekDay.SUNDAY,
        });

        expect(client.getStartOfWeek()).toBe(WeekDay.SUNDAY);
    });

    it('should default getFields database to the configured DuckDB database', async () => {
        const runMock = vi.fn(async () => ({
            getRowObjects: async () => [
                {
                    column_name: 'order_id',
                    data_type: 'INTEGER',
                },
                {
                    column_name: 'created_at',
                    data_type: 'TIMESTAMP',
                },
            ],
        }));

        createInstanceMock.mockResolvedValue(
            createMockConnection(vi.fn(), runMock),
        );

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'analytics',
            schema: 'main',
            token: 'motherduck_token',
        });

        const result = await client.getFields('orders');

        expect(runMock).toHaveBeenCalledWith(
            expect.stringContaining("WHERE table_catalog = 'analytics'"),
        );
        expect(result).toEqual({
            analytics: {
                main: {
                    orders: {
                        order_id: DimensionType.NUMBER,
                        created_at: DimensionType.TIMESTAMP,
                    },
                },
            },
        });
    });

    describe('DuckLake bootstrap', () => {
        const captureRunMock = () =>
            vi.fn().mockResolvedValue({
                getRowObjects: async () => [],
            });

        const collectStatements = (runMock: Mock): string[] =>
            runMock.mock.calls.map((c) => c[0] as string);

        it('attaches a postgres-catalog + S3 DuckLake in the correct order', async () => {
            const runMock = captureRunMock();
            const streamMock = vi.fn(async () => getMockStreamResult([[]], []));
            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock),
            );

            const client = new DuckdbWarehouseClient({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                schema: 'main',
                catalogAlias: 'ducklake',
                catalog: {
                    type: DucklakeCatalogType.POSTGRES,
                    host: 'pg.example.com',
                    port: 5432,
                    database: 'catalog',
                    user: 'ducklake_user',
                    password: 'p@ss',
                },
                dataPath: {
                    type: DucklakeDataPathType.S3,
                    url: 's3://my-bucket/path/',
                    accessKeyId: 'AKIAEXAMPLE',
                    secretAccessKey: 'SECRETEXAMPLE',
                    region: 'us-east-1',
                },
            });

            await client.runQuery('SELECT 1');
            const stmts = collectStatements(runMock);
            const joined = stmts.join('\n');

            // No explicit INSTALL/LOAD in DuckLake mode — rely on autoload.
            expect(joined).not.toMatch(/INSTALL httpfs/);
            expect(joined).not.toMatch(/LOAD httpfs/);

            // Hardening flips autoload to TRUE for DuckLake.
            expect(stmts).toEqual(
                expect.arrayContaining([
                    'SET autoinstall_known_extensions = true;',
                    'SET autoload_known_extensions = true;',
                    'SET allow_community_extensions = false;',
                    'SET allow_unredacted_secrets = false;',
                ]),
            );

            const catalogIdx = stmts.findIndex((s) =>
                /__lightdash_ducklake_catalog/.test(s),
            );
            const dataIdx = stmts.findIndex((s) =>
                /__lightdash_ducklake_data/.test(s),
            );
            const duckLakeSecretIdx = stmts.findIndex((s) =>
                /SECRET __lightdash_ducklake\s/.test(s),
            );
            const attachIdx = stmts.findIndex((s) =>
                /^ATTACH 'ducklake:__lightdash_ducklake'/.test(s),
            );

            expect(catalogIdx).toBeGreaterThanOrEqual(0);
            expect(dataIdx).toBeGreaterThan(catalogIdx);
            expect(duckLakeSecretIdx).toBeGreaterThan(dataIdx);
            expect(attachIdx).toBeGreaterThan(duckLakeSecretIdx);

            expect(stmts[catalogIdx]).toMatch(/TYPE postgres/);
            expect(stmts[catalogIdx]).toMatch(/HOST 'pg.example.com'/);
            expect(stmts[catalogIdx]).toMatch(/PASSWORD 'p@ss'/);

            expect(stmts[dataIdx]).toMatch(/TYPE s3/);
            expect(stmts[dataIdx]).toMatch(/KEY_ID 'AKIAEXAMPLE'/);
            expect(stmts[dataIdx]).toMatch(/SCOPE 's3:\/\/my-bucket\/path\/'/);
        });

        it('uses inline ATTACH (no ducklake secret) for SQLite catalog + local data path', async () => {
            const runMock = captureRunMock();
            const streamMock = vi.fn(async () => getMockStreamResult([[]], []));
            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock),
            );

            const client = new DuckdbWarehouseClient({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                schema: 'main',
                catalog: {
                    type: DucklakeCatalogType.SQLITE,
                    path: '/tmp/ducklake.sqlite',
                },
                dataPath: {
                    type: DucklakeDataPathType.LOCAL,
                    path: '/tmp/ducklake-data',
                },
            });

            await client.runQuery('SELECT 1');
            const stmts = collectStatements(runMock);
            const joined = stmts.join('\n');

            expect(joined).not.toMatch(/__lightdash_ducklake_catalog/);
            expect(joined).not.toMatch(/__lightdash_ducklake_data/);
            expect(joined).not.toMatch(/SECRET __lightdash_ducklake\s/);
            expect(
                stmts.some((s) =>
                    /^ATTACH 'ducklake:sqlite:\/tmp\/ducklake\.sqlite' AS "ducklake" \(DATA_PATH '\/tmp\/ducklake-data', READ_ONLY\);/.test(
                        s,
                    ),
                ),
            ).toBe(true);
        });

        it('rejects user SQL that contains ATTACH even in DuckLake mode', async () => {
            const runMock = captureRunMock();
            const streamMock = vi.fn(async () => getMockStreamResult([[]], []));
            const extractStatements = vi.fn(async () => ({
                count: 1,
                prepare: async () => ({
                    statementType: 25, // ATTACH
                    destroySync: vi.fn(),
                }),
            }));
            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements,
                }),
            );

            const client = new DuckdbWarehouseClient({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                schema: 'main',
                catalog: {
                    type: DucklakeCatalogType.SQLITE,
                    path: '/tmp/c.sqlite',
                },
                dataPath: {
                    type: DucklakeDataPathType.LOCAL,
                    path: '/tmp/d',
                },
            });

            await expect(
                client.runQuery("ATTACH 'ducklake:evil' AS bad;"),
            ).rejects.toThrow(/only SELECT statements are allowed/);
        });

        it('keeps autoload disabled for non-DuckLake modes', async () => {
            const runMock = captureRunMock();
            const streamMock = vi.fn(async () => getMockStreamResult([[]], []));
            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock),
            );

            const client = DuckdbWarehouseClient.createForPreAggregate({
                type: 'duckdb_s3',
                s3Config: {
                    endpoint: 'localhost:9000',
                    region: 'us-east-1',
                    forcePathStyle: true,
                    useSsl: false,
                },
            });

            await client.runQuery('SELECT 1');
            const stmts = collectStatements(runMock);

            expect(stmts).toEqual(
                expect.arrayContaining([
                    'SET autoinstall_known_extensions = false;',
                    'SET autoload_known_extensions = false;',
                ]),
            );
            // Regression: existing modes still explicitly INSTALL/LOAD httpfs.
            expect(stmts).toEqual(
                expect.arrayContaining(['INSTALL httpfs;', 'LOAD httpfs;']),
            );
        });
    });
});
