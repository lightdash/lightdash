import {
    ChartType,
    CustomDimensionType,
    DimensionType,
    MetricType,
    SEED_PROJECT,
    type AdditionalMetric,
    type CreateSavedChart,
    type MetricQuery,
    type SavedChart,
    type Space,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';
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

describe('Saving a chart with custom SQL as an editor', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let editor: ApiClient;
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
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
    });

    it.each([
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
    ])('refuses a new chart with %s', async (_, query, message) => {
        const refused = await createAs(editor, query);

        expect(refused.status).toBe(403);
        expect(refused.body.error.message).toBe(message);
    });

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
});
