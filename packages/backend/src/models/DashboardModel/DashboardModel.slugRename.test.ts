import { AnyType } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { DashboardSlugMappingsTableName } from '../../database/entities/dashboardSlugMappings';
import { DashboardModel } from './DashboardModel';

describe('renameSlug', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DashboardModel({
        database,
    });
    const projectUuid = '22222222-2222-4222-8222-222222222222';
    const dashboardUuid = '11111111-1111-4111-8111-111111111111';
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
            .select(DashboardsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'old-orders' }]);
        tracker.on.select(DashboardsTableName).responseOnce([]);
        tracker.on.select(DashboardSlugMappingsTableName).responseOnce([]);
        tracker.on
            .insert(DashboardSlugMappingsTableName)
            .responseOnce([{ dashboard_uuid: dashboardUuid }]);
        tracker.on.update(DashboardsTableName).responseOnce(1);

        await model.renameSlug({
            projectUuid,
            dashboardUuid,
            from: 'old-orders',
            to: 'new-orders',
        });

        const aliasInsert = tracker.history.insert.find((query) =>
            query.sql.includes(DashboardSlugMappingsTableName),
        );
        expect(aliasInsert?.bindings).toEqual(
            expect.arrayContaining([projectUuid, dashboardUuid, 'old-orders']),
        );
        const [dashboardUpdate] = tracker.history.update;
        expect(dashboardUpdate.bindings).toEqual(
            expect.arrayContaining([
                'new-orders',
                projectUuid,
                dashboardUuid,
                'old-orders',
            ]),
        );
    });

    test('uses a supplied transaction without starting a nested transaction', async () => {
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'old-orders' }]);
        tracker.on.select(DashboardsTableName).responseOnce([]);
        tracker.on.select(DashboardSlugMappingsTableName).responseOnce([]);
        tracker.on
            .insert(DashboardSlugMappingsTableName)
            .responseOnce([{ dashboard_uuid: dashboardUuid }]);
        tracker.on.update(DashboardsTableName).responseOnce(1);

        await model.renameSlug(
            {
                projectUuid,
                dashboardUuid,
                from: 'old-orders',
                to: 'new-orders',
            },
            database as unknown as Knex.Transaction,
        );

        expect(database.transaction).not.toHaveBeenCalled();
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.update).toHaveLength(1);
    });

    test('treats an alias-to-current replay as idempotent', async () => {
        tracker.on.select(DashboardsTableName).responseOnce([]);
        tracker.on
            .select(DashboardSlugMappingsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'new-orders' }]);

        await model.renameSlug({
            projectUuid,
            dashboardUuid,
            from: 'old-orders',
            to: 'new-orders',
        });

        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    test('rejects a target slug owned by another dashboard before writing', async () => {
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'old-orders' }]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([
                { dashboard_uuid: 'another-dashboard-uuid', deleted_at: null },
            ]);

        await expect(
            model.renameSlug({
                projectUuid,
                dashboardUuid,
                from: 'old-orders',
                to: 'existing-orders',
            }),
        ).rejects.toThrow(
            'Dashboard slug "existing-orders" is already in use in this project',
        );

        expect(tracker.history.insert).toHaveLength(0);
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    test('renames back to an alias owned by the same dashboard', async () => {
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on
            .select(DashboardsTableName)
            .responseOnce([{ slug: 'new-orders' }]);
        tracker.on.select(DashboardsTableName).responseOnce([]);
        tracker.on
            .select(DashboardSlugMappingsTableName)
            .responseOnce([
                { dashboard_uuid: dashboardUuid, deleted_at: null },
            ]);
        tracker.on.delete(DashboardSlugMappingsTableName).responseOnce(1);
        tracker.on
            .insert(DashboardSlugMappingsTableName)
            .responseOnce([{ dashboard_uuid: dashboardUuid }]);
        tracker.on.update(DashboardsTableName).responseOnce(1);

        await model.renameSlug({
            projectUuid,
            dashboardUuid,
            from: 'new-orders',
            to: 'old-orders',
        });

        expect(tracker.history.delete).toHaveLength(1);
        const [aliasInsert] = tracker.history.insert;
        expect(aliasInsert.bindings).toEqual(
            expect.arrayContaining([projectUuid, dashboardUuid, 'new-orders']),
        );
        const [chartUpdate] = tracker.history.update;
        expect(chartUpdate.bindings).toEqual(
            expect.arrayContaining([
                'old-orders',
                projectUuid,
                dashboardUuid,
                'new-orders',
            ]),
        );
    });
});
