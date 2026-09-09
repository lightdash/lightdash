import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AnalyticsModel } from './AnalyticsModel';
import {
    chartViewsSql,
    chartWeeklyAverageQueriesSql,
    chartWeeklyQueryingUsersSql,
    dashboardViewsSql,
    numberWeeklyQueryingUsersSql,
    tableMostCreatedChartsSql,
    tableMostQueriesSql,
    tableNoQueriesSql,
    userMostViewedDashboardSql,
    usersInProjectSql,
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
    emails: { user_id: number; is_primary: boolean };
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
    analytics_dashboard_views: {
        dashboard_uuid: string;
        user_uuid: string | null;
        timestamp: Date;
    };
    saved_queries_versions: {
        saved_query_id: number;
        updated_by_user_uuid: string;
        created_at: Date;
    };
};

describe('AnalyticsModel (PostgreSQL)', () => {
    let database: Knex;
    let model: AnalyticsModel;
    const schema = `analytics_test_${randomUUID().replaceAll('-', '')}`;
    const projectUuid = randomUUID();
    const organizationUuid = randomUUID();
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

    const rows = async <T>(
        sql: string,
        bindings: Knex.ValueDict = { projectUuid, userUuids, organizationUuid },
    ): Promise<T[]> => {
        const result = await database.raw<{ rows: T[] }>(sql, bindings);
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
        model = new AnalyticsModel({ database });
        await database.schema.createSchema(schema);
        await database.raw(`
            CREATE TABLE projects (project_id integer PRIMARY KEY, project_uuid uuid UNIQUE NOT NULL, organization_id integer NOT NULL);
            CREATE TABLE spaces (space_id integer PRIMARY KEY, project_id integer REFERENCES projects, name text, deleted_at timestamp);
            CREATE TABLE dashboards (dashboard_uuid uuid PRIMARY KEY, project_uuid uuid, space_id integer REFERENCES spaces, name text, slug text, deleted_at timestamp);
            CREATE TABLE users (user_uuid uuid PRIMARY KEY, user_id serial UNIQUE, first_name text, last_name text, created_at timestamp, is_internal boolean DEFAULT false);
            CREATE TABLE emails (user_id integer REFERENCES users(user_id), is_primary boolean);
            CREATE TABLE organizations (organization_id integer PRIMARY KEY, organization_uuid uuid UNIQUE);
            CREATE TABLE organization_memberships (organization_id integer REFERENCES organizations, user_id integer REFERENCES users(user_id), role text, role_uuid uuid);
            CREATE TABLE project_memberships (project_id integer REFERENCES projects, user_id integer REFERENCES users(user_id), role text);
            CREATE TABLE group_memberships (group_uuid uuid, user_id integer REFERENCES users(user_id));
            CREATE TABLE project_group_access (group_uuid uuid, project_uuid uuid REFERENCES projects(project_uuid), role text);
            CREATE TABLE saved_queries (
                saved_query_id integer PRIMARY KEY, saved_query_uuid uuid UNIQUE NOT NULL,
                project_uuid uuid NOT NULL REFERENCES projects(project_uuid), space_id integer REFERENCES spaces,
                dashboard_uuid uuid REFERENCES dashboards, deleted_at timestamp, name text, slug text
            );
            CREATE TABLE saved_queries_versions (saved_query_id integer REFERENCES saved_queries, updated_by_user_uuid uuid REFERENCES users, created_at timestamp);
            CREATE TABLE analytics_chart_views (chart_uuid uuid REFERENCES saved_queries(saved_query_uuid), user_uuid uuid REFERENCES users, timestamp timestamp NOT NULL, context jsonb);
            CREATE TABLE analytics_dashboard_views (dashboard_uuid uuid REFERENCES dashboards, user_uuid uuid REFERENCES users, timestamp timestamp NOT NULL);
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
        await database.raw(
            'INSERT INTO organizations VALUES (1, :organizationUuid)',
            { organizationUuid },
        );
        await database.raw(`
            INSERT INTO emails SELECT user_id, true FROM users;
            INSERT INTO organization_memberships SELECT 1, user_id, 'admin', NULL FROM users;
        `);
    });

    beforeEach(async () => {
        await database.raw(
            'TRUNCATE analytics_chart_views, analytics_dashboard_views, saved_queries_versions, saved_queries, project_memberships, group_memberships, project_group_access',
        );
        await table('spaces').update({ deleted_at: null });
        await table('dashboards').update({ deleted_at: null });
        await table('emails').update({ is_primary: true });
        await table('users').update({
            first_name: 'Viewer',
            created_at: database.raw("CURRENT_DATE - interval '100 days'"),
        });
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

    const userQueries = [
        numberWeeklyQueryingUsersSql,
        tableMostQueriesSql,
        tableMostCreatedChartsSql,
        tableNoQueriesSql,
        chartWeeklyQueryingUsersSql,
        chartWeeklyAverageQueriesSql,
    ];

    it.each([
        ...userQueries,
        chartViewsSql,
        dashboardViewsSql,
        userMostViewedDashboardSql,
        usersInProjectSql,
    ])('rejects SQL syntax in the project binding for %s', async (query) => {
        await expect(
            rows(query(), {
                projectUuid: `${projectUuid}' OR '1' = '1`,
                userUuids,
                organizationUuid,
            }),
        ).rejects.toMatchObject({ code: '22P02' });
    });

    it.each(userQueries)(
        'rejects SQL syntax in user bindings for %s',
        async (query) => {
            await expect(
                rows(query(), {
                    projectUuid,
                    userUuids: [`${spaceViewer}') OR true --`],
                }),
            ).rejects.toMatchObject({ code: '22P02' });
        },
    );

    it('rejects SQL syntax in the organization binding', async () => {
        await expect(
            model.getUserActivity(
                projectUuid,
                `${organizationUuid}' OR true --`,
            ),
        ).rejects.toMatchObject({ code: '22P02' });
    });

    it('executes User Activity with bound parameters and an empty or populated user list', async () => {
        const activity = await model.getUserActivity(
            projectUuid,
            organizationUuid,
        );
        expect(activity).toMatchObject({
            numberUsers: 3,
            numberWeeklyQueryingUsers: 66,
        });
        expect(activity.chartViews).toHaveLength(2);
        await table('emails').update({ is_primary: false });
        expect(
            await model.getUserActivity(projectUuid, organizationUuid),
        ).toMatchObject({
            numberUsers: 0,
            numberWeeklyQueryingUsers: 0,
            tableMostQueries: [],
        });
    });

    it.each(['direct', 'group'] as const)(
        'does not use %s membership roles from another project',
        async (membership) => {
            if (membership === 'direct') {
                await database.raw(
                    `INSERT INTO project_memberships
                     SELECT 2, user_id, 'viewer' FROM users WHERE user_uuid = :spaceViewer`,
                    { spaceViewer },
                );
            } else {
                const groupUuid = randomUUID();
                await database.raw(
                    `INSERT INTO group_memberships
                     SELECT :groupUuid, user_id FROM users WHERE user_uuid = :spaceViewer`,
                    { groupUuid, spaceViewer },
                );
                await database.raw(
                    "INSERT INTO project_group_access VALUES (:groupUuid, :otherProjectUuid, 'viewer')",
                    { groupUuid, otherProjectUuid },
                );
            }
            expect(
                await model.getUserActivity(projectUuid, organizationUuid),
            ).toMatchObject({
                numberUsers: 3,
                numberAdmins: 3,
                numberViewers: 0,
            });
        },
    );

    it.each(['dashboard', 'space'] as const)(
        'excludes activity with a deleted owning %s throughout User Activity',
        async (owner) => {
            await table('analytics_dashboard_views').insert({
                dashboard_uuid: dashboardUuid,
                user_uuid: dashboardViewer,
                timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
            });
            if (owner === 'dashboard') {
                await table('dashboards')
                    .where('dashboard_uuid', dashboardUuid)
                    .update({ deleted_at: new Date() });
            } else {
                await table('spaces')
                    .where('space_id', 1)
                    .update({ deleted_at: new Date() });
            }
            const activity = await model.getUserActivity(
                projectUuid,
                organizationUuid,
            );
            const expectedUsers = owner === 'dashboard' ? [spaceViewer] : [];
            expect(activity.numberWeeklyQueryingUsers).toBe(
                owner === 'dashboard' ? 33 : 0,
            );
            expect(
                activity.tableMostQueries.map(({ userUuid }) => userUuid),
            ).toEqual(expectedUsers);
            expect(
                activity.tableMostCreatedCharts.map(({ userUuid }) => userUuid),
            ).toEqual(expectedUsers);
            expect(activity.chartViews.map(({ uuid }) => uuid)).toEqual(
                owner === 'dashboard' ? [spaceChart.saved_query_uuid] : [],
            );
            expect(
                activity.chartWeeklyQueryingUsers[0].num_7d_active_users,
            ).toBe(owner === 'dashboard' ? '1' : '0');
            expect(activity.dashboardViews).toEqual([]);
            expect(activity.userMostViewedDashboards).toEqual([]);
        },
    );

    it.each(['space', 'dashboard'] as const)(
        'rejects chart activity with an owning %s in another project',
        async (owner) => {
            await database<ChartRow>('saved_queries')
                .where('saved_query_uuid', dashboardChart.saved_query_uuid)
                .update(
                    owner === 'space'
                        ? { space_id: 2, dashboard_uuid: null }
                        : { dashboard_uuid: otherDashboardUuid },
                );
            const activity = await model.getUserActivity(
                projectUuid,
                organizationUuid,
            );
            expect(activity.numberWeeklyQueryingUsers).toBe(33);
            expect(activity.chartViews.map(({ uuid }) => uuid)).toEqual([
                spaceChart.saved_query_uuid,
            ]);
        },
    );

    it('keeps favourite dashboards separate for users with the same first name', async () => {
        await table('analytics_dashboard_views').insert(
            [spaceViewer, dashboardViewer].map((userUuid) => ({
                dashboard_uuid: dashboardUuid,
                user_uuid: userUuid,
                timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
            })),
        );
        const activity = await model.getUserActivity(
            projectUuid,
            organizationUuid,
        );
        expect(
            activity.userMostViewedDashboards
                .map(({ userUuid }) => userUuid)
                .sort(),
        ).toEqual([spaceViewer, dashboardViewer].sort());
    });

    it('uses the latest project chart view for inactivity and ignores other projects', async () => {
        await table('analytics_chart_views')
            .where('user_uuid', spaceViewer)
            .update({
                timestamp: database.raw("CURRENT_DATE - interval '120 days'"),
            });
        await table('analytics_chart_views').insert({
            chart_uuid: dashboardChart.saved_query_uuid,
            user_uuid: dashboardViewer,
            timestamp: database.raw("CURRENT_DATE - interval '180 days'"),
        });
        const otherChart = {
            ...spaceChart,
            saved_query_id: 3,
            saved_query_uuid: randomUUID(),
            project_uuid: otherProjectUuid,
            space_id: 2,
        };
        await database<ChartRow>('saved_queries').insert(otherChart);
        await table('analytics_chart_views').insert({
            chart_uuid: otherChart.saved_query_uuid,
            user_uuid: inactiveViewer,
            timestamp: database.raw("CURRENT_DATE - interval '1 day'"),
        });
        const inactive = await rows<{ user_uuid: string; count: string }>(
            tableNoQueriesSql(),
        );
        expect(
            inactive.map(({ user_uuid, count }) => ({ user_uuid, count })),
        ).toEqual(
            expect.arrayContaining([
                { user_uuid: spaceViewer, count: '120' },
                { user_uuid: inactiveViewer, count: '100' },
            ]),
        );
        expect(inactive).toHaveLength(2);
        await table('users')
            .where('user_uuid', inactiveViewer)
            .update({
                created_at: database.raw("CURRENT_DATE - interval '10 days'"),
            });
        expect(await rows(tableNoQueriesSql())).toHaveLength(1);
    });

    it('includes dashboard-only viewers in weekly querying users', async () => {
        expect(await rows(numberWeeklyQueryingUsersSql())).toEqual([
            { count: '66' },
        ]);
    });

    it('counts repeated chart views for the most-active users', async () => {
        const result = await rows<{ user_uuid: string; count: string }>(
            tableMostQueriesSql(),
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
            tableMostCreatedChartsSql(),
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
        }>(chartWeeklyQueryingUsersSql());
        const averages = await rows<{
            average_number_of_weekly_queries_per_user: string;
        }>(chartWeeklyAverageQueriesSql());
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
        expect(await rows(numberWeeklyQueryingUsersSql())).toEqual([
            { count: '66' },
        ]);
        expect(await rows(tableMostQueriesSql())).toHaveLength(2);
        const querying = await rows<{ num_7d_active_users: string }>(
            chartWeeklyQueryingUsersSql(),
        );
        expect(querying[0].num_7d_active_users).toBe('2');
        const charts = await rows<{ uuid: string }>(chartViewsSql());
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
                numberWeeklyQueryingUsersSql(),
                tableMostQueriesSql(),
                tableMostCreatedChartsSql(),
                chartWeeklyQueryingUsersSql(),
                chartWeeklyAverageQueriesSql(),
                chartViewsSql(),
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
            }>(tableMostQueriesSql(), {
                projectUuid: otherProjectUuid,
                userUuids,
            });
            expect(otherActivity).toEqual([
                expect.objectContaining({ user_uuid: spaceViewer, count: '2' }),
            ]);
            const otherViews = await rows<{ uuid: string }>(chartViewsSql(), {
                projectUuid: otherProjectUuid,
            });
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
        expect(await rows(chartViewsSql())).toContainEqual({
            uuid: dashboardChart.saved_query_uuid,
            name: dashboardChart.name,
            slug: dashboardChart.slug,
            count: '3',
        });
        expect(await rows(numberWeeklyQueryingUsersSql())).toEqual([
            { count: '66' },
        ]);
    });

    it('keeps historical views when a dashboard chart moves to a space', async () => {
        const before = await rows(chartViewsSql());
        await database<ChartRow>('saved_queries')
            .where('saved_query_uuid', dashboardChart.saved_query_uuid)
            .update({ space_id: 1, dashboard_uuid: null });
        expect(await rows(chartViewsSql())).toEqual(before);
        expect(before).toHaveLength(2);
    });
});
