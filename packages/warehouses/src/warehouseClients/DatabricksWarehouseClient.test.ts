import { DimensionType } from '@lightdash/common';
import {
    DatabricksSqlBuilder,
    DatabricksWarehouseClient,
} from './DatabricksWarehouseClient';
import { credentials, rows, schema } from './DatabricksWarehouseClient.mock';
import { expectedFields } from './WarehouseClient.mock';

// Catalog mock rows for testing mapFieldType via getCatalog.
// TYPE_NAME uses the string form returned by Databricks' getColumns API (e.g. "ARRAY<STRING>").
const catalogMockRows = [
    {
        TABLE_CAT: 'database',
        TABLE_SCHEM: 'mySchema',
        TABLE_NAME: 'myTable',
        COLUMN_NAME: 'myArrayColumn',
        DATA_TYPE: 0,
        TYPE_NAME: 'ARRAY<STRING>',
    },
    {
        TABLE_CAT: 'database',
        TABLE_SCHEM: 'mySchema',
        TABLE_NAME: 'myTable',
        COLUMN_NAME: 'myStructColumn',
        DATA_TYPE: 0,
        TYPE_NAME: 'STRUCT<x:STRING,y:INT>',
    },
];

jest.mock('@databricks/sql', () => ({
    ...jest.requireActual('@databricks/sql'),
    DBSQLClient: jest.fn(() => ({
        connect: jest.fn(() => ({
            openSession: jest.fn(() => ({
                executeStatement: jest.fn(() => ({
                    getSchema: jest.fn(async () => schema),
                    fetchChunk: jest.fn(async () => rows),
                    hasMoreRows: jest.fn(async () => false),
                    close: jest.fn(async () => undefined),
                })),
                getColumns: jest.fn(async () => ({
                    fetchAll: jest.fn(async () => catalogMockRows),
                    close: jest.fn(async () => undefined),
                })),
                close: jest.fn(async () => undefined),
            })),
            close: jest.fn(async () => undefined),
        })),
    })),
}));

// Databricks overrides the shared expectedFields: ARRAY maps to DimensionType.ARRAY.
const databricksExpectedFields = {
    ...expectedFields,
    myArrayColumn: { type: DimensionType.ARRAY },
};

describe('DatabricksWarehouseClient', () => {
    it('expect query fields and rows', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(databricksExpectedFields);
        expect(results.rows[0]).toEqual(rows[0]);
    });
});

describe('DatabricksWarehouseClient ARRAY type mapping', () => {
    it('ARRAY_TYPE resolves to DimensionType.ARRAY via convertDataTypeToDimensionType (runQuery)', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');
        expect(results.fields.myArrayColumn).toEqual({
            type: DimensionType.ARRAY,
        });
    });

    it('STRUCT_TYPE still resolves to DimensionType.STRING via convertDataTypeToDimensionType (runQuery)', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);
        const results = await warehouse.runQuery('fake sql');
        expect(results.fields.myObjectColumn).toEqual({
            type: DimensionType.STRING,
        });
    });

    it('ARRAY<...> TYPE_NAME resolves to DimensionType.ARRAY via mapFieldType (getCatalog)', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);
        const catalog = await warehouse.getCatalog([
            { database: 'database', schema: 'mySchema', table: 'myTable' },
        ]);
        expect(catalog.DEFAULT.mySchema.myTable.myArrayColumn).toBe(
            DimensionType.ARRAY,
        );
    });

    it('STRUCT<...> TYPE_NAME still resolves to DimensionType.STRING via mapFieldType (getCatalog)', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);
        const catalog = await warehouse.getCatalog([
            { database: 'database', schema: 'mySchema', table: 'myTable' },
        ]);
        expect(catalog.DEFAULT.mySchema.myTable.myStructColumn).toBe(
            DimensionType.STRING,
        );
    });
});

describe('DatabricksSqlBuilder escaping', () => {
    const databricksSqlBuilder = new DatabricksSqlBuilder();

    test('Should escape backslashes and quotes in Databricks', () => {
        expect(databricksSqlBuilder.escapeString("\\') OR (1=1) --")).toBe(
            "\\\\\\') OR (1=1) ",
        );
    });

    test('Should handle SQL injection attempts', () => {
        // Test with a typical SQL injection pattern
        const maliciousInput = "'; DROP TABLE users; --";
        const escaped = databricksSqlBuilder.escapeString(maliciousInput);
        expect(escaped).toBe("\\'; DROP TABLE users; ");

        // Test with another common SQL injection pattern
        const anotherMaliciousInput = "' OR '1'='1";
        const anotherEscaped = databricksSqlBuilder.escapeString(
            anotherMaliciousInput,
        );
        expect(anotherEscaped).toBe("\\' OR \\'1\\'=\\'1");
    });

    test('Should NOT remove # comments from strings', () => {
        // Test that # symbols are preserved in strings (not treated as comments)
        const stringWithHash = 'Column name with # symbol';
        const escaped = databricksSqlBuilder.escapeString(stringWithHash);
        expect(escaped).toBe('Column name with # symbol');

        // Test that # at start of line is preserved
        const hashAtStart = '#important-tag';
        const escapedHashStart = databricksSqlBuilder.escapeString(hashAtStart);
        expect(escapedHashStart).toBe('#important-tag');

        // Test multiple # symbols are preserved
        const multipleHashes = 'value1#value2#value3';
        const escapedMultiple =
            databricksSqlBuilder.escapeString(multipleHashes);
        expect(escapedMultiple).toBe('value1#value2#value3');
    });

    test('Should still remove -- and /* */ comments', () => {
        // Test that -- comments are still removed
        const stringWithDashComment = 'test value -- this is a comment';
        const escapedDash = databricksSqlBuilder.escapeString(
            stringWithDashComment,
        );
        expect(escapedDash).toBe('test value ');

        // Test that /* */ comments are still removed
        const stringWithBlockComment = 'test /* block comment */ value';
        const escapedBlock = databricksSqlBuilder.escapeString(
            stringWithBlockComment,
        );
        expect(escapedBlock).toBe('test  value');
    });
});
