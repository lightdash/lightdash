import { WarehouseTableType } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { WarehouseAvailableTablesTableName } from '../../database/entities/warehouseAvailableTables';
import { WarehouseAvailableTablesModel } from './WarehouseAvailableTablesModel';

describe('WarehouseAvailableTablesModel listed database scope', () => {
    const baseDatabase = knex({ client: MockClient, dialect: 'pg' });
    const database = new Proxy(baseDatabase, {
        get(target, property, receiver) {
            if (property === 'transaction') {
                return async (
                    callback: (trx: Knex.Transaction) => Promise<unknown>,
                ) => callback(baseDatabase as unknown as Knex.Transaction);
            }
            return Reflect.get(target, property, receiver);
        },
    });
    const model = new WarehouseAvailableTablesModel(database);
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('reads a default project database from named and legacy rows', async () => {
        tracker.on.select('projects').responseOnce([]);

        await model.getTablesForProjectWarehouseCredentials('project-uuid', {
            listedDatabase: 'default',
            includeLegacyRows: true,
        });

        const [query] = tracker.history.select;
        expect(query.sql).toContain(
            '("listed_database" = $2 or "listed_database" is null)',
        );
        expect(query.bindings).toEqual(['project-uuid', 'default']);
    });

    it('reads an additional personal database without legacy rows', async () => {
        tracker.on.select(WarehouseAvailableTablesTableName).responseOnce([]);

        await model.getTablesForUserWarehouseCredentials(
            'user-credentials-uuid',
            {
                listedDatabase: 'finance',
                includeLegacyRows: false,
            },
        );

        const [query] = tracker.history.select;
        expect(query.sql).toContain('"listed_database" = $2');
        expect(query.sql).not.toContain('"listed_database" is null');
        expect(query.bindings).toEqual(['user-credentials-uuid', 'finance']);
    });

    it('replaces named and legacy project rows for the default database', async () => {
        tracker.on
            .select('warehouse_credentials')
            .responseOnce([{ warehouse_credentials_id: 12 }]);
        tracker.on.delete(WarehouseAvailableTablesTableName).responseOnce(2);
        tracker.on.insert(WarehouseAvailableTablesTableName).responseOnce([]);

        await model.createAvailableTablesForProjectWarehouseCredentials(
            'project-uuid',
            [
                {
                    database: 'AwsDataCatalog',
                    schema: 'default',
                    table: 'orders',
                    tableType: WarehouseTableType.TABLE,
                },
            ],
            {
                listedDatabase: 'default',
                includeLegacyRows: true,
            },
        );

        const [deleteQuery] = tracker.history.delete;
        expect(deleteQuery.sql).toContain(
            '("listed_database" = $2 or "listed_database" is null)',
        );
        const [insertQuery] = tracker.history.insert;
        expect(insertQuery.bindings).toContain('default');
    });

    it('clears every personal database during a whole refresh', async () => {
        tracker.on.delete(WarehouseAvailableTablesTableName).responseOnce(3);
        tracker.on.insert(WarehouseAvailableTablesTableName).responseOnce([]);

        await model.createAvailableTablesForUserWarehouseCredentials(
            'user-credentials-uuid',
            [
                {
                    database: 'AwsDataCatalog',
                    schema: 'default',
                    table: 'orders',
                    tableType: WarehouseTableType.TABLE,
                },
            ],
            {
                listedDatabase: 'default',
                includeLegacyRows: true,
                clearAll: true,
            },
        );

        const [deleteQuery] = tracker.history.delete;
        expect(deleteQuery.sql).not.toContain('listed_database');
        expect(deleteQuery.bindings).toEqual(['user-credentials-uuid']);
        const [insertQuery] = tracker.history.insert;
        expect(insertQuery.bindings).toContain('default');
    });
});
