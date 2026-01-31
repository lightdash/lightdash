import { DimensionType, MetricType, TimeIntervalUnit } from '@lightdash/common';
import {
    DuckdbSqlBuilder,
    DuckdbWarehouseClient,
    DuckdbTypes,
} from './DuckdbWarehouseClient';
import { columns, credentials } from './DuckdbWarehouseClient.mock';
import {
    config,
    expectedWarehouseSchema,
} from './WarehouseClient.mock';

// Mock duckdb-async module
const mockAll = jest.fn();
const mockRun = jest.fn();
const mockClose = jest.fn();

const mockConnection = {
    all: mockAll,
    run: mockRun,
    close: mockClose,
};

const mockConnect = jest.fn().mockResolvedValue(mockConnection);
const mockDbClose = jest.fn();

jest.mock('duckdb-async', () => ({
    Database: {
        create: jest.fn().mockResolvedValue({
            connect: mockConnect,
            close: mockDbClose,
        }),
    },
    OPEN_READONLY: 1,
}));

describe('DuckdbWarehouseClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('expect query rows with fields', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        const mockRows = [
            {
                myStringColumn: 'test',
                myNumberColumn: 42,
                myBooleanColumn: true,
            },
        ];

        mockAll.mockResolvedValueOnce(mockRows);

        const results = await warehouse.runQuery('SELECT * FROM test');

        expect(results.fields).toEqual({
            myStringColumn: { type: DimensionType.STRING },
            myNumberColumn: { type: DimensionType.NUMBER },
            myBooleanColumn: { type: DimensionType.BOOLEAN },
        });
        expect(results.rows[0]).toEqual(mockRows[0]);
    });

    it('expect empty result handling', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        mockAll.mockResolvedValueOnce([]);

        const results = await warehouse.runQuery('SELECT * FROM empty_table');

        expect(results.fields).toEqual({});
        expect(results.rows).toEqual([]);
    });

    it('expect schema with duckdb types mapped to dimension types', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        // Mock information_schema query
        mockAll.mockResolvedValueOnce(columns);

        const catalog = await warehouse.getCatalog(config);

        expect(catalog).toEqual(expectedWarehouseSchema);
    });

    it('expect empty catalog when dbt project has no references', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);
        expect(await warehouse.getCatalog([])).toEqual({});
    });

    it('expect getAllTables to return table list', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        mockAll.mockResolvedValueOnce([
            {
                table_catalog: 'memory',
                table_schema: 'main',
                table_name: 'users',
            },
            {
                table_catalog: 'memory',
                table_schema: 'main',
                table_name: 'orders',
            },
        ]);

        const tables = await warehouse.getAllTables();

        expect(tables).toEqual([
            { database: 'memory', schema: 'main', table: 'users' },
            { database: 'memory', schema: 'main', table: 'orders' },
        ]);
    });

    it('expect test connection to work', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        mockAll.mockResolvedValueOnce([{ test: 1 }]);

        await expect(warehouse.test()).resolves.not.toThrow();
    });

    it('expect close to release resources', async () => {
        const warehouse = new DuckdbWarehouseClient(credentials);

        // First call to establish connection
        mockAll.mockResolvedValueOnce([{ test: 1 }]);
        await warehouse.test();

        // Close the connection
        await warehouse.close();

        expect(mockClose).toHaveBeenCalled();
        expect(mockDbClose).toHaveBeenCalled();
    });
});

