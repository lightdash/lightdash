/* eslint-disable prefer-arrow-callback, func-names */
import StatusError from '@databricks/sql/dist/errors/StatusError';
import { TStatusCode } from '@databricks/sql/thrift/TCLIService_types';
import {
    DatabricksSqlBuilder,
    DatabricksWarehouseClient,
} from './DatabricksWarehouseClient';
import { credentials, rows, schema } from './DatabricksWarehouseClient.mock';
import { expectedFields } from './WarehouseClient.mock';

const mocks = vi.hoisted(() => ({
    fetchChunk: vi.fn(),
    openSession: vi.fn(),
    closeConnection: vi.fn(),
}));

vi.mock('@databricks/sql', async () => ({
    ...(await vi.importActual<typeof import('@databricks/sql')>(
        '@databricks/sql',
    )),
    DBSQLClient: vi.fn(function () {
        return {
            connect: vi.fn(() => ({
                openSession: mocks.openSession,
                close: mocks.closeConnection,
            })),
        };
    }),
}));

describe('DatabricksWarehouseClient', () => {
    beforeEach(() => {
        mocks.fetchChunk.mockReset().mockResolvedValue(rows);
        mocks.closeConnection.mockReset().mockResolvedValue(undefined);
        mocks.openSession.mockReset().mockResolvedValue({
            executeStatement: vi.fn(() => ({
                getSchema: vi.fn(async () => schema),
                fetchChunk: mocks.fetchChunk,
                hasMoreRows: vi.fn(async () => false),
                close: vi.fn(async () => undefined),
            })),
            close: vi.fn(async () => undefined),
        });
    });

    it('surfaces Databricks status messages when opening a session fails', async () => {
        const message =
            'SQL warehouse xyz is not ready to accept connections (current state: STARTING)';
        mocks.openSession.mockRejectedValueOnce(
            new StatusError({
                statusCode: TStatusCode.ERROR_STATUS,
                errorMessage: message,
            }),
        );
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(warehouse.runQuery('fake sql')).rejects.toMatchObject({
            message,
        });
    });

    it('expect query fields and rows', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);

        const results = await warehouse.runQuery('fake sql');

        expect(results.fields).toEqual(expectedFields);
        expect(results.rows[0]).toEqual(rows[0]);
    });

    it('caps fetchChunk size to avoid materializing whole results', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);

        await warehouse.runQuery('fake sql');

        expect(mocks.fetchChunk).toHaveBeenCalledWith({ maxRows: 5000 });
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
