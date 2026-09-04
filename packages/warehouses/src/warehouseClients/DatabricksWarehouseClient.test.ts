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

const statusError = (errorMessage: string) =>
    new StatusError({ statusCode: TStatusCode.ERROR_STATUS, errorMessage });
const sessionLostError = () =>
    statusError(
        'requirement failed: Session handle: SessionHandle [01f19fd1-ac81-1e09-bb7c-357018ed26f1] has not been initialized or had already closed.',
    );
const sessionLostMessage = sessionLostError().message;

type MockFn = ReturnType<typeof vi.fn>;
type OperationOverrides = Partial<
    Record<'getSchema' | 'fetchChunk' | 'fetchAll' | 'hasMoreRows', MockFn>
>;
type SessionOverrides = Partial<
    Record<'executeStatement' | 'getColumns', MockFn>
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

// Retries sleep with real backoff; drive the timers while the promise settles.
const withTimers = async <T>(run: () => Promise<T>): Promise<T> => {
    const settled = run().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
    );
    await vi.runAllTimersAsync();
    const result = await settled;
    if (result.ok) return result.value;
    throw result.error;
};

const tableRequest = (table: string) => ({
    database: 'database',
    schema: 'schema',
    table,
});

describe('DatabricksWarehouseClient', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        mocks.fetchChunk.mockReset().mockResolvedValue(rows);
        mocks.closeConnection.mockReset().mockResolvedValue(undefined);
        mocks.openSession.mockReset().mockResolvedValue(createSession());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('surfaces Databricks status messages when opening a session fails', async () => {
        const message =
            'PERMISSION_DENIED: User does not have USE CATALOG on Catalog';
        mocks.openSession.mockRejectedValueOnce(statusError(message));
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(warehouse.runQuery('fake sql')).rejects.toMatchObject({
            message,
        });
        expect(mocks.openSession).toHaveBeenCalledOnce();
    });

    it('retries opening a session while the warehouse is starting, then surfaces the error', async () => {
        const message =
            'SQL warehouse xyz is not ready to accept connections (current state: STARTING)';
        mocks.openSession.mockRejectedValue(statusError(message));
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(
            withTimers(() => warehouse.runQuery('fake sql')),
        ).rejects.toMatchObject({ message });
        // 2+4+8+16 then 30s waits fit 23 retries in the 10 minute deadline
        expect(mocks.openSession).toHaveBeenCalledTimes(24);
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

    describe('session lost before rows are streamed', () => {
        it('reopens the session and re-runs the query', async () => {
            const firstSession = createSession({
                executeStatement: vi.fn(() =>
                    Promise.reject(sessionLostError()),
                ),
            });
            mocks.openSession
                .mockResolvedValueOnce(firstSession)
                .mockResolvedValueOnce(createSession());
            const warehouse = new DatabricksWarehouseClient(credentials);

            const results = await withTimers(() =>
                warehouse.runQuery('fake sql'),
            );

            expect(results.rows).toEqual(rows);
            expect(mocks.openSession).toHaveBeenCalledTimes(2);
            expect(firstSession.close).toHaveBeenCalledOnce();
        });

        it('re-runs the query when only an empty chunk was emitted', async () => {
            mocks.openSession
                .mockResolvedValueOnce(
                    createSession({
                        executeStatement: vi.fn(async () =>
                            createOperation({
                                fetchChunk: vi.fn(async () => []),
                                hasMoreRows: vi.fn(() =>
                                    Promise.reject(sessionLostError()),
                                ),
                            }),
                        ),
                    }),
                )
                .mockResolvedValueOnce(createSession());
            const warehouse = new DatabricksWarehouseClient(credentials);

            const results = await withTimers(() =>
                warehouse.runQuery('fake sql'),
            );

            expect(results.rows).toEqual(rows);
            expect(mocks.openSession).toHaveBeenCalledTimes(2);
        });

        it('gives up once the retry budget is spent', async () => {
            mocks.openSession.mockResolvedValue(
                createSession({
                    executeStatement: vi.fn(() =>
                        Promise.reject(sessionLostError()),
                    ),
                }),
            );
            const warehouse = new DatabricksWarehouseClient(credentials);

            await expect(
                withTimers(() => warehouse.runQuery('fake sql')),
            ).rejects.toMatchObject({ message: sessionLostMessage });
            expect(mocks.openSession).toHaveBeenCalledTimes(24);
        });
    });

    it('does not re-run the query once rows have been streamed', async () => {
        const streamCallback = vi.fn();
        mocks.openSession.mockResolvedValueOnce(
            createSession({
                executeStatement: vi.fn(async () =>
                    createOperation({
                        hasMoreRows: vi.fn(() =>
                            Promise.reject(sessionLostError()),
                        ),
                    }),
                ),
            }),
        );
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(
            withTimers(() =>
                warehouse.streamQuery('fake sql', streamCallback, {}),
            ),
        ).rejects.toMatchObject({ message: sessionLostMessage });
        expect(streamCallback).toHaveBeenCalledOnce();
        expect(mocks.openSession).toHaveBeenCalledOnce();
    });

    it('does not retry SQL errors', async () => {
        mocks.openSession.mockResolvedValueOnce(
            createSession({
                executeStatement: vi.fn(() =>
                    Promise.reject(statusError('Syntax error near FROM')),
                ),
            }),
        );
        const warehouse = new DatabricksWarehouseClient(credentials);

        await expect(
            withTimers(() => warehouse.runQuery('fake sql')),
        ).rejects.toMatchObject({ message: 'Syntax error near FROM' });
        expect(mocks.openSession).toHaveBeenCalledOnce();
    });

    describe('getCatalog', () => {
        const columns = (name: string, type: string) => [
            { COLUMN_NAME: name, TYPE_NAME: type },
        ];
        const columnsSession = (
            resolve: (
                table: string,
            ) => { COLUMN_NAME: string; TYPE_NAME: string }[],
            lostTables: Set<string>,
        ) =>
            createSession({
                getColumns: vi.fn(
                    async ({ tableName }: { tableName: string }) =>
                        lostTables.has(tableName)
                            ? Promise.reject(sessionLostError())
                            : createOperation({
                                  fetchAll: vi.fn(async () =>
                                      resolve(tableName),
                                  ),
                              }),
                ),
            });

        it('resumes the remaining tables on a replacement session', async () => {
            const firstSession = columnsSession(
                () => columns('id', 'BIGINT'),
                new Set(['table_two', 'table_three']),
            );
            const secondSession = columnsSession(
                () => columns('name', 'STRING'),
                new Set(),
            );
            mocks.openSession
                .mockResolvedValueOnce(firstSession)
                .mockResolvedValueOnce(secondSession);
            const warehouse = new DatabricksWarehouseClient(credentials);

            const catalog = await withTimers(() =>
                warehouse.getCatalog([
                    tableRequest('table_one'),
                    tableRequest('table_two'),
                    tableRequest('table_three'),
                ]),
            );

            expect(catalog.DEFAULT.schema).toEqual({
                table_one: { id: 'number' },
                table_two: { name: 'string' },
                table_three: { name: 'string' },
            });
            expect(firstSession.getColumns).toHaveBeenCalledTimes(3);
            expect(firstSession.close).toHaveBeenCalledOnce();
            expect(
                secondSession.getColumns.mock.calls.map(
                    (call) => (call[0] as { tableName: string }).tableName,
                ),
            ).toEqual(['table_two', 'table_three']);
        });

        it('lets the in-flight batch settle before closing the lost session', async () => {
            const order: string[] = [];
            const firstSession = createSession({
                getColumns: vi.fn(
                    ({ tableName }: { tableName: string }) =>
                        new Promise((resolve, reject) => {
                            setTimeout(
                                () => {
                                    order.push(`getColumns:${tableName}`);
                                    reject(sessionLostError());
                                },
                                tableName === 'table_one' ? 10 : 100,
                            );
                        }),
                ),
            });
            firstSession.close.mockImplementation(async () => {
                order.push('close');
            });
            mocks.openSession
                .mockResolvedValueOnce(firstSession)
                .mockResolvedValueOnce(createSession());
            const warehouse = new DatabricksWarehouseClient(credentials);

            await withTimers(() =>
                warehouse.getCatalog([
                    tableRequest('table_one'),
                    tableRequest('table_two'),
                ]),
            );

            expect(order).toEqual([
                'getColumns:table_one',
                'getColumns:table_two',
                'close',
            ]);
        });

        it('shares one retry budget across the whole fetch', async () => {
            mocks.openSession.mockResolvedValue(
                columnsSession(() => [], new Set(['table_one'])),
            );
            const warehouse = new DatabricksWarehouseClient(credentials);

            await expect(
                withTimers(() =>
                    warehouse.getCatalog([tableRequest('table_one')]),
                ),
            ).rejects.toMatchObject({ message: sessionLostMessage });
            expect(mocks.openSession).toHaveBeenCalledTimes(24);
        });

        it('fails fast on errors that are not warehouse startup errors', async () => {
            const session = createSession({
                getColumns: vi.fn(
                    async ({ tableName }: { tableName: string }) =>
                        tableName === 'table_two'
                            ? Promise.reject(
                                  statusError('PERMISSION_DENIED on table_two'),
                              )
                            : createOperation(),
                ),
            });
            mocks.openSession.mockResolvedValueOnce(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            await expect(
                withTimers(() =>
                    warehouse.getCatalog([
                        tableRequest('table_one'),
                        tableRequest('table_two'),
                    ]),
                ),
            ).rejects.toMatchObject({
                message: 'PERMISSION_DENIED on table_two',
            });
            expect(mocks.openSession).toHaveBeenCalledOnce();
            expect(session.close).toHaveBeenCalledOnce();
        });
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
