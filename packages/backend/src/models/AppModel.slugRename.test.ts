import { AnyType } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { AppsTableName } from '../database/entities/apps';
import { AppSlugMappingsTableName } from '../database/entities/appSlugMappings';
import { AppModel } from './AppModel';

describe('renameSlug', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AppModel({
        database,
    });
    const projectUuid = '22222222-2222-4222-8222-222222222222';
    const appUuid = '11111111-1111-4111-8111-111111111111';
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        tracker.on.select('pg_advisory_xact_lock').response({});
        vi.spyOn(database, 'transaction').mockImplementation(((
            callback: AnyType,
        ) => callback(database)) as AnyType);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        tracker.reset();
    });

    test('renames the canonical slug and records the previous slug as an alias', async () => {
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.select(AppsTableName).responseOnce([{ slug: 'old-sales' }]);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.select(AppSlugMappingsTableName).responseOnce([]);
        tracker.on
            .insert(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid }]);
        tracker.on.update(AppsTableName).responseOnce(1);

        await model.renameSlug({
            projectUuid,
            appUuid,
            from: 'old-sales',
            to: 'new-sales',
        });

        const aliasInsert = tracker.history.insert.find((query) =>
            query.sql.includes(AppSlugMappingsTableName),
        );
        expect(aliasInsert?.bindings).toEqual(
            expect.arrayContaining([projectUuid, appUuid, 'old-sales']),
        );
        const [appUpdate] = tracker.history.update;
        expect(appUpdate.bindings).toEqual(
            expect.arrayContaining([
                'new-sales',
                projectUuid,
                appUuid,
                'old-sales',
            ]),
        );
    });

    test('uses a supplied transaction without starting a nested transaction', async () => {
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.select(AppsTableName).responseOnce([{ slug: 'old-sales' }]);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on.select(AppSlugMappingsTableName).responseOnce([]);
        tracker.on
            .insert(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid }]);
        tracker.on.update(AppsTableName).responseOnce(1);

        await model.renameSlug(
            {
                projectUuid,
                appUuid,
                from: 'old-sales',
                to: 'new-sales',
            },
            database as unknown as Knex.Transaction,
        );

        expect(database.transaction).not.toHaveBeenCalled();
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.update).toHaveLength(1);
    });

    test('treats an alias-to-current replay as idempotent', async () => {
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on
            .select(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.select(AppsTableName).responseOnce([{ slug: 'new-sales' }]);

        await model.renameSlug({
            projectUuid,
            appUuid,
            from: 'old-sales',
            to: 'new-sales',
        });

        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    test('rejects a target slug owned by another app before writing', async () => {
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.select(AppsTableName).responseOnce([{ slug: 'old-sales' }]);
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ app_id: 'another-app-uuid', deleted_at: null }]);

        await expect(
            model.renameSlug({
                projectUuid,
                appUuid,
                from: 'old-sales',
                to: 'existing-sales',
            }),
        ).rejects.toThrow(
            'Data app slug "existing-sales" is already in use in this project',
        );

        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    test('rejects a rename from a historical alias', async () => {
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on
            .select(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ slug: 'current-sales' }]);

        await expect(
            model.renameSlug({
                projectUuid,
                appUuid,
                from: 'old-sales',
                to: 'new-sales',
            }),
        ).rejects.toThrow(
            'Data app slug "old-sales" is a historical alias. Use the current slug "current-sales" as the source',
        );
    });

    test('renames back to an alias owned by the same app', async () => {
        tracker.on
            .select(AppsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.select(AppsTableName).responseOnce([{ slug: 'new-sales' }]);
        tracker.on.select(AppsTableName).responseOnce([]);
        tracker.on
            .select(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid, deleted_at: null }]);
        tracker.on.delete(AppSlugMappingsTableName).responseOnce(1);
        tracker.on
            .insert(AppSlugMappingsTableName)
            .responseOnce([{ app_id: appUuid }]);
        tracker.on.update(AppsTableName).responseOnce(1);

        await model.renameSlug({
            projectUuid,
            appUuid,
            from: 'new-sales',
            to: 'old-sales',
        });

        expect(tracker.history.delete).toHaveLength(1);
        const [aliasInsert] = tracker.history.insert;
        expect(aliasInsert.bindings).toEqual(
            expect.arrayContaining([projectUuid, appUuid, 'new-sales']),
        );
        const [appUpdate] = tracker.history.update;
        expect(appUpdate.bindings).toEqual(
            expect.arrayContaining([
                'old-sales',
                projectUuid,
                appUuid,
                'new-sales',
            ]),
        );
    });
});
