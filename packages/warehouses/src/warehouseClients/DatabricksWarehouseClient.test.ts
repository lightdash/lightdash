/* eslint-disable prefer-arrow-callback, func-names */
import StatusError from '@databricks/sql/dist/errors/StatusError';
import { TStatusCode } from '@databricks/sql/thrift/TCLIService_types';
import {
    DimensionType,
    getCatalogNestedColumnShape,
    getCatalogNestedColumnsUnavailableReason,
    getCatalogTimestampDomain,
} from '@lightdash/common';
import {
    DatabricksErrorCondition,
    DatabricksSqlBuilder,
    DatabricksWarehouseClient,
    getDatabricksErrorCondition,
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

        expect(results.fields).toEqual({
            ...expectedFields,
            myNumberColumn: {
                ...expectedFields.myNumberColumn,
                numericKind: { kind: 'integer' },
            },
        });
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
        const describedTable = (sql: string) =>
            /`([^`]+)` AS JSON$/.exec(sql)?.[1] ?? '';
        const jsonDescription = (
            cols: { COLUMN_NAME: string; TYPE_NAME: string }[],
        ) => [
            {
                json_metadata: JSON.stringify({
                    columns: cols.map((col) => ({
                        name: col.COLUMN_NAME,
                        type: { name: col.TYPE_NAME.toLowerCase() },
                    })),
                }),
            },
        ];
        const columnsSession = (
            resolve: (
                table: string,
            ) => { COLUMN_NAME: string; TYPE_NAME: string }[],
            lostTables: Set<string>,
        ) =>
            createSession({
                executeStatement: vi.fn(async (sql: string) => {
                    const table = describedTable(sql);
                    return lostTables.has(table)
                        ? Promise.reject(sessionLostError())
                        : createOperation({
                              fetchAll: vi.fn(async () =>
                                  jsonDescription(resolve(table)),
                              ),
                          });
                }),
            });

        // Captured from DESCRIBE TABLE EXTENDED ... AS JSON on a serverless warehouse.
        const describedTransactions = {
            columns: [
                {
                    name: 'order_id',
                    type: { name: 'string', collation: 'UTF8_BINARY' },
                    nullable: true,
                },
                { name: 'amount', type: { name: 'double' }, nullable: true },
                {
                    name: 'created_at',
                    type: { name: 'timestamp_ltz' },
                    nullable: true,
                },
                {
                    name: 'updated_at',
                    type: { name: 'timestamp_ntz' },
                    nullable: true,
                },
                {
                    name: 'customer',
                    type: {
                        name: 'struct',
                        fields: [
                            {
                                name: 'id',
                                type: { name: 'string' },
                                nullable: true,
                            },
                            {
                                name: 'location',
                                type: { name: 'string' },
                                nullable: true,
                            },
                        ],
                    },
                    nullable: true,
                },
                {
                    name: 'product',
                    type: {
                        name: 'array',
                        element_type: {
                            name: 'struct',
                            fields: [
                                {
                                    name: 'sku',
                                    type: { name: 'string' },
                                    nullable: true,
                                },
                                {
                                    name: 'price',
                                    type: { name: 'double' },
                                    nullable: true,
                                },
                                {
                                    name: 'attributes',
                                    type: {
                                        name: 'struct',
                                        fields: [
                                            {
                                                name: 'colour',
                                                type: { name: 'string' },
                                                nullable: true,
                                            },
                                        ],
                                    },
                                    nullable: true,
                                },
                                {
                                    name: 'variants',
                                    type: {
                                        name: 'array',
                                        element_type: {
                                            name: 'struct',
                                            fields: [
                                                {
                                                    name: 'size',
                                                    type: { name: 'string' },
                                                    nullable: true,
                                                },
                                                {
                                                    name: 'stock',
                                                    type: { name: 'int' },
                                                    nullable: true,
                                                },
                                            ],
                                        },
                                        element_nullable: true,
                                    },
                                    nullable: true,
                                },
                            ],
                        },
                        element_nullable: true,
                    },
                    nullable: true,
                },
                {
                    name: 'tags',
                    type: {
                        name: 'array',
                        element_type: { name: 'string' },
                        element_nullable: true,
                    },
                    nullable: true,
                },
                {
                    name: 'scores',
                    type: { name: 'array', element_type: { name: 'int' } },
                    nullable: true,
                },
                {
                    name: 'matrix',
                    type: {
                        name: 'array',
                        element_type: {
                            name: 'array',
                            element_type: { name: 'int' },
                        },
                    },
                    nullable: true,
                },
                {
                    name: 'labels',
                    type: {
                        name: 'map',
                        key_type: { name: 'string' },
                        value_type: { name: 'string' },
                        value_nullable: true,
                    },
                    nullable: true,
                },
            ],
        };
        const describeSession = (
            describe: (sql: string) => Promise<Record<string, unknown>[]>,
            flatColumns: { COLUMN_NAME: string; TYPE_NAME: string }[] = [],
        ) =>
            createSession({
                executeStatement: vi.fn(async (sql: string) =>
                    createOperation({ fetchAll: vi.fn(() => describe(sql)) }),
                ),
                getColumns: vi.fn(async () =>
                    createOperation({
                        fetchAll: vi.fn(async () => flatColumns),
                    }),
                ),
            });

        it('reads dotted paths and nested shapes from the JSON table description', async () => {
            const session = describeSession(async () => [
                { json_metadata: JSON.stringify(describedTransactions) },
            ]);
            mocks.openSession.mockResolvedValue(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            const catalog = await warehouse.getCatalog([
                tableRequest('transactions'),
            ]);

            const table =
                catalog[credentials.catalog ?? 'DEFAULT'].schema.transactions;
            expect(session.executeStatement).toHaveBeenCalledWith(
                'DESCRIBE TABLE EXTENDED `database`.`schema`.`transactions` AS JSON',
            );
            expect(session.getColumns).not.toHaveBeenCalled();
            expect(table).toEqual({
                order_id: DimensionType.STRING,
                amount: DimensionType.NUMBER,
                created_at: DimensionType.TIMESTAMP,
                updated_at: DimensionType.TIMESTAMP,
                customer: DimensionType.STRING,
                'customer.id': DimensionType.STRING,
                'customer.location': DimensionType.STRING,
                product: DimensionType.STRING,
                'product.sku': DimensionType.STRING,
                'product.price': DimensionType.NUMBER,
                'product.attributes': DimensionType.STRING,
                'product.attributes.colour': DimensionType.STRING,
                'product.variants': DimensionType.STRING,
                'product.variants.size': DimensionType.STRING,
                'product.variants.stock': DimensionType.NUMBER,
                tags: DimensionType.STRING,
                scores: DimensionType.NUMBER,
                matrix: DimensionType.STRING,
                labels: DimensionType.STRING,
            });
            const shape = (path: string) =>
                getCatalogNestedColumnShape(
                    catalog,
                    credentials.catalog ?? 'DEFAULT',
                    'schema',
                    'transactions',
                    path,
                );
            expect(shape('customer')).toEqual({
                repeated: false,
                record: true,
            });
            expect(shape('product')).toEqual({ repeated: true, record: true });
            expect(shape('product.attributes')).toEqual({
                repeated: false,
                record: true,
            });
            expect(shape('product.variants')).toEqual({
                repeated: true,
                record: true,
            });
            expect(shape('tags')).toEqual({ repeated: true, record: false });
            expect(shape('scores')).toEqual({ repeated: true, record: false });
            expect(shape('matrix')).toBeUndefined();
            expect(shape('labels')).toBeUndefined();
            expect(shape('product.sku')).toBeUndefined();
            const domain = (path: string) =>
                getCatalogTimestampDomain(
                    catalog,
                    credentials.catalog ?? 'DEFAULT',
                    'schema',
                    'transactions',
                    path,
                );
            expect(domain('created_at')).toEqual('aware');
            expect(domain('updated_at')).toEqual('naive');
            expect(
                getCatalogNestedColumnsUnavailableReason(
                    catalog,
                    credentials.catalog ?? 'DEFAULT',
                    'schema',
                    'transactions',
                ),
            ).toBeUndefined();
        });

        it('keeps the flat column list and records why when the JSON description is refused', async () => {
            const session = describeSession(
                () =>
                    Promise.reject(
                        statusError(
                            "[PARSE_SYNTAX_ERROR] Syntax error at or near 'JSON'. SQLSTATE: 42601",
                        ),
                    ),
                [
                    { COLUMN_NAME: 'order_id', TYPE_NAME: 'STRING' },
                    {
                        COLUMN_NAME: 'product',
                        TYPE_NAME: 'ARRAY<STRUCT<sku: STRING>>',
                    },
                ],
            );
            mocks.openSession.mockResolvedValue(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            const catalog = await warehouse.getCatalog([
                tableRequest('transactions'),
            ]);

            const database = credentials.catalog ?? 'DEFAULT';
            expect(catalog[database].schema.transactions).toEqual({
                order_id: DimensionType.STRING,
                product: DimensionType.STRING,
            });
            expect(
                getCatalogNestedColumnShape(
                    catalog,
                    database,
                    'schema',
                    'transactions',
                    'product',
                ),
            ).toBeUndefined();
            expect(
                getCatalogNestedColumnsUnavailableReason(
                    catalog,
                    database,
                    'schema',
                    'transactions',
                ),
            ).toEqual(
                "Databricks did not describe transactions as JSON ([PARSE_SYNTAX_ERROR] Syntax error at or near 'JSON'. SQLSTATE: 42601); nested columns need a SQL warehouse or Databricks Runtime 16.2 or newer.",
            );
        });

        it('reports no columns, and no reason, for a table that does not exist', async () => {
            const session = describeSession(() =>
                Promise.reject(
                    statusError(
                        '[TABLE_OR_VIEW_NOT_FOUND] The table or view `database`.`schema`.`missing` cannot be found.',
                    ),
                ),
            );
            mocks.openSession.mockResolvedValue(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            const catalog = await warehouse.getCatalog([
                tableRequest('missing'),
            ]);

            const database = credentials.catalog ?? 'DEFAULT';
            expect(catalog[database].schema.missing).toEqual({});
            expect(session.getColumns).not.toHaveBeenCalled();
            expect(
                getCatalogNestedColumnsUnavailableReason(
                    catalog,
                    database,
                    'schema',
                    'missing',
                ),
            ).toBeUndefined();
        });

        it('fails the fetch on errors that are not the missing JSON form', async () => {
            const session = describeSession(() =>
                Promise.reject(
                    statusError(
                        '[INSUFFICIENT_PERMISSIONS] User does not have USE SCHEMA on Schema `schema`.',
                    ),
                ),
            );
            mocks.openSession.mockResolvedValue(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            await expect(
                warehouse.getCatalog([tableRequest('transactions')]),
            ).rejects.toThrow('INSUFFICIENT_PERMISSIONS');
            expect(session.getColumns).not.toHaveBeenCalled();
        });

        it('fails the fetch when the JSON description cannot be read', async () => {
            const session = describeSession(async () => [
                { json_metadata: 'not json' },
            ]);
            mocks.openSession.mockResolvedValue(session);
            const warehouse = new DatabricksWarehouseClient(credentials);

            await expect(
                warehouse.getCatalog([tableRequest('transactions')]),
            ).rejects.toThrow('Could not read the description of');
            expect(session.getColumns).not.toHaveBeenCalled();
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
            expect(firstSession.executeStatement).toHaveBeenCalledTimes(3);
            expect(firstSession.close).toHaveBeenCalledOnce();
            expect(
                secondSession.executeStatement.mock.calls.map((call) =>
                    describedTable(call[0] as string),
                ),
            ).toEqual(['table_two', 'table_three']);
        });

        it('lets the in-flight batch settle before closing the lost session', async () => {
            const order: string[] = [];
            const firstSession = createSession({
                executeStatement: vi.fn((sql: string) => {
                    const tableName = describedTable(sql);
                    return new Promise((resolve, reject) => {
                        setTimeout(
                            () => {
                                order.push(`describe:${tableName}`);
                                reject(sessionLostError());
                            },
                            tableName === 'table_one' ? 10 : 100,
                        );
                    });
                }),
            });
            firstSession.close.mockImplementation(async () => {
                order.push('close');
            });
            mocks.openSession
                .mockResolvedValueOnce(firstSession)
                .mockResolvedValueOnce(columnsSession(() => [], new Set()));
            const warehouse = new DatabricksWarehouseClient(credentials);

            await withTimers(() =>
                warehouse.getCatalog([
                    tableRequest('table_one'),
                    tableRequest('table_two'),
                ]),
            );

            expect(order).toEqual([
                'describe:table_one',
                'describe:table_two',
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
                executeStatement: vi.fn(async (sql: string) =>
                    describedTable(sql) === 'table_two'
                        ? Promise.reject(
                              statusError('PERMISSION_DENIED on table_two'),
                          )
                        : createOperation({
                              fetchAll: vi.fn(async () => jsonDescription([])),
                          }),
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

describe('getDatabricksErrorCondition', () => {
    // Messages as a serverless SQL warehouse returned them on 2026-09-14.
    test('reads the condition Databricks prefixes to SQL errors', () => {
        expect(
            getDatabricksErrorCondition(
                statusError(
                    '[TABLE_OR_VIEW_NOT_FOUND] The table or view `lightdash_staging`.`nested`.`odd_names` cannot be found. Verify the spelling and correctness of the schema and catalog. SQLSTATE: 42P01; line 1 pos 24',
                ),
            ),
        ).toBe(DatabricksErrorCondition.TableOrViewNotFound);
        expect(
            getDatabricksErrorCondition(
                statusError(
                    "[PARSE_SYNTAX_ERROR] Syntax error at or near 'JSON'. SQLSTATE: 42601 (line 1, pos 37)",
                ),
            ),
        ).toBe(DatabricksErrorCondition.ParseSyntaxError);
    });

    test('ignores conditions we do not handle and messages without a prefix', () => {
        expect(
            getDatabricksErrorCondition(
                statusError(
                    '[INSUFFICIENT_PERMISSIONS] User does not have USE SCHEMA on Schema `schema`.',
                ),
            ),
        ).toBeUndefined();
        expect(
            getDatabricksErrorCondition(
                statusError(
                    'Query could not be scheduled: TEMPORARILY_UNAVAILABLE',
                ),
            ),
        ).toBeUndefined();
        expect(
            getDatabricksErrorCondition(
                new Error('mentions TABLE_OR_VIEW_NOT_FOUND mid-sentence'),
            ),
        ).toBeUndefined();
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

describe('DatabricksWarehouseClient getAllTables', () => {
    it('lists every relation type in Unity Catalog, not only managed tables', async () => {
        const warehouse = new DatabricksWarehouseClient(credentials);
        const runQuery = vi.spyOn(warehouse, 'runQuery').mockResolvedValueOnce({
            rows: [
                {
                    table_catalog: 'main',
                    table_schema: 'analytics',
                    table_name: 'orders_view',
                    table_type: 'MATERIALIZED_VIEW',
                },
            ],
            fields: {},
        });

        const tables = await warehouse.getAllTables();

        const [query] = runQuery.mock.calls[0];
        expect(query).not.toContain('table_type =');
        expect(query).toContain("table_schema <> 'information_schema'");
        expect(tables).toEqual([
            {
                database: 'main',
                schema: 'analytics',
                table: 'orders_view',
                tableType: 'materialized_view',
            },
        ]);
    });
});
