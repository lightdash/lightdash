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

const invalidSessionError = () =>
    new StatusError({
        statusCode: TStatusCode.ERROR_STATUS,
        errorMessage:
            'Session handle: SessionHandle [session-id] has not been initialized',
    });

type MockFunction = ReturnType<typeof vi.fn>;
type OperationOverrides = Partial<
    Record<
        'getSchema' | 'fetchChunk' | 'fetchAll' | 'hasMoreRows' | 'close',
        MockFunction
    >
>;
type SessionOverrides = Partial<
    Record<'executeStatement' | 'getColumns' | 'close', MockFunction>
>;

const createOperation = (overrides: OperationOverrides = {}) => ({
    getSchema: vi.fn(async () => schema),
    fetchChunk: mocks.fetchChunk,
    fetchAll: vi.fn(async () => []),
    hasMoreRows: vi.fn(async () => false),
    close: vi.fn(async () => undefined),
    ...overrides,
});

const createSession = (overrides: SessionOverrides = {}) => ({
    executeStatement: vi.fn(async () => createOperation()),
    getColumns: vi.fn(async () => createOperation()),
    close: vi.fn(async () => undefined),
    ...overrides,
});

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
        mocks.openSession.mockReset().mockResolvedValue(createSession());
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

    it('reopens the session when it is invalid before rows are streamed', async () => {
        const firstSession = createSession({
            executeStatement: vi.fn(() =>
                Promise.reject(invalidSessionError()),
            ),
        });
        const secondSession = createSession();
        mocks.openSession
            .mockResolvedValueOnce(firstSession)
            .mockResolvedValueOnce(secondSession);
        const warehouse = new DatabricksWarehouseClient(credentials);

        const results = await warehouse.runQuery('fake sql');

        expect(results.rows).toEqual(rows);
        expect(mocks.openSession).toHaveBeenCalledTimes(2);
        expect(firstSession.close).toHaveBeenCalledOnce();
    });

    it('retries when an empty chunk was emitted before session loss', async () => {
        const firstSession = createSession({
            executeStatement: vi.fn(async () =>
                createOperation({
                    fetchChunk: vi.fn(async () => []),
                    hasMoreRows: vi.fn(() =>
                        Promise.reject(invalidSessionError()),
                    ),
                }),
            ),
        });
        mocks.openSession
            .mockResolvedValueOnce(firstSession)
            .mockResolvedValueOnce(createSession());
        const warehouse = new DatabricksWarehouseClient(credentials);

        const results = await warehouse.runQuery('fake sql');

        expect(results.rows).toEqual(rows);
        expect(mocks.openSession).toHaveBeenCalledTimes(2);
    });

    it('stops retrying after three invalid sessions', async () => {
        mocks.openSession.mockResolvedValue(
            createSession({
                executeStatement: vi.fn(() =>
                    Promise.reject(invalidSessionError()),
                ),
            }),
        );
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(warehouse.runQuery('fake sql')).rejects.toMatchObject({
            message:
                'Session handle: SessionHandle [session-id] has not been initialized',
        });
        expect(mocks.openSession).toHaveBeenCalledTimes(3);
    });

    it('does not retry invalid sessions after rows are streamed', async () => {
        const streamCallback = vi.fn();
        const firstSession = createSession({
            executeStatement: vi.fn(async () =>
                createOperation({
                    hasMoreRows: vi.fn(() =>
                        Promise.reject(invalidSessionError()),
                    ),
                }),
            ),
        });
        mocks.openSession.mockResolvedValueOnce(firstSession);
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(
            warehouse.streamQuery('fake sql', streamCallback, {}),
        ).rejects.toMatchObject({
            message:
                'Session handle: SessionHandle [session-id] has not been initialized',
        });

        expect(streamCallback).toHaveBeenCalledOnce();
        expect(mocks.openSession).toHaveBeenCalledOnce();
    });

    it('does not retry other Databricks status errors', async () => {
        const sqlError = new StatusError({
            statusCode: TStatusCode.ERROR_STATUS,
            errorMessage: 'Syntax error near FROM',
        });
        const firstSession = createSession({
            executeStatement: vi.fn(() => Promise.reject(sqlError)),
        });
        mocks.openSession.mockResolvedValueOnce(firstSession);
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(warehouse.runQuery('fake sql')).rejects.toMatchObject({
            message: 'Syntax error near FROM',
        });
        expect(mocks.openSession).toHaveBeenCalledOnce();
    });

    it('bounds session replacements across the entire catalog fetch', async () => {
        const createCatalogSession = (invalidTable: string) =>
            createSession({
                getColumns: vi.fn(
                    (request: { tableName?: string } | undefined) =>
                        request?.tableName === invalidTable
                            ? Promise.reject(invalidSessionError())
                            : Promise.resolve(createOperation()),
                ),
            });
        mocks.openSession
            .mockResolvedValueOnce(createCatalogSession('table_0'))
            .mockResolvedValueOnce(createCatalogSession('table_100'))
            .mockResolvedValueOnce(createCatalogSession('table_200'));
        const warehouse = new DatabricksWarehouseClient(credentials);
        const requests = Array.from({ length: 201 }, (_, index) => ({
            database: 'database',
            schema: 'schema',
            table: `table_${index}`,
        }));

        await expect(warehouse.getCatalog(requests)).rejects.toMatchObject({
            message:
                'Session handle: SessionHandle [session-id] has not been initialized',
        });
        expect(mocks.openSession).toHaveBeenCalledTimes(3);
    });

    it('resumes catalog requests on a replacement session', async () => {
        const tableOneColumns = [
            {
                COLUMN_NAME: 'id',
                TYPE_NAME: 'BIGINT',
            },
        ];
        const tableTwoColumns = [
            {
                COLUMN_NAME: 'name',
                TYPE_NAME: 'STRING',
            },
        ];
        const firstGetColumns = vi
            .fn()
            .mockResolvedValueOnce(
                createOperation({
                    fetchAll: vi.fn(async () => tableOneColumns),
                }),
            )
            .mockRejectedValueOnce(invalidSessionError());
        const secondGetColumns = vi.fn(async () =>
            createOperation({
                fetchAll: vi.fn(async () => tableTwoColumns),
            }),
        );
        mocks.openSession
            .mockResolvedValueOnce(
                createSession({ getColumns: firstGetColumns }),
            )
            .mockResolvedValueOnce(
                createSession({ getColumns: secondGetColumns }),
            );
        const warehouse = new DatabricksWarehouseClient(credentials);

        const catalog = await warehouse.getCatalog([
            { database: 'database', schema: 'schema', table: 'table_one' },
            { database: 'database', schema: 'schema', table: 'table_two' },
        ]);

        expect(catalog.DEFAULT.schema.table_one.id).toBe('number');
        expect(catalog.DEFAULT.schema.table_two.name).toBe('string');
        expect(firstGetColumns).toHaveBeenCalledTimes(2);
        expect(secondGetColumns).toHaveBeenCalledOnce();
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
