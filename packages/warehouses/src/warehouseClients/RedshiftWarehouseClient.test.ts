import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
} from '@lightdash/common';
import * as pg from 'pg';
import { Readable } from 'stream';
import { PostgresClient } from './PostgresWarehouseClient';
import { mintRedshiftIamCredentials } from './redshiftIamCredentials';
import { RedshiftWarehouseClient } from './RedshiftWarehouseClient';

vi.mock('./redshiftIamCredentials', () => ({
    mintRedshiftIamCredentials: vi.fn(),
}));

vi.mock('pg', async () => ({
    ...(await vi.importActual<{ default: typeof import('pg') }>('pg')).default,
    Pool: vi.fn(),
}));

const credentials: CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'localhost',
    user: 'analytics',
    password: 'password',
    port: 5439,
    dbname: 'warehouse',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.PASSWORD,
};

const redshiftVersion = {
    rows: [
        { version: 'PostgreSQL 8.0.2 on i686-pc-linux-gnu, Redshift 1.0.77' },
    ],
    fields: {},
};

describe('RedshiftWarehouseClient result cache', () => {
    const cacheStatement = 'SET enable_result_cache_for_session TO off';

    const mockConnection = (
        prepareCache: () => Promise<void> = async () => {},
    ) => {
        const query = vi.fn((statement: unknown) => {
            if (statement === cacheStatement) return prepareCache();
            if (typeof statement === 'string') return Promise.resolve();
            return Readable.from([], { objectMode: true });
        });
        const release = vi.fn();
        const end = vi.fn(async () => {});
        vi.mocked(pg.Pool).mockImplementationOnce(
            class MockPool {
                connect = vi.fn((callback) =>
                    callback(null, { query, on: vi.fn() }, release),
                );

                on = vi.fn();

                end = end;
            } as unknown as typeof pg.Pool,
        );
        return { query, release, end };
    };

    it.each([true, false, undefined])(
        'prepares every query connection for agent job controls %s',
        async (agentJobControls) => {
            const warehouse = new RedshiftWarehouseClient(credentials, {
                agentJobControls,
            });
            await Promise.all(
                ['SELECT 1', 'SELECT 2'].map(async (sql) => {
                    const { query, release, end } = mockConnection();
                    await warehouse.runQuery(sql);
                    expect(
                        query.mock.calls.map(([statement]) => statement),
                    ).toEqual([
                        'SET statement_timeout = 540000',
                        ...(agentJobControls ? [cacheStatement] : []),
                        expect.objectContaining({
                            cursor: expect.objectContaining({ text: sql }),
                        }),
                    ]);
                    expect(release).toHaveBeenCalledOnce();
                    expect(end).toHaveBeenCalledOnce();
                }),
            );
        },
    );

    it('disables the cache before the agent marker and identity probe', async () => {
        vi.mocked(mintRedshiftIamCredentials).mockClear();
        const { query, release, end } = mockConnection();
        const warehouse = new RedshiftWarehouseClient(credentials, {
            agentJobControls: true,
            agentSession: true,
        });
        const sql =
            'SELECT current_user AS principal, session_user AS session_principal';
        await warehouse.runQuery(sql);
        expect(mintRedshiftIamCredentials).not.toHaveBeenCalled();
        expect(query.mock.calls.map(([statement]) => statement)).toEqual([
            'SET statement_timeout = 540000',
            cacheStatement,
            "SELECT set_config('lightdash.agent', 'true', false)",
            expect.objectContaining({
                cursor: expect.objectContaining({ text: sql }),
            }),
        ]);
        expect(release).toHaveBeenCalledOnce();
        expect(end).toHaveBeenCalledOnce();
    });

    it('awaits cache setup before executing the query', async () => {
        const cacheSetup = Promise.withResolvers<void>();
        const cacheStarted = Promise.withResolvers<void>();
        const { query, release } = mockConnection(() => {
            cacheStarted.resolve();
            return cacheSetup.promise;
        });
        const warehouse = new RedshiftWarehouseClient(credentials, {
            agentJobControls: true,
        });
        const result = warehouse.runQuery('SELECT 1');
        await cacheStarted.promise;
        expect(query.mock.calls.map(([statement]) => statement)).toEqual([
            'SET statement_timeout = 540000',
            cacheStatement,
        ]);
        expect(release).not.toHaveBeenCalled();
        cacheSetup.resolve();
        await result;
        expect(query).toHaveBeenLastCalledWith(
            expect.objectContaining({
                cursor: expect.objectContaining({ text: 'SELECT 1' }),
            }),
        );
        expect(release).toHaveBeenCalledOnce();
    });

    it('rejects and releases the connection when cache setup fails', async () => {
        const { query, release, end } = mockConnection(async () => {
            throw new Error('cannot disable result cache');
        });
        const warehouse = new RedshiftWarehouseClient(credentials, {
            agentJobControls: true,
        });
        await expect(warehouse.runQuery('SELECT 1')).rejects.toThrow(
            'cannot disable result cache',
        );
        expect(query.mock.calls.map(([statement]) => statement)).toEqual([
            'SET statement_timeout = 540000',
            cacheStatement,
        ]);
        expect(release).toHaveBeenCalledOnce();
        expect(end).toHaveBeenCalledOnce();
    });
});

