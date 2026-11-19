import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    MetricType,
    SEED_ORG_1,
    SEED_PROJECT,
    type AdditionalMetric,
    type CreateSavedChart,
    type Dashboard,
    type MetricQuery,
    type SavedChart,
    type Space,
} from '@lightdash/common';
import { randomInt } from 'crypto';
import { ApiClient, Body } from '../helpers/api-client';
import {
    login,
    loginAsEditor,
    loginWithEmail,
    loginWithPermissions,
} from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}`;

// Unique per test, so no chart the editor can view already holds it
const uniqueSql = () => `(SELECT ${randomInt(1_000_000_000)} + 1)`;

const metric = (sql: string, table = 'orders'): AdditionalMetric => ({
    name: 'custom_total',
    label: 'Custom total',
    table,
    type: MetricType.SUM,
    sql,
});

const metricQuery = (overrides: Partial<MetricQuery>): MetricQuery => ({
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    ...overrides,
});

const withMetric = (
    sql: string,
    { table = 'orders', exploreName = 'orders' } = {},
) =>
    metricQuery({
        exploreName,
        dimensions: exploreName === 'orders' ? ['orders_status'] : [],
        metrics: [`${table}_custom_total`],
        additionalMetrics: [metric(sql, table)],
    });

const metricRefusal =
    'Custom metrics written in SQL need permission to manage custom fields: Custom total';

const customSqlQueries: [string, () => MetricQuery, string][] = [
    [
        'a custom metric written in SQL',
        () => withMetric(uniqueSql()),
        metricRefusal,
    ],
    [
        'a custom SQL dimension',
        () =>
            metricQuery({
                customDimensions: [
                    {
                        id: 'custom_sql',
                        name: 'Custom SQL',
                        table: 'orders',
                        type: CustomDimensionType.SQL,
                        sql: "'value'",
                        dimensionType: DimensionType.STRING,
                    },
                ],
            }),
        'User cannot save queries with custom SQL dimensions',
    ],
    [
        'a SQL table calculation',
        () =>
            metricQuery({
                tableCalculations: [
                    { name: 'custom_sql', displayName: 'Custom SQL', sql: '1' },
                ],
            }),
        'User cannot save queries with SQL table calculations',
    ],
];

const rolesUrl = `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles`;
const assignmentsUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/roles/assignments/user`;

type SaveResponse = Body<SavedChart> & { error: { message: string } };

