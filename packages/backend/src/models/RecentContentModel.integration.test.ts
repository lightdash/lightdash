import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { RecentContentTableName } from '../database/entities/recentContent';
import {
    down,
    up,
} from '../database/migrations/20260909120000_create_user_recent_content';
import { RecentContentModel } from './RecentContentModel';

describe('RecentContentModel (PostgreSQL)', () => {
    let database: Knex;
    let model: RecentContentModel;
    const schema = `recent_content_test_${randomUUID().replaceAll('-', '')}`;
    const userUuid = randomUUID();
    const otherUserUuid = randomUUID();
    const projectUuid = randomUUID();
    const otherProjectUuid = randomUUID();
    const now = new Date();
    const expired = new Date(now.getTime() - 91 * 24 * 3600 * 1000);
    const view = (contentUuid = randomUUID(), viewedAt = now) => ({
        userUuid,
        projectUuid,
        contentUuid,
        contentType: 'chart' as const,
        viewedAt,
    });

    beforeAll(async () => {
        if (
            !process.env.RECENT_CONTENT_TEST_DATABASE_URL &&
            !process.env.PGDATABASE
        ) {
            throw new Error(
                'Set RECENT_CONTENT_TEST_DATABASE_URL or PG connection variables for PostgreSQL tests',
            );
        }
        const connection = process.env.RECENT_CONTENT_TEST_DATABASE_URL ?? {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT ?? 5432),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
        };
        database = knex({
            client: 'pg',
            connection,
            searchPath: [schema],
            pool: { min: 0, max: 10 },
        });
        await database.schema.createSchema(schema);
        await database.schema.createTable('users', (table) => {
            table.uuid('user_uuid').primary();
        });
        await database.schema.createTable('projects', (table) => {
            table.uuid('project_uuid').primary();
        });
        await database.transaction(up);
        await database<{ user_uuid: string }>('users').insert([
            { user_uuid: userUuid },
            { user_uuid: otherUserUuid },
        ]);
        await database<{ project_uuid: string }>('projects').insert([
            { project_uuid: projectUuid },
            { project_uuid: otherProjectUuid },
        ]);
        model = new RecentContentModel(database);
    });
    afterEach(async () => {
        await database(RecentContentTableName).delete();
    });
    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    it('can roll back and reapply the schema migration', async () => {
        await database.transaction(down);
        await database.transaction(up);
        await model.recordView(view());
        expect(await model.find(userUuid, projectUuid)).toHaveLength(1);
    });

    it('keeps one row per item and never moves its timestamp backwards', async () => {
        const item = view();
        await model.recordView(item);
        await model.recordView({
            ...item,
            viewedAt: new Date(now.getTime() - 1000),
        });
        expect(await model.find(userUuid, projectUuid)).toEqual([
            { contentType: 'chart', uuid: item.contentUuid, viewedAt: now },
        ]);
    });

    it('isolates types, users and projects', async () => {
        const item = view();
        await model.recordView(item);
        await model.recordView({ ...item, contentType: 'dashboard' });
        await model.recordView({ ...item, userUuid: otherUserUuid });
        await model.recordView({ ...item, projectUuid: otherProjectUuid });
        expect(await model.find(userUuid, projectUuid)).toHaveLength(2);
        expect(await model.find(otherUserUuid, projectUuid)).toHaveLength(1);
        expect(await model.find(userUuid, otherProjectUuid)).toHaveLength(1);
    });

    it('serializes concurrent writes and retains exactly the newest fifty', async () => {
        const views = Array.from({ length: 65 }, (_, index) =>
            view(randomUUID(), new Date(now.getTime() - index * 1000)),
        );
        await Promise.all(views.map((item) => model.recordView(item)));
        const rows = await model.find(userUuid, projectUuid);
        expect(rows.map((row) => row.uuid)).toEqual(
            views.slice(0, 50).map((item) => item.contentUuid),
        );
        const [{ count }] = await database(RecentContentTableName).count<
            { count: string }[]
        >('*');
        expect(Number(count)).toBe(50);
    });

    it('retains deterministic ties and promotes an older item on revisit', async () => {
        const views = Array.from({ length: 51 }, () => view());
        await Promise.all(views.map((item) => model.recordView(item)));
        const ordered = views.map((item) => item.contentUuid).sort();
        expect(
            (await model.find(userUuid, projectUuid)).map((item) => item.uuid),
        ).toEqual(ordered.slice(0, 50));
        await model.recordView(
            view(ordered[50], new Date(now.getTime() + 1000)),
        );
        expect((await model.find(userUuid, projectUuid))[0].uuid).toBe(
            ordered[50],
        );
    });

    it('excludes expired views and prunes them when recording', async () => {
        await model.recordView(view(randomUUID(), expired));
        expect(await model.find(userUuid, projectUuid)).toEqual([]);
        const [{ count }] = await database(RecentContentTableName).count<
            { count: string }[]
        >('*');
        expect(Number(count)).toBe(0);
    });

    it('cascades project and user deletion', async () => {
        const disposableUser = randomUUID();
        const disposableProject = randomUUID();
        await database<{ user_uuid: string }>('users').insert({
            user_uuid: disposableUser,
        });
        await database<{ project_uuid: string }>('projects').insert({
            project_uuid: disposableProject,
        });
        await model.recordView({ ...view(), userUuid: disposableUser });
        await model.recordView({ ...view(), projectUuid: disposableProject });
        await database<{ user_uuid: string }>('users')
            .where('user_uuid', disposableUser)
            .delete();
        await database<{ project_uuid: string }>('projects')
            .where('project_uuid', disposableProject)
            .delete();
        expect(await database(RecentContentTableName)).toEqual([]);
    });
});
