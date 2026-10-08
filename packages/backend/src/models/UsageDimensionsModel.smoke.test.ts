import { randomUUID } from 'crypto';
import knex, { Knex } from 'knex';
import { UsageDimensionsModel } from './UsageDimensionsModel';

// Real Postgres: opt in with the port of an isolated LOCAL instance.
// Every test owns a schema; seeded application data is never changed.
describe.skipIf(!process.env.USAGE_DIMENSIONS_SMOKE_PGPORT)(
    'usage inventory pagination and database deadlines',
    () => {
        let db: Knex;
        let schema: string;
        const org = '10000000-0000-0000-0000-000000000001';
        const project = '20000000-0000-0000-0000-000000000001';
        const organization = { organization_id: 1, organization_uuid: org };
        const read = async () => {
            const rows = [];
            for await (const line of new UsageDimensionsModel(db).getJsonLines(
                organization,
                'content',
            )) {
                rows.push(JSON.parse(line));
            }
            return rows;
        };

        beforeEach(async () => {
            vi.unstubAllGlobals();
            schema = `inventory_${randomUUID().replaceAll('-', '')}`;
            db = knex({
                client: 'pg',
                connection: {
                    host: 'localhost',
                    port: Number(process.env.USAGE_DIMENSIONS_SMOKE_PGPORT),
                    user: process.env.PGUSER ?? 'postgres',
                    password: process.env.PGPASSWORD ?? 'password',
                    database: process.env.PGDATABASE ?? 'postgres',
                },
                searchPath: [schema],
                pool: { min: 0, max: 3 },
            });
            await db.raw('CREATE SCHEMA ??', [schema]);
            await db.raw(`
                CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid UNIQUE, organization_id integer, name text);
                CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid UNIQUE, project_id integer, name text, deleted_at timestamptz);
                CREATE TABLE dashboards (dashboard_id integer PRIMARY KEY, dashboard_uuid uuid UNIQUE, space_id integer, name text, created_at timestamptz, deleted_at timestamptz, owner_user_uuid uuid);
                CREATE TABLE saved_queries (saved_query_id integer PRIMARY KEY, saved_query_uuid uuid UNIQUE, project_uuid uuid, space_id integer, dashboard_uuid uuid, name text, created_at timestamptz, deleted_at timestamptz);
                CREATE TABLE saved_sql (saved_sql_uuid uuid PRIMARY KEY, project_uuid uuid, space_uuid uuid, dashboard_uuid uuid, name text, created_at timestamptz, deleted_at timestamptz);
                CREATE TABLE apps (app_id uuid PRIMARY KEY, project_uuid uuid, space_uuid uuid, name text, created_at timestamptz, deleted_at timestamptz);
                CREATE TABLE dashboard_versions (dashboard_version_id integer PRIMARY KEY, dashboard_id integer);
                CREATE INDEX ON dashboard_versions(dashboard_id);
                CREATE TABLE dashboard_tile_charts (dashboard_version_id integer, saved_chart_id integer);
                CREATE INDEX ON dashboard_tile_charts(saved_chart_id);
                CREATE TABLE dashboard_tile_sql_charts (dashboard_version_id integer, saved_sql_uuid uuid);
                CREATE TABLE dashboard_tile_data_apps (dashboard_version_id integer, app_uuid uuid);
                CREATE TABLE content_verification (content_uuid uuid, project_uuid uuid, content_type text);
                CREATE TABLE scheduler (enabled boolean, deleted_at timestamptz, project_uuid uuid, saved_chart_uuid uuid, saved_sql_uuid uuid, dashboard_uuid uuid, app_uuid uuid);
                CREATE TABLE users (user_id integer PRIMARY KEY, user_uuid uuid UNIQUE, first_name text, last_name text, is_active boolean);
                CREATE TABLE organization_memberships (organization_id integer, user_id integer);
                INSERT INTO projects VALUES (1, '${project}', 1, 'Project'), (2, md5('other project')::uuid, 2, 'Other organization');
                INSERT INTO spaces VALUES (1, md5('space')::uuid, 1, 'Space', null), (2, md5('other space')::uuid, 2, 'Other space', null);
                INSERT INTO saved_queries SELECT n, md5('chart-'||n)::uuid, '${project}', 1, null, 'Chart '||n, now(), null FROM generate_series(1,1005) n;
                INSERT INTO saved_sql SELECT md5('sql-'||n)::uuid, '${project}', md5('space')::uuid, null, 'SQL '||n, now(), null FROM generate_series(1,1005) n;
                INSERT INTO dashboards SELECT n, md5('dashboard-'||n)::uuid, 1, 'Dashboard '||n, now(), null, null FROM generate_series(1,1005) n;
                INSERT INTO apps SELECT md5('app-'||n)::uuid, '${project}', md5('space')::uuid, 'App '||n, now(), null FROM generate_series(1,1005) n;
                INSERT INTO dashboards VALUES(2000,md5('other dashboard')::uuid,2,'Other dashboard',now(),null,null);
                INSERT INTO dashboard_versions VALUES (1,1),(2,1),(3,2),(4,3),(5,2000);
                -- Repeated current tiles count once; old versions, deleted dashboards
                -- and another tenant's dashboard must not count as references.
                INSERT INTO dashboard_tile_charts VALUES (1,1),(2,1),(2,1),(3,1),(4,1),(5,1),(1,2);
                INSERT INTO dashboard_tile_sql_charts SELECT dashboard_version_id,md5('sql-1')::uuid FROM dashboard_tile_charts WHERE saved_chart_id=1;
                INSERT INTO dashboard_tile_data_apps SELECT dashboard_version_id,md5('app-1')::uuid FROM dashboard_tile_charts WHERE saved_chart_id=1;
                UPDATE dashboards SET deleted_at=now() WHERE dashboard_id=3;
                INSERT INTO scheduler(enabled,project_uuid,saved_chart_uuid) VALUES
                    (true,'${project}',md5('chart-1')::uuid),
                    (true,null,md5('chart-1')::uuid),
                    (false,'${project}',md5('chart-1')::uuid),
                    (true,md5('other project')::uuid,md5('chart-1')::uuid);
                INSERT INTO scheduler(enabled,project_uuid,saved_sql_uuid) VALUES(true,'${project}',md5('sql-1')::uuid);
                INSERT INTO scheduler(enabled,project_uuid,dashboard_uuid) VALUES(true,'${project}',md5('dashboard-1')::uuid);
                INSERT INTO scheduler(enabled,project_uuid,app_uuid) VALUES(true,'${project}',md5('app-1')::uuid);
                INSERT INTO content_verification VALUES(md5('chart-1')::uuid,'${project}','chart');
                INSERT INTO users VALUES(1,md5('user')::uuid,'An','Owner',true);
                INSERT INTO organization_memberships VALUES(1,1);
                UPDATE dashboards SET owner_user_uuid=md5('user')::uuid WHERE dashboard_id=1;
                INSERT INTO projects VALUES(3,md5('same org project')::uuid,1,'Same org, different project');
                INSERT INTO spaces VALUES(3,md5('same org space')::uuid,3,'Other project space',null), (4,md5('deleted space')::uuid,1,'Deleted space',now());
                UPDATE dashboards SET space_id=3 WHERE dashboard_id=1004;
                UPDATE dashboards SET space_id=4 WHERE dashboard_id=1003;
                INSERT INTO dashboard_versions VALUES(6,1004),(7,1003);
                INSERT INTO dashboard_tile_charts VALUES(6,1),(7,1);
                INSERT INTO saved_queries VALUES(2000,md5('other chart')::uuid,md5('other project')::uuid,2,null,'Other chart',now(),null);
                INSERT INTO saved_sql VALUES(md5('other sql')::uuid,md5('other project')::uuid,md5('other space')::uuid,null,'Other SQL',now(),null);
                INSERT INTO apps VALUES(md5('other app')::uuid,md5('other project')::uuid,md5('other space')::uuid,'Other app',now(),null);
                UPDATE saved_queries SET deleted_at=now() WHERE saved_query_id=4;
                UPDATE saved_queries SET space_id=4 WHERE saved_query_id=5;
                UPDATE saved_queries SET space_id=null,dashboard_uuid=md5('dashboard-3')::uuid WHERE saved_query_id=6;
                INSERT INTO users VALUES(2,md5('inactive user')::uuid,'Former','Owner',false),(3,md5('nonmember')::uuid,'Other','User',true);
                UPDATE dashboards SET owner_user_uuid=md5('inactive user')::uuid WHERE dashboard_id=4;
                UPDATE dashboards SET owner_user_uuid=md5('missing user')::uuid WHERE dashboard_id=5;
                UPDATE dashboards SET owner_user_uuid=md5('nonmember')::uuid WHERE dashboard_id=6;
                ANALYZE projects; ANALYZE spaces; ANALYZE dashboards; ANALYZE saved_queries;
            `);
        });

        afterEach(async () => {
            await db.raw('DROP SCHEMA ?? CASCADE', [schema]);
            await db.destroy();
        });

        it('paginates every type without omissions, fanout or cross-tenant dependencies', async () => {
            const rows = await read();
            expect(rows).toHaveLength(4020);
            expect(
                new Set(rows.map((r) => `${r.content_type}:${r.content_id}`))
                    .size,
            ).toBe(4020);
            expect(rows.every((r) => r.org_id === org)).toBe(true);
            const item = (name: string) =>
                rows.find((r) => r.content_name === name);
            expect(item('Chart 1')).toMatchObject({
                dashboard_references: 2,
                enabled_schedules: 2,
                is_verified: true,
                owner_status: 'Not recorded',
            });
            expect(item('SQL 1')).toMatchObject({
                enabled_schedules: 1,
                dashboard_references: 2,
                is_verified: null,
            });
            expect(item('App 1')).toMatchObject({
                enabled_schedules: 1,
                dashboard_references: 2,
                is_verified: null,
            });
            expect(item('Chart 2')).toMatchObject({
                dashboard_references: 0,
                enabled_schedules: 0,
            });
            expect(item('Dashboard 1')).toMatchObject({
                enabled_schedules: 1,
                dashboard_references: 0,
                owner_name: 'An Owner',
                owner_status: 'Active organization member',
            });
            expect(item('Dashboard 2')).toMatchObject({
                owner_status: 'Unassigned',
            });
            expect(item('Dashboard 3')).toMatchObject({ is_deleted: true });
            expect(item('Other dashboard')).toBeUndefined();
            expect(item('Other chart')).toBeUndefined();
            expect(item('Other SQL')).toBeUndefined();
            expect(item('Other app')).toBeUndefined();
            for (const name of [
                'Chart 4',
                'Chart 5',
                'Chart 6',
                'Dashboard 1003',
            ]) {
                expect(item(name)).toMatchObject({ is_deleted: true });
            }
            expect(item('Dashboard 4')).toMatchObject({
                owner_status: 'Deactivated',
            });
            expect(item('Dashboard 5')).toMatchObject({
                owner_status: 'Unknown user',
            });
            expect(item('Dashboard 6')).toMatchObject({
                owner_status: 'Not an organization member',
            });
        });

        it('exports content with extensive dashboard version history within the page deadline', async () => {
            // Every dashboard edit retains its tiles. The latest-version lookup
            // must not rescan all versions once for each historical tile.
            await db.raw(`
                INSERT INTO dashboard_versions
                    SELECT n, 1 FROM generate_series(10,8009) n;
                INSERT INTO dashboard_tile_charts
                    SELECT v, c FROM generate_series(10,8009) v
                    CROSS JOIN generate_series(1,20) c
                    WHERE v < 8009 OR c <> 2;
                INSERT INTO dashboard_tile_sql_charts
                    SELECT v, md5('sql-'||c)::uuid FROM generate_series(10,8009) v
                    CROSS JOIN generate_series(1,20) c
                    WHERE v < 8009 OR c <> 2;
                INSERT INTO dashboard_tile_data_apps
                    SELECT v, md5('app-'||c)::uuid FROM generate_series(10,8009) v
                    CROSS JOIN generate_series(1,20) c
                    WHERE v < 8009 OR c <> 2;
                -- Most histories belong to other dashboards, as on a shared instance.
                INSERT INTO dashboard_versions
                    SELECT n, 10 + n % 990 FROM generate_series(10000,509999) n;
                ANALYZE dashboard_versions;
                ANALYZE dashboard_tile_charts;
                ANALYZE dashboard_tile_sql_charts;
                ANALYZE dashboard_tile_data_apps;
            `);
            const rows = await read();
            expect(rows).toHaveLength(4020);
            for (const prefix of ['Chart', 'SQL', 'App']) {
                expect(
                    rows.find((r) => r.content_name === `${prefix} 1`),
                ).toMatchObject({ dashboard_references: 2 });
                expect(
                    rows.find((r) => r.content_name === `${prefix} 2`),
                ).toMatchObject({ dashboard_references: 0 });
                expect(
                    rows.find((r) => r.content_name === `${prefix} 3`),
                ).toMatchObject({ dashboard_references: 1 });
            }
        }, 20000);

        it('abandons a page waiting for a table lock and can retry afterward', async () => {
            const blocker = await db.transaction();
            try {
                await blocker.raw(
                    'LOCK TABLE projects IN ACCESS EXCLUSIVE MODE',
                );
                await expect(read()).rejects.toMatchObject({ code: '55P03' });
            } finally {
                await blocker.rollback();
            }
            expect(await read()).toHaveLength(4020);
        });

        it('cancels a slow page on the server and releases its read lock for DDL', async () => {
            await db.raw(`
                CREATE TABLE agent_source (ai_agent_uuid uuid, organization_uuid uuid, name text);
                INSERT INTO agent_source VALUES(md5('agent')::uuid,'${org}','Agent');
                CREATE VIEW ai_agent AS SELECT ai_agent_uuid, organization_uuid,
                    name || (SELECT '' FROM pg_sleep(30)) AS name FROM agent_source;
            `);
            // The view deliberately holds a read lock while executing pg_sleep.
            const iterator = new UsageDimensionsModel(db).getJsonLines(
                organization,
                'agents',
            );
            const pending = iterator.next().catch((error: unknown) => error);
            // Wait until Postgres is executing this page before queueing DDL.
            let active = false;
            for (let attempt = 0; attempt < 100; attempt += 1) {
                // eslint-disable-next-line no-await-in-loop
                const result = await db.raw(
                    `SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state='active' AND query LIKE '%json_build_object%' AND wait_event='PgSleep'`,
                );
                if (result.rows.length > 0) {
                    active = true;
                    break;
                }
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => {
                    setTimeout(resolve, 10);
                });
            }
            expect(active).toBe(true);
            const start = Date.now();
            await db.transaction(async (trx) => {
                await trx.raw("SET LOCAL statement_timeout = '7s'");
                await trx.raw(
                    'ALTER TABLE agent_source ADD COLUMN after_export integer',
                );
            });
            expect(await pending).toMatchObject({ code: '57014' });
            expect(Date.now() - start).toBeLessThan(7000);
            const settings = await db.raw(
                "SELECT current_setting('statement_timeout') AS timeout, current_setting('lock_timeout') AS lock_timeout",
            );
            expect(settings.rows).toEqual([
                { timeout: '0', lock_timeout: '0' },
            ]);
        }, 15000);
    },
);