describe('Saving a chart with custom SQL', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let editor: ApiClient;
    // The editor's scopes plus the two custom SQL scopes, as a custom role
    let scopedEditor: ApiClient;
    let scopedRole: { roleUuid: string; userUuid: string } | undefined;
    let space: Space;
    // Only the admin can view it
    let privateSpace: Space;

    const chartBody = (
        query: MetricQuery,
        target: Partial<CreateSavedChart> = {},
    ): CreateSavedChart =>
        ({
            name: uniqueName('Custom SQL save'),
            tableName: query.exploreName,
            metricQuery: query,
            chartConfig: { type: ChartType.TABLE },
            tableConfig: { columnOrder: [] },
            spaceUuid: space.uuid,
            ...target,
        }) as CreateSavedChart;

    const createAs = (
        client: ApiClient,
        query: MetricQuery,
        target: Partial<CreateSavedChart> = {},
    ) =>
        client.post<SaveResponse>(
            `${projectUrl}/saved`,
            chartBody(query, target),
            { failOnStatusCode: false },
        );

    const saveVersionAs = (
        client: ApiClient,
        chartUuid: string,
        query: MetricQuery,
        chartConfig: SavedChart['chartConfig'] = { type: ChartType.TABLE },
    ) =>
        client.post<SaveResponse>(
            `/api/v1/saved/${chartUuid}/version`,
            {
                tableName: query.exploreName,
                metricQuery: query,
                chartConfig,
                tableConfig: { columnOrder: [] },
            },
            { failOnStatusCode: false },
        );

    const authorAsAdmin = async (
        query: MetricQuery,
        target: Partial<CreateSavedChart> = {},
    ) => {
        const authored = await createAs(admin, query, target);
        expect(authored.status).toBe(200);
        tracker.trackChart(authored.body.results.uuid);
        return authored.body.results.uuid;
    };

    const expectSaved = (response: { status: number; body: SaveResponse }) => {
        expect(response.status).toBe(200);
        tracker.trackChart(response.body.results.uuid);
    };

    const expectMetricRefused = (response: {
        status: number;
        body: SaveResponse;
    }) => {
        expect(response.status).toBe(403);
        expect(response.body.error.message).toBe(metricRefusal);
    };

    beforeAll(async () => {
        admin = await login();
        editor = await loginAsEditor();
        const created = await admin.post<Body<Space>>(`${projectUrl}/spaces`, {
            name: uniqueName('Custom SQL save'),
            inheritParentPermissions: true,
        });
        space = created.body.results;
        tracker.trackSpace(space.uuid);
        const createdPrivate = await admin.post<Body<Space>>(
            `${projectUrl}/spaces`,
            {
                name: uniqueName('Custom SQL save private'),
                inheritParentPermissions: false,
            },
        );
        privateSpace = createdPrivate.body.results;
        tracker.trackSpace(privateSpace.uuid);

        const role = await admin.post<Body<{ roleUuid: string }>>(
            `${rolesUrl}/editor/duplicate`,
            { name: uniqueName('Editor with custom SQL') },
        );
        const { roleUuid } = role.body.results;
        await admin.patch(`${rolesUrl}/${roleUuid}`, {
            scopes: {
                add: [
                    'manage:CustomFields',
                    'manage:CustomSqlTableCalculations',
                ],
                remove: [],
            },
        });
        const { client, email } = await loginWithPermissions('member', []);
        const user =
            await client.get<Body<{ userUuid: string }>>('/api/v1/user');
        const { userUuid } = user.body.results;
        scopedRole = { roleUuid, userUuid };
        await admin.post(`${assignmentsUrl}/${userUuid}`, { roleId: roleUuid });
        scopedEditor = await loginWithEmail(email);
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
        if (scopedRole) {
            await admin.delete(`${assignmentsUrl}/${scopedRole.userUuid}`, {
                failOnStatusCode: false,
            });
            await admin.delete(`${rolesUrl}/${scopedRole.roleUuid}`, {
                failOnStatusCode: false,
            });
        }
    });

    it.each(customSqlQueries)(
        'refuses a new chart with %s for an editor',
        async (_, query, message) => {
            const refused = await createAs(editor, query());

            expect(refused.status).toBe(403);
            expect(refused.body.error.message).toBe(message);
        },
    );

    it.each(customSqlQueries)(
        'saves a new chart with %s for an editor with the custom SQL scopes',
        async (_, query) => {
            expectSaved(await createAs(scopedEditor, query()));
        },
    );

    it('saves a custom metric built from a modelled field', async () => {
        // eslint-disable-next-line no-template-curly-in-string
        expectSaved(await createAs(editor, withMetric('${TABLE}.amount')));
    });

    it('refuses a new version that changes the custom metric SQL, and keeps an unchanged one', async () => {
        const sql = uniqueSql();
        const chartUuid = await authorAsAdmin(withMetric(sql));

        expectMetricRefused(
            await saveVersionAs(editor, chartUuid, withMetric(uniqueSql())),
        );
        expect(
            (await saveVersionAs(editor, chartUuid, withMetric(sql))).status,
        ).toBe(200);
    });

    it('saves a new version that changes the custom metric SQL for an editor with the custom SQL scopes', async () => {
        const chartUuid = await authorAsAdmin(withMetric(uniqueSql()));

        expect(
            (
                await saveVersionAs(
                    scopedEditor,
                    chartUuid,
                    withMetric(uniqueSql()),
                )
            ).status,
        ).toBe(200);
    });

    it('saves a new version that changes a SQL table calculation for an editor with the custom SQL scopes', async () => {
        const chartUuid = await authorAsAdmin(metricQuery({}));

        expect(
            (
                await saveVersionAs(
                    scopedEditor,
                    chartUuid,
                    metricQuery({
                        tableCalculations: [
                            {
                                name: 'custom_sql',
                                displayName: 'Custom SQL',
                                sql: '2',
                            },
                        ],
                    }),
                )
            ).status,
        ).toBe(200);
    });

    describe('custom metric SQL already saved on another chart', () => {
        it('saves a new chart with SQL saved on a chart the editor can view', async () => {
            const sql = uniqueSql();
            await authorAsAdmin(withMetric(sql));

            expectSaved(await createAs(editor, withMetric(sql)));
        });

        it('refuses SQL saved only in a space the editor cannot view', async () => {
            const sql = uniqueSql();
            await authorAsAdmin(withMetric(sql), {
                spaceUuid: privateSpace.uuid,
            });

            expectMetricRefused(await createAs(editor, withMetric(sql)));
        });

        it('refuses SQL saved on a viewable chart of another explore', async () => {
            const sql = uniqueSql();
            await authorAsAdmin(
                withMetric(sql, {
                    table: 'customers',
                    exploreName: 'customers',
                }),
            );

            expectMetricRefused(
                await createAs(editor, withMetric(sql, { table: 'customers' })),
            );
        });

        it('refuses SQL saved on a viewable chart under another table', async () => {
            const sql = uniqueSql();
            await authorAsAdmin(withMetric(sql, { table: 'customers' }));

            expectMetricRefused(await createAs(editor, withMetric(sql)));
        });

        it('refuses SQL that only an older version of a viewable chart holds, to save or to run', async () => {
            const sql = uniqueSql();
            const chartUuid = await authorAsAdmin(withMetric(sql));
            expect(
                (await saveVersionAs(admin, chartUuid, withMetric(uniqueSql())))
                    .status,
            ).toBe(200);

            expectMetricRefused(await createAs(editor, withMetric(sql)));
            expectMetricRefused(
                await saveVersionAs(editor, chartUuid, withMetric(sql)),
            );
            const run = await editor.post(
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
                { context: 'exploreView', query: withMetric(sql) },
                { failOnStatusCode: false },
            );
            expect(run.status).toBe(403);
        });

        it('refuses SQL that only a deleted chart holds', async () => {
            const sql = uniqueSql();
            const chartUuid = await authorAsAdmin(withMetric(sql));
            await admin.delete(`/api/v1/saved/${chartUuid}`);

            expectMetricRefused(await createAs(editor, withMetric(sql)));
        });
    });

    describe('restoring an older version', () => {
        const firstVersion = async (chartUuid: string) => {
            const history = await admin.get<
                Body<{ history: { versionUuid: string; createdAt: string }[] }>
            >(`/api/v1/saved/${chartUuid}/history`);
            return [...history.body.results.history].sort((a, b) =>
                a.createdAt.localeCompare(b.createdAt),
            )[0].versionUuid;
        };

        const rollbackAs = async (client: ApiClient, chartUuid: string) =>
            client.post(
                `/api/v1/saved/${chartUuid}/rollback/${await firstVersion(chartUuid)}/`,
                undefined,
                { failOnStatusCode: false },
            );

        const currentQuery = async (chartUuid: string) =>
            (await admin.get<Body<SavedChart>>(`/api/v1/saved/${chartUuid}`))
                .body.results.metricQuery;

        it.each(customSqlQueries)(
            'refuses an editor a chart rollback that brings back %s, and lets an editor with the custom SQL scopes',
            async (_, query) => {
                const chartUuid = await authorAsAdmin(query());
                expect(
                    (await saveVersionAs(admin, chartUuid, metricQuery({})))
                        .status,
                ).toBe(200);

                expect((await rollbackAs(editor, chartUuid)).status).toBe(403);
                const kept = await currentQuery(chartUuid);
                expect(kept.additionalMetrics ?? []).toEqual([]);
                expect(kept.customDimensions ?? []).toEqual([]);
                expect(kept.tableCalculations).toEqual([]);

                expect((await rollbackAs(scopedEditor, chartUuid)).status).toBe(
                    200,
                );
            },
        );

        it('lets an editor run an older version whose custom SQL was removed', async () => {
            const chartUuid = await authorAsAdmin(withMetric(uniqueSql()));
            expect(
                (await saveVersionAs(admin, chartUuid, metricQuery({}))).status,
            ).toBe(200);

            const run = await editor.post(
                `/api/v1/saved/${chartUuid}/version/${await firstVersion(chartUuid)}/results`,
                undefined,
                { failOnStatusCode: false },
            );
            expect(run.status).toBe(200);
        });

        it('lets an editor roll back a chart whose custom SQL is unchanged', async () => {
            const query = withMetric(uniqueSql());
            const chartUuid = await authorAsAdmin(query);
            expect(
                (
                    await saveVersionAs(admin, chartUuid, {
                        ...query,
                        limit: 25,
                    })
                ).status,
            ).toBe(200);

            expect((await rollbackAs(editor, chartUuid)).status).toBe(200);
            expect((await currentQuery(chartUuid)).limit).toBe(10);
        });

        describe('through its dashboard', () => {
            const tableCalculation = (sql: string) =>
                metricQuery({
                    tableCalculations: [
                        { name: 'custom_sql', displayName: 'Custom SQL', sql },
                    ],
                });

            // A dashboard whose chart held `before` at its first version and holds `after` now
            const dashboardWithChart = async (
                before: MetricQuery,
                after: MetricQuery,
            ) => {
                const created = await admin.post<Body<Dashboard>>(
                    `${projectUrl}/dashboards`,
                    {
                        name: uniqueName('Custom SQL rollback'),
                        spaceUuid: space.uuid,
                        tiles: [],
                        tabs: [],
                    },
                );
                tracker.trackDashboard(created.body.results.uuid);
                const chartUuid = await authorAsAdmin(before, {
                    dashboardUuid: created.body.results.uuid,
                    spaceUuid: null,
                });
                const tile = {
                    type: 'saved_chart',
                    x: 0,
                    y: 0,
                    h: 9,
                    w: 12,
                    tabUuid: null,
                    properties: {
                        savedChartUuid: chartUuid,
                        belongsToDashboard: true,
                        title: 'Chart',
                    },
                };
                const first = await admin.patch<Body<Dashboard>>(
                    `/api/v1/dashboards/${created.body.results.uuid}`,
                    {
                        tiles: [tile],
                        filters: created.body.results.filters,
                        tabs: [],
                    },
                );
                expect(
                    (await saveVersionAs(admin, chartUuid, after)).status,
                ).toBe(200);
                const latest = await admin.patch<Body<Dashboard>>(
                    `/api/v1/dashboards/${created.body.results.uuid}`,
                    {
                        tiles: [
                            {
                                ...tile,
                                uuid: first.body.results.tiles[0].uuid,
                                properties: {
                                    ...tile.properties,
                                    title: 'Renamed',
                                },
                            },
                        ],
                        filters: created.body.results.filters,
                        tabs: [],
                    },
                );
                return {
                    dashboardUuid: created.body.results.uuid,
                    chartUuid,
                    firstVersion: first.body.results.versionUuid,
                    latestVersion: latest.body.results.versionUuid,
                };
            };

            const rollbackDashboardAs = (
                client: ApiClient,
                dashboardUuid: string,
                versionUuid: string,
            ) =>
                client.post(
                    `/api/v1/dashboards/${dashboardUuid}/rollback/${versionUuid}`,
                    undefined,
                    { failOnStatusCode: false },
                );

            it('refuses an editor a dashboard rollback that brings back a SQL table calculation', async () => {
                const restore = await dashboardWithChart(
                    tableCalculation('1'),
                    metricQuery({}),
                );

                expect(
                    (
                        await rollbackDashboardAs(
                            editor,
                            restore.dashboardUuid,
                            restore.firstVersion,
                        )
                    ).status,
                ).toBe(403);
                expect(
                    (await currentQuery(restore.chartUuid)).tableCalculations,
                ).toEqual([]);
                const dashboard = await admin.get<Body<Dashboard>>(
                    `/api/v1/dashboards/${restore.dashboardUuid}`,
                );
                expect(dashboard.body.results.versionUuid).toBe(
                    restore.latestVersion,
                );

                expect(
                    (
                        await rollbackDashboardAs(
                            admin,
                            restore.dashboardUuid,
                            restore.firstVersion,
                        )
                    ).status,
                ).toBe(200);
                expect(
                    (await currentQuery(restore.chartUuid)).tableCalculations,
                ).toHaveLength(1);
            });

            it('lets an editor roll back a dashboard whose chart keeps its custom SQL', async () => {
                const query = tableCalculation('1');
                const restore = await dashboardWithChart(query, {
                    ...query,
                    limit: 25,
                });

                expect(
                    (
                        await rollbackDashboardAs(
                            editor,
                            restore.dashboardUuid,
                            restore.firstVersion,
                        )
                    ).status,
                ).toBe(200);
                expect((await currentQuery(restore.chartUuid)).limit).toBe(10);
            });

            it('restores a dashboard when two rollbacks race, asking a conflicting one to retry', async () => {
                const query = tableCalculation('1');
                const restore = await dashboardWithChart(query, {
                    ...query,
                    limit: 25,
                });

                const statuses = await Promise.all(
                    [admin, editor].map(
                        async (client) =>
                            (
                                await rollbackDashboardAs(
                                    client,
                                    restore.dashboardUuid,
                                    restore.firstVersion,
                                )
                            ).status,
                    ),
                );

                expect(statuses).toContain(200);
                expect(
                    statuses.every((status) => [200, 409].includes(status)),
                ).toBe(true);
                expect((await currentQuery(restore.chartUuid)).limit).toBe(10);
            });
        });
    });

    describe("an editor working on an admin's chart that holds a custom metric written in SQL", () => {
        let sql: string;
        let chartUuid: string;

        beforeAll(async () => {
            sql = uniqueSql();
            chartUuid = await authorAsAdmin(withMetric(sql));
        });

        it('runs the query', async () => {
            const run = await editor.post(
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
                { context: 'exploreView', query: withMetric(sql) },
                { failOnStatusCode: false },
            );

            expect(run.status).toBe(200);
        });

        it('saves a new version with other changes', async () => {
            const changed = await saveVersionAs(
                editor,
                chartUuid,
                { ...withMetric(sql), limit: 25, sorts: [] },
                {
                    type: ChartType.TABLE,
                    config: { showColumnCalculation: true },
                },
            );

            expect(changed.status).toBe(200);
        });

        it("saves a new version that changes the metric's label, format and aggregation", async () => {
            const query = withMetric(sql);
            const changed = await saveVersionAs(editor, chartUuid, {
                ...query,
                additionalMetrics: [
                    {
                        ...metric(sql),
                        label: 'Average total',
                        type: MetricType.AVERAGE,
                        round: 1,
                    },
                ],
            });

            expect(changed.status).toBe(200);
        });

        it('saves it as a new chart', async () => {
            expectSaved(await createAs(editor, withMetric(sql)));
        });

        it('saves it to a dashboard', async () => {
            const dashboard = await admin.post<Body<Dashboard>>(
                `${projectUrl}/dashboards`,
                {
                    name: uniqueName('Custom SQL save'),
                    spaceUuid: space.uuid,
                    tiles: [],
                    tabs: [],
                },
            );
            expect(dashboard.status).toBe(201);
            tracker.trackDashboard(dashboard.body.results.uuid);

            expectSaved(
                await createAs(editor, withMetric(sql), {
                    dashboardUuid: dashboard.body.results.uuid,
                    spaceUuid: null,
                }),
            );
        });

        it('duplicates it', async () => {
            const duplicated = await editor.post<SaveResponse>(
                `${projectUrl}/saved?duplicateFrom=${chartUuid}`,
                { chartName: uniqueName('Custom SQL copy'), chartDesc: '' },
                { failOnStatusCode: false },
            );

            expectSaved(duplicated);
        });
    });
});
