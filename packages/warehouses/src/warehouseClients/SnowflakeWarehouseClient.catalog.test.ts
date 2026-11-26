import { DimensionType, WarehouseConnectionError } from '@lightdash/common';
import { createConnection, type ConnectionOptions } from 'snowflake-sdk';
import { SnowflakeWarehouseClient } from './SnowflakeWarehouseClient';
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

const summary = (spy: ReturnType<typeof vi.spyOn>) =>
    JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

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

const resetLogin = () => ({
    connect: vi.fn((callback) => callback(new Error('read ECONNRESET'))),
});

describe('SnowflakeWarehouseClient.getCatalog', () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        connections.length = 0;
        infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
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
        ]);

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
        expect(connections[1].execute).toHaveBeenCalledTimes(1);
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
                B: { T3: { ID: DimensionType.NUMBER } },
            },
        });
        expect(summary(infoSpy)).toMatchObject({
            event: 'warehouse.getCatalog',
            requestedTables: 4,
            respondedTables: 4,
            schemas: 2,
            skippedSchemas: 0,
            loginRetries: 0,
        });
    });

    it('retries a login that hits a connection reset', async () => {
        mockConnections((_, index) => (index === 0 ? resetLogin() : {}));
        const catalog = await fetchCatalog([request('A', 'T1')]);

        expect(connections).toHaveLength(2);
        expect(catalog.DB.A.T1).toEqual({ ID: DimensionType.NUMBER });
        expect(summary(infoSpy)).toMatchObject({
            loginRetries: 1,
            skippedSchemas: 0,
        });
    });

    it('skips only the schema whose login keeps resetting', async () => {
        mockConnections((connection) =>
            connection.options.schema === 'BAD' ? resetLogin() : {},
        );
        const catalog = await fetchCatalog([
            request('BAD', 'T1'),
            request('GOOD', 'T2'),
        ]);

        expect(catalog).toMatchObject({
            DB: { GOOD: { T2: { ID: DimensionType.NUMBER } } },
        });
        expect(catalog.DB.BAD).toBeUndefined();
        expect(connections).toHaveLength(4);
        expect(summary(infoSpy)).toMatchObject({
            respondedTables: 1,
            skippedSchemas: 1,
        });
    });

    it('fails when every login is reset, so an empty catalog is never returned', async () => {
        mockConnections(resetLogin);
        await expect(
            fetchCatalog([request('A', 'T1'), request('B', 'T2')]),
        ).rejects.toThrow(WarehouseConnectionError);
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
        expect(summary(infoSpy)).toMatchObject({
            requestedTables: 2,
            respondedTables: 1,
        });
    });
});
