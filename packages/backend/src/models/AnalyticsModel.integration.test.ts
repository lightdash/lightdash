import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    chartViewsSql,
    chartWeeklyAverageQueriesSql,
    chartWeeklyQueryingUsersSql,
    numberWeeklyQueryingUsersSql,
    tableMostCreatedChartsSql,
    tableMostQueriesSql,
} from './AnalyticsModelSql';

type ChartRow = {
    saved_query_id: number;
    saved_query_uuid: string;
    project_uuid: string;
    space_id: number | null;
    dashboard_uuid: string | null;
    deleted_at: Date | null;
    name: string;
    slug: string;
};

type FixtureTables = {
    projects: {
        project_id: number;
        project_uuid: string;
        organization_id: number;
    };
    spaces: {
        space_id: number;
        project_id: number;
        name: string;
        deleted_at: Date | null;
    };
    dashboards: {
        dashboard_uuid: string;
        project_uuid: string;
        space_id: number;
        name: string;
        slug: string;
        deleted_at: Date | null;
    };
    users: {
        user_uuid: string;
        first_name: string;
        last_name: string;
        created_at: Date;
    };
    analytics_chart_views: {
        chart_uuid: string;
        user_uuid: string | null;
        timestamp: Date;
        context: { source: 'dashboard'; dashboardUuid: string } | null;
    };
    saved_queries_versions: {
        saved_query_id: number;
        updated_by_user_uuid: string;
        created_at: Date;
    };
};

