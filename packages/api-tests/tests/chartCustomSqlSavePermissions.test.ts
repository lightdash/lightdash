import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    MetricType,
    SEED_ORG_1,
    SEED_PROJECT,
    type AdditionalMetric,
    type CreateSavedChart,
    type MetricQuery,
    type SavedChart,
    type Space,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import {
    login,
    loginAsEditor,
    loginWithEmail,
    loginWithPermissions,
} from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}`;

const metric = (sql: string): AdditionalMetric => ({
    name: 'custom_total',
    label: 'Custom total',
    table: 'orders',
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

const withMetric = (sql: string) =>
    metricQuery({
        metrics: ['orders_custom_total'],
        additionalMetrics: [metric(sql)],
    });

const customSqlQueries: [string, MetricQuery, string][] = [
    [
        'a custom metric written in SQL',
        withMetric('(SELECT 4242 + 1)'),
        'Custom metrics written in SQL need permission to manage custom fields: Custom total',
    ],
    [
        'a custom SQL dimension',
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

describe('Saving a chart with custom SQL', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let editor: ApiClient;
    // The editor's scopes plus the two custom SQL scopes, as a custom role
    let scopedEditor: ApiClient;
    let scopedRole: { roleUuid: string; userUuid: string } | undefined;
    let space: Space;

    const chartBody = (query: MetricQuery): CreateSavedChart => ({
        name: uniqueName('Custom SQL save'),
        tableName: 'orders',
        metricQuery: query,
        chartConfig: { type: ChartType.TABLE },
        tableConfig: { columnOrder: [] },
        spaceUuid: space.uuid,
    });

    const createAs = (client: ApiClient, query: MetricQuery) =>
        client.post<Body<SavedChart> & { error: { message: string } }>(
            `${projectUrl}/saved`,
            chartBody(query),
            { failOnStatusCode: false },
        );

    beforeAll(async () => {
        admin = await login();
        editor = await loginAsEditor();
        const created = await admin.post<Body<Space>>(`${projectUrl}/spaces`, {
            name: uniqueName('Custom SQL save'),
            inheritParentPermissions: true,
        });
        space = created.body.results;
        tracker.trackSpace(space.uuid);

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
            const refused = await createAs(editor, query);

            expect(refused.status).toBe(403);
            expect(refused.body.error.message).toBe(message);
        },
    );

    it.each(customSqlQueries)(
        'saves a new chart with %s for an editor with the custom SQL scopes',
        async (_, query) => {
            const saved = await createAs(scopedEditor, query);

            expect(saved.status).toBe(200);
            tracker.trackChart(saved.body.results.uuid);
        },
    );

    it('saves a custom metric built from a modelled field', async () => {
        // eslint-disable-next-line no-template-curly-in-string
        const saved = await createAs(editor, withMetric('${TABLE}.amount'));

        expect(saved.status).toBe(200);
        tracker.trackChart(saved.body.results.uuid);
    });

    it('refuses a new version that changes the custom metric SQL, and keeps an unchanged one', async () => {
        const authored = await createAs(admin, withMetric('(SELECT 7)'));
        expect(authored.status).toBe(200);
        const chartUuid = authored.body.results.uuid;
        tracker.trackChart(chartUuid);
        const saveVersion = (sql: string) =>
            editor.post<{ error: { message: string } }>(
                `/api/v1/saved/${chartUuid}/version`,
                {
                    tableName: 'orders',
                    metricQuery: withMetric(sql),
                    chartConfig: { type: ChartType.TABLE },
                    tableConfig: { columnOrder: [] },
                },
                { failOnStatusCode: false },
            );

        const changed = await saveVersion('(SELECT 4242 + 1)');
        expect(changed.status).toBe(403);
        expect(changed.body.error.message).toBe(
            'Custom metrics written in SQL need permission to manage custom fields: Custom total',
        );

        const unchanged = await saveVersion('(SELECT 7)');
        expect(unchanged.status).toBe(200);
    });

    it('saves a new version that changes the custom metric SQL for an editor with the custom SQL scopes', async () => {
        const authored = await createAs(admin, withMetric('(SELECT 7)'));
        expect(authored.status).toBe(200);
        const chartUuid = authored.body.results.uuid;
        tracker.trackChart(chartUuid);

        const changed = await scopedEditor.post(
            `/api/v1/saved/${chartUuid}/version`,
            {
                tableName: 'orders',
                metricQuery: withMetric('(SELECT 4242 + 1)'),
                chartConfig: { type: ChartType.TABLE },
                tableConfig: { columnOrder: [] },
            },
            { failOnStatusCode: false },
        );
        expect(changed.status).toBe(200);
    });
});
