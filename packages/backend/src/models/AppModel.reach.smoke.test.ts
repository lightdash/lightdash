import { randomUUID } from 'crypto';
import knex from 'knex';
import { AppModel } from './AppModel';

// An isolated schema, on an explicitly selected local test database.
describe.skipIf(!process.env.DATA_APP_REACH_SMOKE_PGPORT)(
    'app reach attribution on Postgres',
    () => {
        it('recognizes all builders, preserves unknown authors and uses only ready versions', async () => {
            const schema = `reach_${randomUUID().replaceAll('-', '')}`;
            const db = knex({
                client: 'pg',
                connection: {
                    host: 'localhost',
                    port: Number(process.env.DATA_APP_REACH_SMOKE_PGPORT),
                    database: 'postgres',
                    user: 'postgres',
                    password: 'password',
                },
                searchPath: [schema],
                pool: { min: 0, max: 2 },
            });
            // Minimal isolated fixture tables intentionally omit unrelated production columns.
            const fixture = (table: string) => db(table);
            const app = randomUUID();
            const project = randomUUID();
            const creator = randomUUID();
            const coauthor = randomUUID();
            const reader = randomUUID();
            try {
                await db.raw('CREATE SCHEMA ??', [schema]);
                await db.raw(`CREATE TABLE projects (project_uuid uuid PRIMARY KEY, project_type text);
                CREATE TABLE apps (app_id uuid PRIMARY KEY, project_uuid uuid, created_by_user_uuid uuid, space_uuid uuid, template text);
                CREATE TABLE app_versions (app_id uuid, version integer, created_by_user_uuid uuid, status text, PRIMARY KEY (app_id, version));`);
                await fixture('projects').insert({
                    project_uuid: project,
                    project_type: 'default',
                });
                await fixture('apps').insert({
                    app_id: app,
                    project_uuid: project,
                    created_by_user_uuid: creator,
                    space_uuid: randomUUID(),
                    template: null,
                });
                await fixture('app_versions').insert([
                    {
                        app_id: app,
                        version: 1,
                        created_by_user_uuid: creator,
                        status: 'ready',
                    },
                    {
                        app_id: app,
                        version: 2,
                        created_by_user_uuid: coauthor,
                        status: 'ready',
                    },
                    {
                        app_id: app,
                        version: 3,
                        created_by_user_uuid: coauthor,
                        status: 'generating',
                    },
                ]);
                const model = new AppModel({ database: db });
                expect(
                    await model.getReachContext(app, 1, creator),
                ).toMatchObject({
                    is_builder: true,
                    ready_version: 1,
                    has_other_ready: true,
                });
                expect(
                    await model.getReachContext(app, 1, coauthor),
                ).toMatchObject({ is_builder: true });
                expect(
                    await model.getReachContext(app, 3, reader),
                ).toMatchObject({ is_builder: false, ready_version: null });
                expect(
                    await model.getReachContext(app, null, reader),
                ).toMatchObject({ ready_version: 2 });
                await fixture('app_versions')
                    .where({ app_id: app, version: 2 })
                    .update({ created_by_user_uuid: null });
                expect(
                    await model.getReachContext(app, 1, reader),
                ).toMatchObject({ is_builder: null });
                expect(
                    await model.getReachContext(app, 1, creator),
                ).toMatchObject({ is_builder: true });
                await fixture('projects').update({ project_type: 'preview' });
                expect(
                    await model.getReachContext(app, 1, reader),
                ).toMatchObject({ is_preview_project: true });
            } finally {
                await db.raw('DROP SCHEMA ?? CASCADE', [schema]);
                await db.destroy();
            }
        });
    },
);
