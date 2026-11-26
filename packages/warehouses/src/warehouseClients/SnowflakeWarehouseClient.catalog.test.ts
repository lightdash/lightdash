import { DimensionType, WarehouseConnectionError } from '@lightdash/common';
import { createConnection, type ConnectionOptions } from 'snowflake-sdk';
import {
    getTransientNetworkErrorCode,
    SnowflakeWarehouseClient,
} from './SnowflakeWarehouseClient';
import { credentials } from './SnowflakeWarehouseClient.mock';

vi.mock('snowflake-sdk', async () => ({
    ...(
        await vi.importActual<{ default: typeof import('snowflake-sdk') }>(
            'snowflake-sdk',
        )
    ).default,
    configure: vi.fn(),
    createConnection: vi.fn(),
}));

type ExecuteArgs = {
    sqlText: string;
    complete: (error?: Error, statement?: unknown, rows?: unknown[]) => void;
};

type MockConnection = {
    options: ConnectionOptions;
    connect: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    isUp: ReturnType<typeof vi.fn>;
};

const tableFromSql = (sqlText: string) =>
    sqlText.replace('SHOW COLUMNS IN TABLE ', '');

const columnRows = (options: ConnectionOptions, table: string) => [
    {
        kind: 'COLUMN',
        database_name: options.database,
        schema_name: options.schema,
        table_name: table,
        column_name: 'ID',
        data_type: JSON.stringify({ type: 'FIXED', scale: 0 }),
    },
];

const succeed = (
    options: ConnectionOptions,
    { sqlText, complete }: ExecuteArgs,
) =>
    complete(
        undefined,
        { getColumns: () => [] },
        columnRows(options, tableFromSql(sqlText)),
    );

const connections: MockConnection[] = [];

// Each created connection can be customised by its creation index.
const mockConnections = (
    customise: (
        connection: MockConnection,
        index: number,
    ) => Partial<MockConnection> = () => ({}),
) => {
    vi.mocked(createConnection).mockImplementation(((
        options: ConnectionOptions,
    ) => {
        const connection: MockConnection = {
            options,
            connect: vi.fn((callback) => callback(null, {})),
            execute: vi.fn((args: ExecuteArgs) => succeed(options, args)),
            destroy: vi.fn((callback) => callback(null, {})),
            isUp: vi.fn(() => true),
        };
        Object.assign(connection, customise(connection, connections.length));
        connections.push(connection);
        return connection;
    }) as unknown as typeof createConnection);
};

const request = (schema: string, table: string) => ({
    database: 'DB',
    schema,
    table,
});

const catalogEvents = (
    spy: ReturnType<typeof vi.spyOn>,
    event: string,
): Record<string, unknown>[] =>
    spy.mock.calls
        .map(([line]: unknown[]) => {
            try {
                return JSON.parse(String(line)) as Record<string, unknown>;
            } catch {
                return {};
            }
        })
        .filter((payload: Record<string, unknown>) => payload.event === event);

// Runs the fetch while flushing retry backoff timers.
const fetchCatalog = async (
    config: ReturnType<typeof request>[],
): Promise<Awaited<ReturnType<SnowflakeWarehouseClient['getCatalog']>>> => {
    const promise = new SnowflakeWarehouseClient(credentials).getCatalog(
        config,
    );
    promise.catch(() => undefined);
    await vi.runAllTimersAsync();
    return promise;
};

