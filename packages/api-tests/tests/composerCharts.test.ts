import {
    ChartType,
    DashboardTileTypes,
    FeatureFlags,
    FieldType,
    QuerySourceType,
    SEED_PROJECT,
    type ComposerChart,
    type CreateComposerChart,
    type Dashboard,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { anotherLogin, login, loginAsViewer } from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const chartsUrl = `/api/v2/projects/${projectUuid}/composer-charts`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;

const composerChartBody = (dashboardUuid: string): CreateComposerChart => ({
    dashboardUuid,
    name: 'Orders by status',
    description: null,
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'orders_status', fieldType: FieldType.DIMENSION },
            {
                reference: 'orders_total_order_amount',
                fieldType: FieldType.METRIC,
            },
        ],
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_total_order_amount'],
                },
                eChartsConfig: {},
            },
        },
        pivotConfig: null,
        tableConfig: {
            columnOrder: ['orders_status', 'orders_total_order_amount'],
        },
    },
});

describe('Composer charts', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let clearFlag = false;

    const createDashboard = async () => {
        const resp = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName('Composer dashboard'), tiles: [], tabs: [] },
        );
        expect(resp.status).toBe(201);
        tracker.trackDashboard(resp.body.results.uuid);
        return resp.body.results;
    };

    const createChart = async (dashboardUuid: string) => {
        const resp = await admin.post<Body<ComposerChart>>(
            chartsUrl,
            composerChartBody(dashboardUuid),
        );
        expect(resp.status).toBe(201);
        return resp.body.results;
    };

    const addComposerTile = (dashboard: Dashboard, composerChartUuid: string) =>
        admin.patch<Body<Dashboard>>(
            `/api/v1/dashboards/${dashboard.uuid}`,
            {
                tiles: [
                    {
                        uuid: randomUUID(),
                        type: DashboardTileTypes.COMPOSER_CHART,
                        x: 0,
                        y: 0,
                        h: 9,
                        w: 12,
                        tabUuid: null,
                        properties: {
                            title: 'Orders',
                            composerChartUuid,
                            chartName: null,
                        },
                    },
                ],
                filters: dashboard.filters,
                tabs: dashboard.tabs,
            },
            { failOnStatusCode: false },
        );

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
        if (clearFlag) expect((await admin.delete(flagUrl)).status).toBe(200);
    });

    it('saves a chart onto a dashboard', async () => {
        const dashboard = await createDashboard();
        const chart = await createChart(dashboard.uuid);
        expect(chart).toMatchObject({
            projectUuid,
            dashboardUuid: dashboard.uuid,
            name: 'Orders by status',
            slug: expect.stringMatching(/^orders-by-status/),
            pipeline: composerChartBody(dashboard.uuid).pipeline,
            chart: composerChartBody(dashboard.uuid).chart,
        });

        const updated = await addComposerTile(dashboard, chart.uuid);
        expect(updated.status).toBe(200);
        const loaded = await admin.get<Body<Dashboard>>(
            `/api/v1/dashboards/${dashboard.uuid}`,
        );
        expect(loaded.body.results.tiles).toEqual([
            expect.objectContaining({
                type: DashboardTileTypes.COMPOSER_CHART,
                properties: expect.objectContaining({
                    composerChartUuid: chart.uuid,
                    chartName: 'Orders by status',
                }),
            }),
        ]);
    });

    it('lets a dashboard viewer read the chart, and no one from another organization', async () => {
        const dashboard = await createDashboard();
        const chart = await createChart(dashboard.uuid);

        const viewer = await loginAsViewer();
        const read = await viewer.get<Body<ComposerChart>>(
            `${chartsUrl}/${chart.uuid}`,
        );
        expect(read.status).toBe(200);
        expect(read.body.results.pipeline).toEqual(chart.pipeline);

        const outsider = await anotherLogin();
        const refused = await outsider.get(`${chartsUrl}/${chart.uuid}`, {
            failOnStatusCode: false,
        });
        expect(refused.status).toBe(403);
    });

    it('refuses a tile naming a chart another dashboard owns', async () => {
        const owner = await createDashboard();
        const chart = await createChart(owner.uuid);
        const other = await createDashboard();

        const refused = await addComposerTile(other, chart.uuid);
        expect(refused.status).toBe(404);
    });

    it('refuses a viewer creating a chart', async () => {
        const dashboard = await createDashboard();
        const viewer = await loginAsViewer();
        const refused = await viewer.post(
            chartsUrl,
            composerChartBody(dashboard.uuid),
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(403);
    });

    it('refuses a custom chart type by name', async () => {
        const dashboard = await createDashboard();
        const body = composerChartBody(dashboard.uuid);
        const refused = await admin.post<{ error: { message: string } }>(
            chartsUrl,
            {
                ...body,
                chart: {
                    ...body.chart,
                    chartConfig: { type: ChartType.DATA_APP_VIZ },
                },
            },
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(400);
        expect(refused.body.error.message).toContain('custom chart types');
    });
});