describe('DuckdbSqlBuilder', () => {
    const duckdbSqlBuilder = new DuckdbSqlBuilder();

    describe('escaping', () => {
        test('Should not escape regular characters', () => {
            expect(duckdbSqlBuilder.escapeString('%')).toBe('%');
            expect(duckdbSqlBuilder.escapeString('_')).toBe('_');
            expect(duckdbSqlBuilder.escapeString('?')).toBe('?');
            expect(duckdbSqlBuilder.escapeString('!')).toBe('!');
            expect(duckdbSqlBuilder.escapeString('credit_card')).toBe(
                'credit_card',
            );
        });

        test('Should escape single quotes (PostgreSQL style)', () => {
            expect(duckdbSqlBuilder.escapeString("single'quote")).toBe(
                "single''quote",
            );
        });

        test('Should escape backslashes and quotes', () => {
            expect(duckdbSqlBuilder.escapeString("\\') OR (1=1) --")).toBe(
                "\\\\'') OR (1=1) ",
            );
        });

        test('Should handle SQL injection attempts', () => {
            // Test with a typical SQL injection pattern
            const maliciousInput = "'; DROP TABLE users; --";
            const escaped = duckdbSqlBuilder.escapeString(maliciousInput);
            expect(escaped).toBe("''; DROP TABLE users; ");

            // Test with another common SQL injection pattern
            const anotherMaliciousInput = "' OR '1'='1";
            const anotherEscaped = duckdbSqlBuilder.escapeString(
                anotherMaliciousInput,
            );
            expect(anotherEscaped).toBe("'' OR ''1''=''1");
        });

        test('Should remove SQL comments', () => {
            // Test that -- comments are removed
            const stringWithDashComment = 'test value -- this is a comment';
            const escapedDash = duckdbSqlBuilder.escapeString(
                stringWithDashComment,
            );
            expect(escapedDash).toBe('test value ');

            // Test that /* */ comments are removed
            const stringWithBlockComment = 'test /* block comment */ value';
            const escapedBlock = duckdbSqlBuilder.escapeString(
                stringWithBlockComment,
            );
            expect(escapedBlock).toBe('test  value');
        });
    });

    describe('SQL dialect', () => {
        test('Should use || for string concatenation', () => {
            expect(duckdbSqlBuilder.concatString('a', 'b', 'c')).toBe(
                '(a || b || c)',
            );
        });

        test('Should use TIMESTAMP literal for castToTimestamp', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            expect(duckdbSqlBuilder.castToTimestamp(date)).toBe(
                "TIMESTAMP '2024-01-15T10:30:00.000Z'",
            );
        });

        test('Should use datediff for timestamp difference', () => {
            expect(
                duckdbSqlBuilder.getTimestampDiffSeconds('start_ts', 'end_ts'),
            ).toBe("datediff('second', start_ts, end_ts)");
        });

        test('Should use median function', () => {
            expect(duckdbSqlBuilder.getMedianSql('column_name')).toBe(
                'median(column_name)',
            );
        });

        test('Should use INTERVAL without quotes', () => {
            expect(
                duckdbSqlBuilder.getIntervalSql(5, TimeIntervalUnit.DAY),
            ).toBe('INTERVAL 5 DAY');
            expect(
                duckdbSqlBuilder.getIntervalSql(1, TimeIntervalUnit.HOUR),
            ).toBe('INTERVAL 1 HOUR');
            expect(
                duckdbSqlBuilder.getIntervalSql(30, TimeIntervalUnit.MINUTE),
            ).toBe('INTERVAL 30 MINUTE');
        });

        test('Should use quantile_cont for percentile', () => {
            const metric = {
                type: MetricType.PERCENTILE,
                percentile: 90,
                name: 'test',
                label: 'Test',
                table: 'test',
                tableLabel: 'Test',
                fieldType: 'metric' as const,
                sql: 'column',
                hidden: false,
                isAutoGenerated: false,
            };
            expect(duckdbSqlBuilder.getMetricSql('column', metric)).toBe(
                'quantile_cont(column, 0.9)',
            );
        });

        test('Should use median for median metric', () => {
            const metric = {
                type: MetricType.MEDIAN,
                name: 'test',
                label: 'Test',
                table: 'test',
                tableLabel: 'Test',
                fieldType: 'metric' as const,
                sql: 'column',
                hidden: false,
                isAutoGenerated: false,
            };
            expect(duckdbSqlBuilder.getMetricSql('column', metric)).toBe(
                'median(column)',
            );
        });
    });
});

describe('DuckDB Type Mapping', () => {
    // Test the type mapping by creating a SqlBuilder and checking adapter type
    const sqlBuilder = new DuckdbSqlBuilder();

    test('Should return DUCKDB adapter type', () => {
        expect(sqlBuilder.getAdapterType()).toBe('duckdb');
    });

    test('Should use double quotes for field quoting', () => {
        expect(sqlBuilder.getFieldQuoteChar()).toBe('"');
    });

    test('Should use single quotes for strings', () => {
        expect(sqlBuilder.getStringQuoteChar()).toBe("'");
    });
});
