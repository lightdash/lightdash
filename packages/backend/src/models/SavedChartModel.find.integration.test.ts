import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { SavedChartModel } from './SavedChartModel';

type FixtureRow = Record<string, string | number | Date | null>;

describe('SavedChartModel.find (PostgreSQL)', () => {
    let database: Knex;
    let model: SavedChartModel;
    const schema = `chart_find_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const otherProjectUuid = randomUUID();
    const spaceUuid = randomUUID();
    const dashboardUuid = randomUUID();

    beforeAll(async () => {
        if (!process.env.PGDATABASE) {
            throw new Error('Set PG connection variables for PostgreSQL tests');
        }
        database = knex({
            client: 'pg',
            connection: {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
            searchPath: [schema],
            pool: { min: 0, max: 1 },
        });
        await database.schema.createSchema(schema);
        await database.raw(`
            CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid);
            CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid, organization_id integer);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, space_uuid uuid, project_id integer, name text, deleted_at timestamptz);
            CREATE TABLE dashboards (dashboard_id integer PRIMARY KEY, dashboard_uuid uuid, space_id integer, name text, slug text);
            CREATE TABLE dashboard_versions (dashboard_version_id integer PRIMARY KEY, dashboard_id integer, created_at timestamptz);
            CREATE TABLE dashboard_tile_charts (dashboard_version_id integer, saved_chart_id integer);
            CREATE TABLE saved_queries (
                saved_query_id serial PRIMARY KEY, saved_query_uuid uuid UNIQUE, project_uuid uuid,
                space_id integer, dashboard_uuid uuid, name text, description text, slug text,
                last_version_chart_kind text DEFAULT 'table', last_version_updated_at timestamptz DEFAULT now(),
                views_count integer DEFAULT 0, deleted_at timestamptz
            );
            CREATE TABLE saved_queries_versions (saved_queries_version_id serial PRIMARY KEY, saved_query_id integer, created_at timestamptz, explore_name text);
            CREATE TABLE pinned_list (pinned_list_uuid uuid PRIMARY KEY);
            CREATE TABLE pinned_chart (saved_chart_uuid uuid, pinned_list_uuid uuid);
            CREATE TABLE saved_query_slug_mappings (saved_query_uuid uuid, slug text);
        `);
        model = new SavedChartModel({
            database,
            lightdashConfig: lightdashConfigMock,
        });
    });

    beforeEach(async () => {
        await database.raw(
            'TRUNCATE organizations, projects, spaces, dashboards, dashboard_versions, dashboard_tile_charts, saved_queries, saved_queries_versions, pinned_list, pinned_chart, saved_query_slug_mappings RESTART IDENTITY',
        );
        await database<FixtureRow>('organizations').insert({
            organization_id: 1,
            organization_uuid: randomUUID(),
        });
        await database<FixtureRow>('projects').insert([
            { project_id: 1, project_uuid: projectUuid, organization_id: 1 },
            {
                project_id: 2,
                project_uuid: otherProjectUuid,
                organization_id: 1,
            },
        ]);
        await database<FixtureRow>('spaces').insert([
            {
                space_id: 1,
                space_uuid: spaceUuid,
                project_id: 1,
                name: 'Space',
            },
            {
                space_id: 2,
                space_uuid: randomUUID(),
                project_id: 2,
                name: 'Other space',
            },
        ]);
        await database<FixtureRow>('dashboards').insert({
            dashboard_id: 1,
            dashboard_uuid: dashboardUuid,
            space_id: 1,
            name: 'Dashboard',
            slug: 'dashboard',
        });
    });

    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    const addChart = async (inDashboard = false, project = projectUuid) => {
        const uuid = randomUUID();
        const spaceId = project === projectUuid ? 1 : 2;
        const [chart] = await database<FixtureRow>('saved_queries')
            .insert({
                saved_query_uuid: uuid,
                project_uuid: project,
                space_id: inDashboard ? null : spaceId,
                dashboard_uuid: inDashboard ? dashboardUuid : null,
                name: uuid,
                slug: uuid,
            })
            .returning(['saved_query_id', 'saved_query_uuid']);
        return { id: chart.saved_query_id as number, uuid };
    };
    const version = async (id: number, explore: string, date = '2026-01-01') =>
        database<FixtureRow>('saved_queries_versions').insert({
            saved_query_id: id,
            explore_name: explore,
            created_at: date,
        });
    const dashboardVersion = async (
        id: number,
        charts: number[],
        date = '2026-01-01',
    ) => {
        await database<FixtureRow>('dashboard_versions').insert({
            dashboard_version_id: id,
            dashboard_id: 1,
            created_at: date,
        });
        if (charts.length)
            await database<FixtureRow>('dashboard_tile_charts').insert(
                charts.map((chart) => ({
                    dashboard_version_id: id,
                    saved_chart_id: chart,
                })),
            );
    };
    const uuids = async (filters: Parameters<SavedChartModel['find']>[0]) =>
        (await model.find(filters)).map((chart) => chart.uuid).sort();

    test.each(['exploreName', 'exploreNames'] as const)(
        '%s matches only the latest chart version',
        async (filter) => {
            const moved = await addChart();
            const current = await addChart();
            await version(moved.id, 'orders');
            await version(moved.id, 'customers', '2026-02-01');
            await version(current.id, 'customers');
            await version(current.id, 'orders', '2026-02-01');
            expect(
                await uuids({
                    projectUuid,
                    [filter]: filter === 'exploreName' ? 'orders' : ['orders'],
                }),
            ).toEqual([current.uuid]);
        },
    );

    test('chart timestamp ties choose the highest version id, not insertion timestamps alone', async () => {
        const chart = await addChart();
        await version(chart.id, 'orders', '2026-02-01');
        await version(chart.id, 'customers', '2026-02-01');
        await version(chart.id, 'orders', '2026-01-01');
        expect(await uuids({ projectUuid, exploreName: 'orders' })).toEqual([]);
        expect(await uuids({ projectUuid, exploreName: 'customers' })).toEqual([
            chart.uuid,
        ]);
    });

    test('dashboard-owned charts require current membership; repeated tiles return one summary', async () => {
        const removed = await addChart(true);
        const retained = await addChart(true);
        const standalone = await addChart();
        await Promise.all(
            [removed, retained, standalone].map((chart) =>
                version(chart.id, 'orders'),
            ),
        );
        await dashboardVersion(1, [removed.id, retained.id]);
        await dashboardVersion(2, [retained.id, retained.id], '2026-02-01');
        expect(await uuids({ projectUuid, exploreName: 'orders' })).toEqual(
            [retained.uuid, standalone.uuid].sort(),
        );
        expect(await uuids({ projectUuid, exploreNames: ['orders'] })).toEqual(
            [retained.uuid, standalone.uuid].sort(),
        );
    });

    test('dashboard timestamp ties choose the highest dashboard version id', async () => {
        const chart = await addChart(true);
        await version(chart.id, 'orders');
        await dashboardVersion(1, [chart.id]);
        await dashboardVersion(2, []);
        expect(await uuids({ projectUuid })).toEqual([]);
    });

    test('orphan and standalone-only options retain their meaning', async () => {
        const orphan = await addChart(true);
        const standalone = await addChart();
        await version(orphan.id, 'orders');
        await version(standalone.id, 'orders');
        await dashboardVersion(1, []);
        expect(await uuids({ projectUuid })).toEqual([standalone.uuid]);
        expect(
            await uuids({
                projectUuid,
                includeOrphanChartsWithinDashboard: true,
                exploreName: 'orders',
            }),
        ).toEqual([orphan.uuid, standalone.uuid].sort());
        expect(
            await uuids({
                projectUuid,
                includeOrphanChartsWithinDashboard: true,
                excludeChartsSavedInDashboard: true,
            }),
        ).toEqual([standalone.uuid]);
        expect(
            await uuids({ projectUuid, excludeChartsSavedInDashboard: true }),
        ).toEqual([standalone.uuid]);
    });

    test('project, space, slug and slug alias filters still apply', async () => {
        const chart = await addChart();
        const other = await addChart(false, otherProjectUuid);
        await version(chart.id, 'orders');
        await version(other.id, 'orders');
        await database<FixtureRow>('saved_query_slug_mappings').insert({
            saved_query_uuid: chart.uuid,
            slug: 'old-slug',
        });
        expect(
            await uuids({
                projectUuid,
                spaceUuids: [spaceUuid],
                slug: chart.uuid,
                exploreName: 'orders',
            }),
        ).toEqual([chart.uuid]);
        expect(
            await uuids({
                projectUuid,
                slugs: ['old-slug'],
                exploreNames: ['orders'],
            }),
        ).toEqual([chart.uuid]);
        expect(await uuids({ projectUuid, spaceUuids: [] })).toEqual([]);
        expect(await uuids({ projectUuid, slug: other.uuid })).toEqual([]);
        expect(await uuids({ exploreNames: ['orders'] })).toEqual(
            [chart.uuid, other.uuid].sort(),
        );
    });

    test('soft-deleted charts and spaces remain excluded', async () => {
        const chart = await addChart();
        await version(chart.id, 'orders');
        await database<FixtureRow>('saved_queries')
            .where({ saved_query_id: chart.id })
            .update({ deleted_at: new Date() });
        expect(await uuids({ projectUuid, exploreName: 'orders' })).toEqual([]);
        await database<FixtureRow>('saved_queries')
            .where({ saved_query_id: chart.id })
            .update({ deleted_at: null });
        await database<FixtureRow>('spaces')
            .where({ space_id: 1 })
            .update({ deleted_at: new Date() });
        expect(await uuids({ projectUuid, exploreNames: ['orders'] })).toEqual(
            [],
        );
    });

    test('empty explore lists and simultaneous explore filters are intersections', async () => {
        const chart = await addChart();
        await version(chart.id, 'orders');
        expect(await uuids({ projectUuid, exploreNames: [] })).toEqual([]);
        expect(
            await uuids({
                projectUuid,
                exploreName: 'orders',
                exploreNames: ['customers'],
            }),
        ).toEqual([]);
        expect(
            await uuids({
                projectUuid,
                exploreName: 'orders',
                exploreNames: ['orders', 'customers'],
            }),
        ).toEqual([chart.uuid]);
    });
});
