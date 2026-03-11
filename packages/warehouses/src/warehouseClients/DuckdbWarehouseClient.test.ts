import { DimensionType } from '@lightdash/common';
import {
    DuckdbWarehouseClient,
    mapFieldTypeFromTypeId,
    resetSharedDuckdbStateForTesting,
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

const mockDuckdbStatementTypes = {
    SELECT: 1,
    EXPLAIN: 4,
    COPY: 11,
    VARIABLE_SET: 13,
    SET: 20,
    LOAD: 21,
    EXTENSION: 23,
    ATTACH: 25,
    DETACH: 26,
} as const;

jest.mock(
    '@duckdb/node-api',
    () => ({
        StatementType: {
            SELECT: 1,
            EXPLAIN: 4,
            COPY: 11,
            VARIABLE_SET: 13,
            SET: 20,
            LOAD: 21,
            EXTENSION: 23,
            ATTACH: 25,
            DETACH: 26,
        },
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
            statementType:
                overrides?.statementType ?? mockDuckdbStatementTypes.SELECT,
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
        resetSharedDuckdbStateForTesting();
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

        const client = new DuckdbWarehouseClient({
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

        const client = new DuckdbWarehouseClient();
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

        const client = new DuckdbWarehouseClient();
        const result = await client.runQuery('SELECT id FROM empty_table');

        expect(result.rows).toEqual([]);
        expect(result.fields).toEqual({});
    });

    it('should set timezone and S3 config before streaming', async () => {
        const runMock = jest.fn();
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = new DuckdbWarehouseClient({
            s3Config: {
                endpoint: 'localhost:9000',
                region: 'us-east-1',
                accessKey: 'key',
                secretKey: 'secret',
                forcePathStyle: true,
                useSsl: false,
            },
        });
        await client.runQuery('SELECT 1 AS val', undefined, 'UTC');

        const runCalls = runMock.mock.calls.map(
            (call: unknown[]) => call[0] as string,
        );
        expect(runCalls).toContain('INSTALL httpfs;');
        expect(runCalls).toContain('LOAD httpfs;');
        expect(runCalls).toContain('SET enable_http_metadata_cache = true;');
        expect(runCalls).toContain('SET enable_external_file_cache = true;');
        expect(runCalls).toContain('SET parquet_metadata_cache = true;');
        expect(runCalls).toContain(
            "SET disabled_filesystems = 'LocalFileSystem';",
        );
        expect(runCalls).toContain('SET allow_community_extensions = false;');
        expect(runCalls).toContain('SET autoinstall_known_extensions = false;');
        expect(runCalls).toContain('SET autoload_known_extensions = false;');
        expect(runCalls).toContain('SET allow_unredacted_secrets = false;');

        // S3 credentials should use CREATE SECRET, not individual SET commands
        const createSecretCall = runCalls.find((call) =>
            call.includes('CREATE OR REPLACE SECRET'),
        );
        expect(createSecretCall).toBeDefined();
        expect(createSecretCall).toContain("ENDPOINT 'localhost:9000'");
        expect(createSecretCall).toContain("KEY_ID 'key'");
        expect(createSecretCall).toContain("SECRET 'secret'");
        expect(createSecretCall).toContain("REGION 'us-east-1'");
        expect(createSecretCall).toContain("URL_STYLE 'path'");
        expect(createSecretCall).toContain('USE_SSL false');

        // Should NOT use individual SET s3_* commands
        const s3SetCalls = runCalls.filter((call) =>
            call.startsWith('SET s3_'),
        );
        expect(s3SetCalls).toHaveLength(0);

        expect(runCalls).toContain("SET TimeZone = 'UTC';");
        expect(streamMock).toHaveBeenCalledTimes(1);
    });

    describe('SQL security validation', () => {
        it('should reject SET statements', async () => {
            const streamMock = jest.fn(async () =>
                getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
            );

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, jest.fn(), {
                    extractStatements: createMockExtractStatements({
                        statementType: mockDuckdbStatementTypes.SET,
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
                        statementType: mockDuckdbStatementTypes.COPY,
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
                        statementType: mockDuckdbStatementTypes.ATTACH,
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

        it('should allow COPY statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: mockDuckdbStatementTypes.COPY,
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

        it('should keep LocalFileSystem enabled for internal COPY sessions', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: mockDuckdbStatementTypes.COPY,
                    }),
                }),
            );

            const client = new DuckdbWarehouseClient();
            await client.runSql(
                "COPY table TO 's3://bucket/data.parquet' (FORMAT PARQUET)",
            );

            const runCalls = runMock.mock.calls.map(
                (call: unknown[]) => call[0] as string,
            );
            expect(runCalls).not.toContain(
                "SET disabled_filesystems = 'LocalFileSystem';",
            );
        });

        it('should reject SET statements in runSql', async () => {
            const streamMock = jest.fn();
            const runMock = jest.fn();

            createInstanceMock.mockResolvedValue(
                createMockConnection(streamMock, runMock, {
                    extractStatements: createMockExtractStatements({
                        statementType: mockDuckdbStatementTypes.SET,
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
                        statementType: mockDuckdbStatementTypes.ATTACH,
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
                        statementType: mockDuckdbStatementTypes.LOAD,
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
                        statementType: mockDuckdbStatementTypes.EXPLAIN,
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
});