describe('SnowflakeWarehouseClient.getCatalog', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        connections.length = 0;
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.mocked(createConnection).mockReset();
    });

    it('opens one connection per schema and reuses it for every table', async () => {
        mockConnections();
        const catalog = await fetchCatalog([
            request('A', 'T1'),
            request('A', 'T2'),
            request('B', 'T3'),
            request('A', 'T4'),
            request('B', 'T5'),
        ]);

        expect(connections).toHaveLength(2);
        expect(
            connections.map(({ options }) => [
                options.database,
                options.schema,
            ]),
        ).toEqual([
            ['DB', 'A'],
            ['DB', 'B'],
        ]);
        expect(connections[0].execute).toHaveBeenCalledTimes(3);
        expect(connections[1].execute).toHaveBeenCalledTimes(2);
        connections.forEach((connection) =>
            expect(connection.destroy).toHaveBeenCalledOnce(),
        );
        expect(catalog).toMatchObject({
            DB: {
                A: {
                    T1: { ID: DimensionType.NUMBER },
                    T2: { ID: DimensionType.NUMBER },
                    T4: { ID: DimensionType.NUMBER },
                },
                B: {
                    T3: { ID: DimensionType.NUMBER },
                    T5: { ID: DimensionType.NUMBER },
                },
            },
        });
        expect(catalogEvents(infoSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'success',
                warehouse: 'snowflake',
                requestedTables: 5,
                schemas: 2,
                respondedTables: 5,
                connectionsOpened: 2,
                connectionRetries: 0,
                queryRetries: 0,
                failedTables: 0,
                skippedSchemas: 0,
                transientErrors: {},
            }),
        ]);
    });

    it('limits concurrent statements per connection', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        mockConnections((connection) => ({
            execute: vi.fn((args: ExecuteArgs) => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                setTimeout(() => {
                    inFlight -= 1;
                    succeed(connection.options, args);
                }, 10);
            }),
        }));
        const catalog = await fetchCatalog(
            Array.from({ length: 40 }, (_, i) => request('A', `T${i}`)),
        );
        expect(Object.keys(catalog.DB.A)).toHaveLength(40);
        expect(connections).toHaveLength(1);
        expect(maxInFlight).toBe(8);
    });

    it('retries a login that hits a connection reset', async () => {
        mockConnections((_, index) =>
            index === 0
                ? {
                      connect: vi.fn((callback) =>
                          callback(new Error('read ECONNRESET')),
                      ),
                  }
                : {},
        );
        const catalog = await fetchCatalog([request('A', 'T1')]);

        expect(connections).toHaveLength(2);
        expect(catalog.DB.A.T1).toEqual({ ID: DimensionType.NUMBER });
        expect(
            catalogEvents(warnSpy, 'warehouse.getCatalog.connectionRetry'),
        ).toEqual([
            expect.objectContaining({
                database: 'DB',
                schema: 'A',
                attempt: 1,
                errorCode: 'ECONNRESET',
            }),
        ]);
        expect(catalogEvents(infoSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'success',
                connectionAttempts: 2,
                connectionsOpened: 1,
                connectionRetries: 1,
                transientErrors: { ECONNRESET: 1 },
            }),
        ]);
    });

    it('skips only the schema whose login keeps resetting', async () => {
        mockConnections((connection) =>
            connection.options.schema === 'BAD'
                ? {
                      connect: vi.fn((callback) =>
                          callback(new Error('read ECONNRESET')),
                      ),
                  }
                : {},
        );
        const catalog = await fetchCatalog([
            request('BAD', 'T1'),
            request('BAD', 'T2'),
            request('GOOD', 'T3'),
        ]);

        expect(catalog).toMatchObject({
            DB: { GOOD: { T3: { ID: DimensionType.NUMBER } } },
        });
        expect(catalog.DB.BAD).toBeUndefined();
        expect(
            catalogEvents(errorSpy, 'warehouse.getCatalog.schemaSkipped'),
        ).toEqual([
            expect.objectContaining({
                schema: 'BAD',
                tables: 2,
                errorCode: 'ECONNRESET',
            }),
        ]);
        expect(catalogEvents(warnSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'partial',
                respondedTables: 1,
                skippedSchemas: 1,
                skippedTables: 2,
                connectionAttempts: 4,
                transientErrors: { ECONNRESET: 3 },
            }),
        ]);
    });

    it('fails when every login is reset, so an empty catalog is never returned', async () => {
        mockConnections(() => ({
            connect: vi.fn((callback) =>
                callback(new Error('read ECONNRESET')),
            ),
        }));
        await expect(
            fetchCatalog([request('A', 'T1'), request('B', 'T2')]),
        ).rejects.toThrow(WarehouseConnectionError);
        expect(catalogEvents(errorSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'failed',
                skippedSchemas: 2,
                errorCode: 'ECONNRESET',
            }),
        ]);
    });

    it('fails without retrying on a non-network login error', async () => {
        mockConnections(() => ({
            connect: vi.fn((callback) =>
                callback(
                    new Error('Incorrect username or password was specified.'),
                ),
            ),
        }));
        await expect(fetchCatalog([request('A', 'T1')])).rejects.toThrow(
            'Incorrect username or password',
        );
        expect(connections).toHaveLength(1);
        expect(catalogEvents(errorSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({ status: 'failed', errorCode: null }),
        ]);
    });

    it('retries a statement that hits a connection reset on the same connection', async () => {
        let calls = 0;
        mockConnections((connection) => ({
            execute: vi.fn((args: ExecuteArgs) => {
                calls += 1;
                if (calls === 1) {
                    args.complete(new Error('read ECONNRESET'));
                    return;
                }
                succeed(connection.options, args);
            }),
        }));
        const catalog = await fetchCatalog([request('A', 'T1')]);

        expect(connections).toHaveLength(1);
        expect(catalog.DB.A.T1).toEqual({ ID: DimensionType.NUMBER });
        expect(catalogEvents(infoSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'success',
                queryRetries: 1,
                reconnects: 0,
                transientErrors: { ECONNRESET: 1 },
            }),
        ]);
    });

    it('reconnects once when the shared connection goes down mid-fetch', async () => {
        mockConnections((connection, index) =>
            index === 0
                ? {
                      execute: vi.fn((args: ExecuteArgs) =>
                          args.complete(new Error('socket hang up')),
                      ),
                      isUp: vi.fn(() => false),
                  }
                : {},
        );
        const catalog = await fetchCatalog([
            request('A', 'T1'),
            request('A', 'T2'),
            request('A', 'T3'),
        ]);

        expect(connections).toHaveLength(2);
        expect(connections[0].destroy).toHaveBeenCalledOnce();
        expect(connections[1].destroy).toHaveBeenCalledOnce();
        expect(Object.keys(catalog.DB.A).sort()).toEqual(['T1', 'T2', 'T3']);
        expect(catalogEvents(infoSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'success',
                reconnects: 1,
                queryRetries: 3,
                connectionsOpened: 2,
            }),
        ]);
    });

    it('skips only the table whose query fails', async () => {
        mockConnections((connection) => ({
            execute: vi.fn((args: ExecuteArgs) => {
                if (tableFromSql(args.sqlText) === 'GONE') {
                    args.complete(new Error('Object does not exist'));
                    return;
                }
                succeed(connection.options, args);
            }),
        }));
        const catalog = await fetchCatalog([
            request('A', 'T1'),
            request('A', 'GONE'),
        ]);

        expect(Object.keys(catalog.DB.A)).toEqual(['T1']);
        expect(connections[0].execute).toHaveBeenCalledTimes(2);
        expect(
            catalogEvents(errorSpy, 'warehouse.getCatalog.tableFailed'),
        ).toEqual([
            expect.objectContaining({
                schema: 'A',
                table: 'GONE',
                attempts: 1,
                errorCode: null,
            }),
        ]);
        expect(catalogEvents(warnSpy, 'warehouse.getCatalog')).toEqual([
            expect.objectContaining({
                status: 'partial',
                failedTables: 1,
                failedTableSamples: ['DB.A.GONE: Object does not exist'],
            }),
        ]);
    });

    it('logs progress during a long fetch', async () => {
        mockConnections((connection) => ({
            execute: vi.fn((args: ExecuteArgs) => {
                setTimeout(() => succeed(connection.options, args), 20_000);
            }),
        }));
        await fetchCatalog(
            Array.from({ length: 24 }, (_, i) => request('A', `T${i}`)),
        );
        expect(catalogEvents(infoSpy, 'warehouse.getCatalog.progress')).toEqual(
            [
                expect.objectContaining({
                    requestedTables: 24,
                    completedTables: 9,
                    elapsedMs: 40_000,
                }),
            ],
        );
    });
});

describe('getTransientNetworkErrorCode', () => {
    it.each([
        [new Error('read ECONNRESET'), 'ECONNRESET'],
        [
            new WarehouseConnectionError('Snowflake error: read ECONNRESET'),
            'ECONNRESET',
        ],
        [new Error('connect ETIMEDOUT 10.0.0.1:443'), 'ETIMEDOUT'],
        [new Error('socket hang up'), 'SOCKET_HANG_UP'],
        [
            new Error('Network error. Could not reach Snowflake.'),
            'NETWORK_ERROR',
        ],
        [new Error('wrapped', { cause: new Error('write EPIPE') }), 'EPIPE'],
        [new Error('Incorrect username or password was specified.'), null],
        [new Error('SQL compilation error: Object does not exist'), null],
    ])('classifies %s as %s', (error, expected) => {
        expect(getTransientNetworkErrorCode(error)).toBe(expected);
    });
});
