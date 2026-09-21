import { Knex } from 'knex';
import { WarehouseAvailableTablesModel } from './WarehouseAvailableTablesModel';

type QueryBuilder = Record<
    'join' | 'limit' | 'select' | 'where' | 'whereNull',
    ReturnType<typeof vi.fn>
>;

const createQueryBuilder = (): QueryBuilder => {
    const queryBuilder = {} as QueryBuilder;
    queryBuilder.join = vi.fn(() => queryBuilder);
    queryBuilder.where = vi.fn(() => queryBuilder);
    queryBuilder.whereNull = vi.fn(() => queryBuilder);
    queryBuilder.select = vi.fn(() => queryBuilder);
    queryBuilder.limit = vi.fn();
    return queryBuilder;
};

const createModel = (
    queryBuilders: QueryBuilder[],
    hasSupersededAt: boolean,
) => {
    let call = 0;
    const databaseMock = vi.fn(() => {
        const queryBuilder = queryBuilders[call];
        call += 1;
        return queryBuilder;
    });
    const database = databaseMock as unknown as Knex;
    const hasColumn = vi.fn().mockResolvedValue(hasSupersededAt);
    Object.assign(database, {
        schema: { hasColumn },
        transaction: vi.fn(),
    });
    return {
        database,
        databaseMock,
        model: new WarehouseAvailableTablesModel(database),
    };
};

describe('WarehouseAvailableTablesModel', () => {
    describe('getTablesForProjectWarehouseCredentials', () => {
        test('excludes superseded credential rows when the column exists', async () => {
            const query = createQueryBuilder();
            vi.mocked(query.select).mockResolvedValueOnce([
                {
                    database: 'jaffle_shop',
                    schema: 'main',
                    table: 'orders',
                    partition_column: null,
                    table_type: 'table',
                },
            ] as never);
            const { database, model } = createModel([query], true);

            await expect(
                model.getTablesForProjectWarehouseCredentials('project-1'),
            ).resolves.toEqual({
                jaffle_shop: {
                    main: {
                        orders: {
                            partitionColumn: undefined,
                            tableType: 'table',
                        },
                    },
                },
            });

            expect(vi.mocked(database.schema.hasColumn)).toHaveBeenCalledWith(
                'warehouse_credentials',
                'superseded_at',
            );
            expect(vi.mocked(query.whereNull)).toHaveBeenCalledWith(
                'warehouse_credentials.superseded_at',
            );
        });

        test('keeps the legacy read shape before the column exists', async () => {
            const query = createQueryBuilder();
            vi.mocked(query.select).mockResolvedValueOnce([] as never);
            const { model } = createModel([query], false);

            await expect(
                model.getTablesForProjectWarehouseCredentials('project-1'),
            ).resolves.toEqual({});

            expect(vi.mocked(query.whereNull)).not.toHaveBeenCalled();
        });
    });

    describe('createAvailableTablesForProjectWarehouseCredentials', () => {
        test('keeps the legacy credential lookup before the column exists', async () => {
            const connectionQuery = createQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_id: 42 },
            ] as never);
            const { database, model } = createModel([connectionQuery], false);
            const tableQuery = {
                del: vi.fn().mockResolvedValue(undefined),
                where: vi.fn(),
            };
            vi.mocked(tableQuery.where).mockReturnValue(tableQuery);
            vi.mocked(database.transaction).mockImplementation(
                async (callback) => callback(vi.fn(() => tableQuery) as never),
            );

            await model.createAvailableTablesForProjectWarehouseCredentials(
                'project-1',
                [],
            );

            expect(vi.mocked(connectionQuery.whereNull)).not.toHaveBeenCalled();
        });

        test('uses the sole active credential row when superseded rows exist', async () => {
            const connectionQuery = createQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_id: 42 },
            ] as never);
            const { database, model } = createModel([connectionQuery], true);
            const tableQuery = {
                del: vi.fn().mockResolvedValue(undefined),
                where: vi.fn(),
            };
            vi.mocked(tableQuery.where).mockReturnValue(tableQuery);
            vi.mocked(database.transaction).mockImplementation(
                async (callback) => callback(vi.fn(() => tableQuery) as never),
            );

            await model.createAvailableTablesForProjectWarehouseCredentials(
                'project-1',
                [],
            );

            expect(vi.mocked(connectionQuery.whereNull)).toHaveBeenCalledWith(
                'warehouse_credentials.superseded_at',
            );
            expect(vi.mocked(connectionQuery.limit)).toHaveBeenCalledWith(2);
            expect(vi.mocked(tableQuery.where)).toHaveBeenCalledWith(
                'project_warehouse_credentials_id',
                42,
            );
        });

        test('refuses an ambiguous set of active credential rows', async () => {
            const connectionQuery = createQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_id: 42 },
                { warehouse_credentials_id: 43 },
            ] as never);
            const { database, model } = createModel([connectionQuery], true);

            await expect(
                model.createAvailableTablesForProjectWarehouseCredentials(
                    'project-1',
                    [],
                ),
            ).rejects.toThrow('exactly one active warehouse connection');

            expect(vi.mocked(database.transaction)).not.toHaveBeenCalled();
        });
    });
});
