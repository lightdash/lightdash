import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { up } from '../20260816190000_add_primary_dbt_source_identity_to_projects';

const projectUuid = '00000000-0000-0000-0000-000000000001';

describe('primary dbt source identity migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('backfills a distinct primary identity when an additional source already uses dbt_project', async () => {
        tracker.on
            .select(/from "projects"/)
            .response([{ project_uuid: projectUuid }]);
        tracker.on.select(/from "project_dbt_sources"/).response([
            { project_uuid: projectUuid, name: 'dbt_project' },
            { project_uuid: projectUuid, name: 'dbt_project_1' },
        ]);
        tracker.on.any(() => true).response({});

        await up(database);

        const sourceNameUpdate = tracker.history.all.find(
            ({ method, sql }) =>
                method === 'update' && sql.includes('"dbt_source_name"'),
        );

        expect(sourceNameUpdate?.bindings).toEqual([
            'dbt_project_2',
            projectUuid,
        ]);
        expect(['dbt_project_2__orders', 'dbt_project__orders']).toEqual([
            `${sourceNameUpdate?.bindings?.[0]}__orders`,
            'dbt_project__orders',
        ]);
    });
});
