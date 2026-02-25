import { DimensionType, WarehouseTypes } from '@lightdash/common';
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

const createMockConnection = (
    streamMock: jest.Mock,
    runMock: jest.Mock = jest.fn(),
) => ({
    connect: async () => ({
        run: runMock,
        stream: streamMock,
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

    it('should set timezone and S3 config before streaming', async () => {
        const runMock = jest.fn();
        const streamMock = jest.fn(async () =>
            getMockStreamResult([[{ val: 1 }]], [DUCKDB_TYPE_IDS.INTEGER]),
        );

        createInstanceMock.mockResolvedValue(
            createMockConnection(streamMock, runMock),
        );

        const client = DuckdbWarehouseClient.createForPreAggregate({
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

        const runCalls = runMock.mock.calls.map((call: unknown[]) => call[0]);
        expect(runCalls).toContain('LOAD httpfs;');
        expect(runCalls).toContain("SET s3_endpoint = 'localhost:9000';");
        expect(runCalls).toContain("SET s3_region = 'us-east-1';");
        expect(runCalls).toContain("SET TimeZone = 'UTC';");
        expect(streamMock).toHaveBeenCalledTimes(1);
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
