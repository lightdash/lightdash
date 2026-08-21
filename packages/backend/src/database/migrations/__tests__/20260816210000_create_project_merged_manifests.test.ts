import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { down, up } from '../20260816210000_create_project_merged_manifests';

describe('project merged manifests migration', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('creates the project-scoped gzip artifact table', async () => {
        tracker.on.any(() => true).response({});

        await up(database);

        const statements = tracker.history.all.map(({ sql }) => sql);
        expect(statements).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'create table "project_merged_manifests"',
                ),
            ]),
        );
        const createTable = statements.find((sql) =>
            sql.includes('create table "project_merged_manifests"'),
        );
        const migrationSql = statements.join('\n');
        expect(createTable).toContain('"project_uuid" uuid');
        expect(createTable).toContain('primary key');
        expect(migrationSql).toContain('references "projects"');
        expect(migrationSql).toContain('on delete CASCADE');
        expect(createTable).toContain('"manifest" bytea not null');
        expect(createTable).toContain('"created_at" timestamp not null');
    });

    test('drops the artifact table', async () => {
        tracker.on.any(() => true).response({});

        await down(database);

        expect(tracker.history.all.map(({ sql }) => sql)).toContain(
            'drop table if exists "project_merged_manifests"',
        );
    });
});
