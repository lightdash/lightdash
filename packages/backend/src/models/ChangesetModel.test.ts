import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    ChangesetsTableName,
    ChangesTableName,
} from '../database/entities/changesets';
import { ChangesetModel } from './ChangesetModel';

describe('ChangesetModel tenant scoping', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ChangesetModel({ database });
    let tracker: Tracker;
    const dbChange = {
        change_uuid: '11111111-1111-4111-8111-111111111111',
        changeset_uuid: '33333333-3333-4333-8333-333333333333',
        created_at: new Date('2026-01-01'),
        created_by_user_uuid: '44444444-4444-4444-8444-444444444444',
        source_prompt_uuid: null,
        entity_type: 'table',
        entity_table_name: 'orders',
        entity_name: 'Orders',
        type: 'update',
        payload: { patches: [] },
    };

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('gets a change scoped through its changeset project', async () => {
        const { change_uuid: changeUuid } = dbChange;
        const projectUuid = '22222222-2222-4222-8222-222222222222';

        tracker.on
            .select(({ sql }) => sql.includes(ChangesTableName))
            .responseOnce(dbChange);

        await model.getChange(changeUuid, projectUuid);

        const [query] = tracker.history.select;
        expect(query.sql).toContain(ChangesetsTableName);
        expect(query.bindings).toContain(changeUuid);
        expect(query.bindings).toContain(projectUuid);
    });

    test('reverts a single change only within the requested project', async () => {
        const { change_uuid: changeUuid } = dbChange;
        const projectUuid = '22222222-2222-4222-8222-222222222222';

        tracker.on
            .select(({ sql }) => sql.includes(ChangesTableName))
            .responseOnce(dbChange);
        tracker.on
            .delete(({ sql }) => sql.includes(ChangesTableName))
            .responseOnce(1);

        await model.revertChange(changeUuid, projectUuid);

        const [deleteQuery] = tracker.history.delete;
        expect(deleteQuery.sql).toContain(ChangesetsTableName);
        expect(deleteQuery.bindings).toContain(changeUuid);
        expect(deleteQuery.bindings).toContain(projectUuid);
    });
});
