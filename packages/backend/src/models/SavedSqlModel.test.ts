import { ChartKind, type AllVizChartConfig } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    SavedSqlTableName,
    SavedSqlVersionsTableName,
} from '../database/entities/savedSql';
import { SavedSqlModel } from './SavedSqlModel';

describe('SavedSqlModel connection persistence', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const config = { type: ChartKind.TABLE } as AllVizChartConfig;
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('returns the connection stored on the selected version', () => {
        const result = SavedSqlModel.convertSelectSavedSql({
            saved_sql_uuid: 'saved-sql-uuid',
            connection_uuid: 'connection-uuid',
        } as Parameters<(typeof SavedSqlModel)['convertSelectSavedSql']>[0]);

        expect(result.connectionUuid).toBe('connection-uuid');
    });

    test('stores an explicit connection on a new version', async () => {
        tracker.on
            .insert(SavedSqlVersionsTableName)
            .response([{ saved_sql_version_uuid: 'version-uuid' }]);
        tracker.on.update(SavedSqlTableName).response(1);

        await SavedSqlModel.createVersion(database, {
            savedSqlUuid: 'saved-sql-uuid',
            userUuid: 'user-uuid',
            config,
            sql: 'select 1',
            limit: 500,
            connectionUuid: 'connection-uuid',
        });

        expect(tracker.history.insert[0].bindings).toContain('connection-uuid');
        expect(tracker.history.select).toHaveLength(0);
    });

    test('preserves the previous connection when an update omits it', async () => {
        tracker.on
            .select(SavedSqlVersionsTableName)
            .response([{ connection_uuid: 'existing-connection-uuid' }]);
        tracker.on
            .insert(SavedSqlVersionsTableName)
            .response([{ saved_sql_version_uuid: 'version-uuid' }]);
        tracker.on.update(SavedSqlTableName).response(1);

        await SavedSqlModel.createVersion(database, {
            savedSqlUuid: 'saved-sql-uuid',
            userUuid: 'user-uuid',
            config,
            sql: 'select 2',
            limit: 500,
        });

        expect(tracker.history.insert[0].bindings).toContain(
            'existing-connection-uuid',
        );
    });
});