describe('AnalyticsModel (PostgreSQL)', () => {
    let database: Knex;
    const schema = `analytics_test_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const otherProjectUuid = randomUUID();
    const dashboardUuid = randomUUID();
    const otherDashboardUuid = randomUUID();
    const spaceViewer = randomUUID();
    const dashboardViewer = randomUUID();
    const inactiveViewer = randomUUID();
    const userUuids = [spaceViewer, dashboardViewer, inactiveViewer];
    const spaceChart: ChartRow = {
        saved_query_id: 1,
        saved_query_uuid: randomUUID(),
        project_uuid: projectUuid,
        space_id: 1,
        dashboard_uuid: null,
        deleted_at: null,
        name: 'Space chart',
        slug: 'space-chart',
    };
    const dashboardChart: ChartRow = {
        ...spaceChart,
        saved_query_id: 2,
        saved_query_uuid: randomUUID(),
        space_id: null,
        dashboard_uuid: dashboardUuid,
        name: 'Dashboard chart',
        slug: 'dashboard-chart',
    };

    const rows = async <T>(sql: string): Promise<T[]> => {
        // Scope the explicitly qualified chart-views query to the fixture schema.
        const result = await database.raw<{ rows: T[] }>(
            sql.replaceAll(
                'public.analytics_chart_views',
                `${schema}.analytics_chart_views`,
            ),
        );
        return result.rows;
    };

    const table = <T extends keyof FixtureTables>(name: T) =>
        database<FixtureTables[T]>(name);

    beforeAll(async () => {
        const connection =
            process.env.ANALYTICS_TEST_DATABASE_URL ??
            process.env.PGCONNECTIONURI;
        if (!connection) {
            throw new Error(
                'Set ANALYTICS_TEST_DATABASE_URL or PGCONNECTIONURI for PostgreSQL tests',
            );
        }
        database = knex({
            client: 'pg',
            connection,
            searchPath: [schema],
            pool: { min: 0, max: 2 },
        });
        await database.schema.createSchema(schema);
        await database.raw(`
            CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid UNIQUE NOT NULL, organization_id integer NOT NULL);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, project_id integer REFERENCES projects, name text, deleted_at timestamp);
            CREATE TABLE dashboards (dashboard_uuid uuid PRIMARY KEY, project_uuid uuid, space_id integer REFERENCES spaces, name text, slug text, deleted_at timestamp);
            CREATE TABLE users (user_uuid uuid PRIMARY KEY, first_name text, last_name text, created_at timestamp);
            CREATE TABLE saved_queries (
                saved_query_id integer PRIMARY KEY, saved_query_uuid uuid UNIQUE NOT NULL,
                project_uuid uuid NOT NULL REFERENCES projects(project_uuid), space_id integer REFERENCES spaces,
                dashboard_uuid uuid REFERENCES dashboards, deleted_at timestamp, name text, slug text
            );
            CREATE TABLE saved_queries_versions (saved_query_id integer REFERENCES saved_queries, updated_by_user_uuid uuid REFERENCES users, created_at timestamp);
            CREATE TABLE analytics_chart_views (chart_uuid uuid REFERENCES saved_queries(saved_query_uuid), user_uuid uuid REFERENCES users, timestamp timestamp NOT NULL, context jsonb);
        `);
        await table('projects').insert([
            { project_id: 1, project_uuid: projectUuid, organization_id: 1 },
            {
                project_id: 2,
                project_uuid: otherProjectUuid,
                organization_id: 1,
            },
        ]);
        await table('spaces').insert([
            { space_id: 1, project_id: 1, name: 'Main space' },
            { space_id: 2, project_id: 2, name: 'Other space' },
        ]);
        await table('dashboards').insert([
            {
                dashboard_uuid: dashboardUuid,
                project_uuid: projectUuid,
                space_id: 1,
                name: 'Dashboard',
                slug: 'dashboard',
            },
            {
                dashboard_uuid: otherDashboardUuid,
                project_uuid: otherProjectUuid,
                space_id: 2,
                name: 'Other dashboard',
                slug: 'other-dashboard',
            },
        ]);
        await table('users').insert(
            userUuids.map((userUuid, index) => ({
                user_uuid: userUuid,
                first_name: `Viewer ${index}`,
                last_name: 'Test',
                created_at: database.raw("CURRENT_DATE - interval '100 days'"),
            })),
        );
    });

    beforeEach(async () => {
        await database.raw(
            'TRUNCATE analytics_chart_views, saved_queries_versions, saved_queries',
        );
        await database<ChartRow>('saved_queries').insert([
            spaceChart,
            dashboardChart,
        ]);
        await table('analytics_chart_views').insert([
            {
                chart_uuid: spaceChart.saved_query_uuid,
                user_uuid: spaceViewer,
                timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
            },
            {
                chart_uuid: dashboardChart.saved_query_uuid,
                user_uuid: dashboardViewer,
                timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
                context: { source: 'dashboard', dashboardUuid },
            },
            {
                chart_uuid: dashboardChart.saved_query_uuid,
                user_uuid: dashboardViewer,
                timestamp: database.raw(
                    "CURRENT_DATE - interval '1 day' + interval '1 second'",
                ),
                context: { source: 'dashboard', dashboardUuid },
            },
        ]);
        await table('saved_queries_versions').insert([
            {
                saved_query_id: 1,
                updated_by_user_uuid: spaceViewer,
                created_at: database.raw("CURRENT_DATE - interval '1 day'"),
            },
            {
                saved_query_id: 2,
                updated_by_user_uuid: dashboardViewer,
                created_at: database.raw("CURRENT_DATE - interval '1 day'"),
            },
        ]);
    });

    afterAll(async () => {
        if (database) {
            await database.schema.dropSchemaIfExists(schema, true);
            await database.destroy();
        }
    });

    it('includes dashboard-only viewers in weekly querying users', async () => {
        expect(
            await rows(numberWeeklyQueryingUsersSql(userUuids, projectUuid)),
        ).toEqual([{ count: '66' }]);
    });

    it('counts repeated chart views for the most-active users', async () => {
        const result = await rows<{ user_uuid: string; count: string }>(
            tableMostQueriesSql(userUuids, projectUuid),
        );
        expect(
            result.map(({ user_uuid, count }) => ({ user_uuid, count })),
        ).toEqual([
            { user_uuid: dashboardViewer, count: '2' },
            { user_uuid: spaceViewer, count: '1' },
        ]);
    });

    it('includes dashboard chart versions in chart-update counts', async () => {
        const result = await rows<{ user_uuid: string; count: string }>(
            tableMostCreatedChartsSql(userUuids, projectUuid),
        );
        expect(result).toHaveLength(2);
        expect(result).toContainEqual(
            expect.objectContaining({ user_uuid: dashboardViewer, count: '1' }),
        );
    });

    it('includes dashboard views in rolling histories without changing distinct-chart counting', async () => {
        const querying = await rows<{
            num_7d_active_users: string;
            percent_7d_active_users: string;
        }>(chartWeeklyQueryingUsersSql(userUuids, projectUuid));
        const averages = await rows<{
            average_number_of_weekly_queries_per_user: string;
        }>(chartWeeklyAverageQueriesSql(userUuids, projectUuid));
        expect(querying[0]).toMatchObject({
            num_7d_active_users: '2',
            percent_7d_active_users: '66',
        });
        expect(averages[0].average_number_of_weekly_queries_per_user).toBe(
            '1.00',
        );
    });

    it('excludes other projects, deleted charts, and ownerless legacy charts', async () => {
        const excluded: ChartRow[] = [
            {
                ...spaceChart,
                saved_query_id: 3,
                saved_query_uuid: randomUUID(),
                project_uuid: otherProjectUuid,
                space_id: 2,
            },
            {
                ...dashboardChart,
                saved_query_id: 4,
                saved_query_uuid: randomUUID(),
                project_uuid: otherProjectUuid,
                dashboard_uuid: otherDashboardUuid,
            },
            {
                ...spaceChart,
                saved_query_id: 5,
                saved_query_uuid: randomUUID(),
                deleted_at: new Date(),
            },
            {
                ...dashboardChart,
                saved_query_id: 6,
                saved_query_uuid: randomUUID(),
                deleted_at: new Date(),
            },
            {
                ...spaceChart,
                saved_query_id: 7,
                saved_query_uuid: randomUUID(),
                space_id: null,
            },
        ];
        await database<ChartRow>('saved_queries').insert(excluded);
        await table('analytics_chart_views').insert(
            excluded.map((chart) => ({
                chart_uuid: chart.saved_query_uuid,
                user_uuid: inactiveViewer,
                timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
            })),
        );
        expect(
            await rows(numberWeeklyQueryingUsersSql(userUuids, projectUuid)),
        ).toEqual([{ count: '66' }]);
        expect(
            await rows(tableMostQueriesSql(userUuids, projectUuid)),
        ).toHaveLength(2);
        const querying = await rows<{ num_7d_active_users: string }>(
            chartWeeklyQueryingUsersSql(userUuids, projectUuid),
        );
        expect(querying[0].num_7d_active_users).toBe('2');
        const charts = await rows<{ uuid: string }>(chartViewsSql(projectUuid));
        expect(charts.map(({ uuid }) => uuid).sort()).toEqual(
            [
                spaceChart.saved_query_uuid,
                dashboardChart.saved_query_uuid,
            ].sort(),
        );
    });

    it.each([
        ['the same organization', 1],
        ['another organization', 2],
    ] as const)(
        'isolates shared-user activity in another project in %s',
        async (_description, organizationId) => {
            await table('projects')
                .where('project_uuid', otherProjectUuid)
                .update({ organization_id: organizationId });
            const queries = [
                numberWeeklyQueryingUsersSql(userUuids, projectUuid),
                tableMostQueriesSql(userUuids, projectUuid),
                tableMostCreatedChartsSql(userUuids, projectUuid),
                chartWeeklyQueryingUsersSql(userUuids, projectUuid),
                chartWeeklyAverageQueriesSql(userUuids, projectUuid),
                chartViewsSql(projectUuid),
            ];
            const readActivity = () =>
                Promise.all(
                    queries.map(async (sql) =>
                        (await rows(sql))
                            .map((row) => JSON.stringify(row))
                            .sort(),
                    ),
                );
            const before = await readActivity();
            const otherCharts: ChartRow[] = [
                {
                    ...spaceChart,
                    saved_query_id: 3,
                    saved_query_uuid: randomUUID(),
                    project_uuid: otherProjectUuid,
                    space_id: 2,
                },
                {
                    ...dashboardChart,
                    saved_query_id: 4,
                    saved_query_uuid: randomUUID(),
                    project_uuid: otherProjectUuid,
                    dashboard_uuid: otherDashboardUuid,
                },
            ];
            await database<ChartRow>('saved_queries').insert(otherCharts);
            await table('analytics_chart_views').insert(
                otherCharts.map((chart) => ({
                    chart_uuid: chart.saved_query_uuid,
                    user_uuid: spaceViewer,
                    timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
                })),
            );
            await table('saved_queries_versions').insert(
                otherCharts.map((chart) => ({
                    saved_query_id: chart.saved_query_id,
                    updated_by_user_uuid: spaceViewer,
                    created_at: database.raw("CURRENT_DATE - interval '1 day'"),
                })),
            );

            expect(await readActivity()).toEqual(before);
            const otherActivity = await rows<{
                user_uuid: string;
                count: string;
            }>(tableMostQueriesSql(userUuids, otherProjectUuid));
            expect(otherActivity).toEqual([
                expect.objectContaining({ user_uuid: spaceViewer, count: '2' }),
            ]);
            const otherViews = await rows<{ uuid: string }>(
                chartViewsSql(otherProjectUuid),
            );
            expect(otherViews.map(({ uuid }) => uuid).sort()).toEqual(
                otherCharts
                    .map(({ saved_query_uuid }) => saved_query_uuid)
                    .sort(),
            );
        },
    );

    it('includes anonymous dashboard views only in chart-level totals', async () => {
        await table('analytics_chart_views').insert({
            chart_uuid: dashboardChart.saved_query_uuid,
            user_uuid: null,
            timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
        });
        expect(await rows(chartViewsSql(projectUuid))).toContainEqual({
            uuid: dashboardChart.saved_query_uuid,
            name: dashboardChart.name,
            slug: dashboardChart.slug,
            count: '3',
        });
        expect(
            await rows(numberWeeklyQueryingUsersSql(userUuids, projectUuid)),
        ).toEqual([{ count: '66' }]);
    });

    it('keeps historical views when a dashboard chart moves to a space', async () => {
        const before = await rows(chartViewsSql(projectUuid));
        await database<ChartRow>('saved_queries')
            .where('saved_query_uuid', dashboardChart.saved_query_uuid)
            .update({ space_id: 1, dashboard_uuid: null });
        expect(await rows(chartViewsSql(projectUuid))).toEqual(before);
        expect(before).toHaveLength(2);
    });
});