describe('RedshiftWarehouseClient', () => {
    it.each([false, true])(
        'preserves the agent application name after IAM credentials refresh: %s',
        async (agentSession) => {
            vi.mocked(mintRedshiftIamCredentials).mockResolvedValue({
                dbUser: 'iam_user',
                dbPassword: 'iam_password',
                expiration: new Date(Date.now() + 60_000),
            });
            const stream = vi
                .spyOn(PostgresClient.prototype, 'streamQuery')
                .mockResolvedValue(undefined);
            try {
                const warehouse = new RedshiftWarehouseClient(
                    {
                        ...credentials,
                        authenticationType: RedshiftAuthenticationType.IAM,
                    },
                    { agentSession },
                );
                await warehouse.streamQuery('select 1', () => {}, {});
                expect(warehouse.config.application_name).toBe(
                    agentSession ? 'lightdash-ai' : undefined,
                );
                expect(stream).toHaveBeenCalledOnce();
            } finally {
                stream.mockRestore();
            }
        },
    );

    it('keeps catalog filters in the Redshift query', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 8.0.2' }],
                fields: {},
            })
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getCatalog([
            { database: 'warehouse', schema: 'public', table: 'orders' },
        ]);

        const catalogQuery = runQuery.mock.calls[1][0];
        expect(catalogQuery).toContain("table_catalog IN ('warehouse')");
        expect(catalogQuery).toContain("table_schema IN ('public')");
        expect(catalogQuery).toContain("table_name IN ('orders')");
        expect(runQuery.mock.calls[1][3]).toBeUndefined();
    });

    it('lists granted tables and views from svv_all_tables scoped to the database', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({
                rows: [
                    {
                        database_name: 'warehouse',
                        schema_name: 'public',
                        table_name: 'orders',
                        table_type: 'TABLE',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'public',
                        table_name: 'orders_lbv',
                        table_type: 'VIEW',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'spectrum',
                        table_name: 'sales',
                        table_type: 'EXTERNAL TABLE',
                    },
                    {
                        database_name: 'warehouse',
                        schema_name: 'shared',
                        table_name: 'customers',
                        table_type: 'SHARED TABLE',
                    },
                ],
                fields: {},
            });

        const tables = await warehouse.getAllTables();

        const [query, , , values] = runQuery.mock.calls[1];
        expect(query).toContain('FROM svv_all_tables');
        expect(query).toContain('database_name = $1');
        expect(query).not.toContain('FROM svv_tables');
        expect(values).toEqual(['warehouse']);
        expect(tables).toEqual([
            {
                database: 'warehouse',
                schema: 'public',
                table: 'orders',
                tableType: 'table',
            },
            {
                database: 'warehouse',
                schema: 'public',
                table: 'orders_lbv',
                tableType: 'view',
            },
            {
                database: 'warehouse',
                schema: 'spectrum',
                table: 'sales',
                tableType: 'external',
            },
            {
                database: 'warehouse',
                schema: 'shared',
                table: 'customers',
                tableType: 'table',
            },
        ]);
    });

    it('reads columns from svv_columns so late-binding views resolve', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({
                rows: [
                    {
                        table_catalog: 'warehouse',
                        table_schema: 'public',
                        table_name: 'orders_lbv',
                        column_name: 'quantity',
                        data_type: 'integer',
                    },
                ],
                fields: {},
            });

        const fields = await warehouse.getFields(
            'orders_lbv',
            'public',
            'warehouse',
        );

        const [query, , , values] = runQuery.mock.calls[1];
        expect(query).toContain('FROM svv_columns c');
        expect(query).toContain('JOIN svv_all_tables');
        expect(query).not.toContain('EXISTS');
        expect(values).toEqual(['orders_lbv', 'public', 'warehouse']);
        expect(fields).toEqual({
            warehouse: {
                public: { orders_lbv: { quantity: 'number' } },
            },
        });
    });

    it('keeps the Postgres catalog when the server is not Redshift', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce({
                rows: [{ version: 'PostgreSQL 15.4' }],
                fields: {},
            })
            .mockResolvedValueOnce({ rows: [], fields: {} })
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getAllTables();
        await warehouse.getFields('orders', 'public');

        expect(runQuery).toHaveBeenCalledTimes(3);
        expect(runQuery.mock.calls[1][0]).toContain(
            'FROM information_schema.tables',
        );
        expect(runQuery.mock.calls[1][0]).not.toContain('svv_');
        expect(runQuery.mock.calls[2][0]).toContain(
            'FROM information_schema.columns',
        );
        expect(runQuery.mock.calls[2][0]).not.toContain('svv_');
    });

    it('keeps the grant-filtered table source', async () => {
        const warehouse = new RedshiftWarehouseClient(credentials);
        const runQuery = vi
            .spyOn(warehouse, 'runQuery')
            .mockResolvedValueOnce(redshiftVersion)
            .mockResolvedValueOnce({ rows: [], fields: {} });

        await warehouse.getAllTables();

        const query = runQuery.mock.calls[1][0];
        expect(query).not.toContain('svv_tables');
        expect(query).not.toContain('FROM information_schema');
        expect(query).toContain(
            "schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_internal')",
        );
    });
});
