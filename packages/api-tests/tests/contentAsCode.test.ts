import {
    ChartAsCode,
    CustomBinDimension,
    DashboardAsCode,
    PromotionAction,
    SEED_PROJECT,
    SqlChartAsCode,
    type PromotionChanges,
} from '@lightdash/common';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const projectUuid = SEED_PROJECT.project_uuid;

type CodeChange =
    | PromotionChanges['charts'][number]
    | PromotionChanges['dashboards'][number];

const getCreatedUuid = (changes: CodeChange[], label: string) => {
    expect(changes).toHaveLength(1);
    const [change] = changes;
    if (change === undefined) {
        throw new Error(`${label} create response is empty`);
    }
    expect(change.action).toBe(PromotionAction.CREATE);
    return change.data.uuid;
};

// Load YAML fixtures
const fixturesDir = path.resolve(__dirname, '../fixtures');

function loadYamlFixture<T>(filename: string): T {
    const filePath = path.join(fixturesDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content) as T;
}

describe('Charts as Code API', () => {
    let admin: ApiClient;
    let chartAsCode: ChartAsCode;
    let chartUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();
        const fixture = loadYamlFixture<ChartAsCode>('chartAsCode.yml');
        const uniqueId = randomUUID();
        chartAsCode = {
            ...fixture,
            name: `${fixture.name} [${uniqueId}]`,
            slug: `content-as-code-chart-${uniqueId}`,
        };
        const response = await admin.post<
            Body<Pick<PromotionChanges, 'charts'>>
        >(
            `/api/v1/projects/${projectUuid}/code/charts/${chartAsCode.slug}`,
            chartAsCode,
        );
        expect(response.status).toBe(200);
        chartUuid = getCreatedUuid(
            response.body.results.charts,
            'chart as code fixture',
        );
    });

    afterAll(async () => {
        if (chartUuid === null) return;
        const deleteResponse = await admin.delete(`/api/v1/saved/${chartUuid}`);
        expect(deleteResponse.status).toBe(200);
        const getResponse = await admin.get(`/api/v1/saved/${chartUuid}`, {
            failOnStatusCode: false,
        });
        expect(getResponse.status).toBe(404);
    });

    it('make sure the chart is loaded from YML', () => {
        expect(chartAsCode).toBeDefined();
    });

    it('should download charts as code', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/charts`,
        );
        expect(response.status).toBe(200);

        const { results } = response.body;

        expect(results).toBeDefined();
        expect(results.charts).toBeInstanceOf(Array);
        expect(results.charts.length).toBeGreaterThan(0);

        // These checks only work if all charts fit in one page (< 100)
        if (results.charts.length < 100) {
            const chart = results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            expect(chart).toBeDefined();
            expect(results.total).toBe(results.charts.length);
        }
    });

    it('should download charts as code by slug', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/charts?ids=${chartAsCode.slug}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.charts.length).toBe(1);
        const chart = response.body.results.charts.find(
            (c: { slug: string }) => c.slug === chartAsCode.slug,
        );
        expect(chart).toBeDefined();
        expect(response.body.results.missingIds).toBeInstanceOf(Array);
        expect(response.body.results.missingIds.length).toBe(0);
    });

    it('should download charts as code with offset', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/charts?offset=5`,
        );
        expect(response.status).toBe(200);
        const { results } = response.body;
        expect(results).toBeDefined();
        expect(results.charts.length).toBeGreaterThan(0);
        // Only verify exact offset math if total is small enough to fit in one page
        if (results.charts.length < 100) {
            expect(results.total - results.charts.length).toBe(5); // We skipped the first 5
        }
    });

    it('should upload chart as code', async () => {
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const newBinNumber = Math.floor(Math.random() * 10) + 1;
        const customDimension: CustomBinDimension = chartAsCode.metricQuery
            .customDimensions![0] as CustomBinDimension;
        const updatedChartAsCode = {
            ...chartAsCode,
            description: newDescription,
            metricQuery: {
                ...chartAsCode.metricQuery,
                customDimensions: [
                    {
                        ...customDimension,
                        binNumber: newBinNumber,
                    },
                ],
            },
        };

        const response = await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/charts/${chartAsCode.slug}`,
            updatedChartAsCode,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.charts).toBeInstanceOf(Array);
        expect(response.body.results.charts[0].action).toBe('update');
        const updatedChart = response.body.results.charts[0].data;
        expect(updatedChart.description).toBe(newDescription);
        expect(updatedChart.metricQuery.customDimensions[0].binNumber).toBe(
            newBinNumber,
        );
    });
});

describe('Dashboards as Code API', () => {
    let admin: ApiClient;
    let dashboardAsCode: DashboardAsCode;
    let dashboardUuid: string | null = null;

    beforeAll(async () => {
        admin = await login();
        const fixture = loadYamlFixture<DashboardAsCode>('dashboardAsCode.yml');
        const uniqueId = randomUUID();
        dashboardAsCode = {
            ...fixture,
            name: `${fixture.name} [${uniqueId}]`,
            slug: `content-as-code-dashboard-${uniqueId}`,
        };
        const response = await admin.post<
            Body<Pick<PromotionChanges, 'dashboards'>>
        >(
            `/api/v1/projects/${projectUuid}/code/dashboards/${dashboardAsCode.slug}`,
            dashboardAsCode,
        );
        expect(response.status).toBe(200);
        dashboardUuid = getCreatedUuid(
            response.body.results.dashboards,
            'dashboard as code fixture',
        );
    });

    afterAll(async () => {
        if (dashboardUuid === null) return;
        const deleteResponse = await admin.delete(
            `/api/v1/dashboards/${dashboardUuid}`,
        );
        expect(deleteResponse.status).toBe(200);
        const getResponse = await admin.get(
            `/api/v1/dashboards/${dashboardUuid}`,
            { failOnStatusCode: false },
        );
        expect(getResponse.status).toBe(404);
    });

    it('make sure the dashboard is loaded from YML', () => {
        expect(dashboardAsCode).toBeDefined();
    });

    it('should download dashboards as code', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.dashboards).toBeInstanceOf(Array);
        expect(response.body.results.dashboards.length).toBeGreaterThan(0);
        // Only check for specific dashboard if all fit in one page
        if (response.body.results.dashboards.length < 100) {
            const dashboard = response.body.results.dashboards.find(
                (c: { slug: string }) => c.slug === dashboardAsCode.slug,
            );
            expect(dashboard).toBeDefined();
        }
    });

    it('should download dashboards as code by slug', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards?ids=${dashboardAsCode.slug}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.dashboards.length).toBe(1);
        const dashboard = response.body.results.dashboards.find(
            (c: { slug: string }) => c.slug === dashboardAsCode.slug,
        );
        expect(dashboard).toBeDefined();
        expect(response.body.results.missingIds).toBeInstanceOf(Array);
        expect(response.body.results.missingIds.length).toBe(0);
    });

    it('should download dashboards as code with offset', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards?offset=1`,
        );
        expect(response.status).toBe(200);
        const { results } = response.body;
        expect(results).toBeDefined();
        expect(results.dashboards.length).toBeGreaterThan(0);
        // Only verify exact offset math if total is small enough to fit in one page
        if (results.dashboards.length < 100) {
            expect(results.total - results.dashboards.length).toBe(1);
        }
    });

    it('should upload dashboard as code', async () => {
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const updatedDashboardAsCode = {
            ...dashboardAsCode,
            description: newDescription,
        };

        const response = await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards/${dashboardAsCode.slug}`,
            updatedDashboardAsCode,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.dashboards).toBeInstanceOf(Array);
        expect(response.body.results.dashboards[0].action).toBe('update');
        const updatedDashboard = response.body.results.dashboards[0].data;
        expect(updatedDashboard.description).toBe(newDescription);
    });

    it('should preserve date zoom controls and tileTargets through upload/download round-trip', async () => {
        // The fixture tiles have no tileSlug, so date zoom tileTargets are keyed
        // by chartSlug. On upload the slug is resolved to the tile's (regenerated)
        // uuid, and on download it is converted back to the slug.
        const controlUuid = '11111111-1111-4111-8111-111111111111';
        const targetSlug = 'how-many-orders-we-have-over-time';
        const dashboardWithDateZoom = {
            ...dashboardAsCode,
            config: {
                isDateZoomDisabled: false,
                dateZoomConfig: {
                    controls: [
                        {
                            uuid: controlUuid,
                            name: 'Orders zoom',
                            granularity: 'Week',
                        },
                    ],
                    tileTargets: {
                        [targetSlug]: {
                            controlUuid,
                            fieldId: 'orders_order_date',
                            tableName: 'orders',
                        },
                    },
                },
            },
        };

        const uploadResponse = await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards/${dashboardAsCode.slug}`,
            dashboardWithDateZoom,
        );
        expect(uploadResponse.status).toBe(200);
        expect(uploadResponse.body.results.dashboards[0].action).toBe('update');

        const downloadResponse = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/dashboards?ids=${dashboardAsCode.slug}`,
        );
        expect(downloadResponse.status).toBe(200);
        const downloaded = downloadResponse.body.results.dashboards[0];

        // Control definition survives, keyed by its own uuid
        expect(downloaded.config.dateZoomConfig.controls).toEqual([
            {
                uuid: controlUuid,
                name: 'Orders zoom',
                granularity: 'Week',
            },
        ]);

        // tileTargets survives the round-trip, re-keyed back to the tile slug
        expect(downloaded.config.dateZoomConfig.tileTargets).toEqual({
            [targetSlug]: {
                controlUuid,
                fieldId: 'orders_order_date',
                tableName: 'orders',
            },
        });
    });
});

describe('SQL Charts as Code API', () => {
    let admin: ApiClient;
    let sqlChartAsCode: SqlChartAsCode;

    beforeAll(async () => {
        admin = await login();
        sqlChartAsCode = loadYamlFixture<SqlChartAsCode>('sqlChartAsCode.yml');
    });

    it('should download SQL charts as code', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts`,
        );
        expect(response.status).toBe(200);

        const { results } = response.body;

        expect(results).toBeDefined();
        expect(results.sqlCharts).toBeInstanceOf(Array);
    });

    it('should upload SQL chart as code (create)', async () => {
        const createdSqlChartSlug = `sql-chart-e2e-test-${Date.now()}`;
        const newSqlChart = {
            ...sqlChartAsCode,
            slug: createdSqlChartSlug,
            name: `SQL Chart E2E Test ${Date.now()}`,
        };

        const response = await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts/${createdSqlChartSlug}`,
            newSqlChart,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.charts).toBeInstanceOf(Array);
        expect(response.body.results.charts[0].action).toBe('create');
    });

    it('should download SQL charts as code by slug', async () => {
        // First create a chart to download
        const createdSqlChartSlug = `sql-chart-e2e-download-${Date.now()}`;
        const newSqlChart = {
            ...sqlChartAsCode,
            slug: createdSqlChartSlug,
            name: `SQL Chart E2E Download Test ${Date.now()}`,
        };

        await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts/${createdSqlChartSlug}`,
            newSqlChart,
        );

        // Now download by slug
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts?ids=${createdSqlChartSlug}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.sqlCharts.length).toBe(1);
        const sqlChart = response.body.results.sqlCharts.find(
            (c: { slug: string }) => c.slug === createdSqlChartSlug,
        );
        expect(sqlChart).toBeDefined();
        expect(response.body.results.missingIds).toBeInstanceOf(Array);
        expect(response.body.results.missingIds.length).toBe(0);
    });

    it('should upload SQL chart as code (update)', async () => {
        // First create a chart
        const createdSqlChartSlug = `sql-chart-e2e-update-${Date.now()}`;
        const newSqlChart = {
            ...sqlChartAsCode,
            slug: createdSqlChartSlug,
            name: 'SQL Chart E2E Update Test',
        };

        await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts/${createdSqlChartSlug}`,
            newSqlChart,
        );

        // Now update it
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const newSql = 'SELECT * FROM "postgres"."jaffle"."payments" LIMIT 5';
        const updatedSqlChart = {
            ...newSqlChart,
            description: newDescription,
            sql: newSql,
        };

        const response = await admin.post<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts/${createdSqlChartSlug}`,
            updatedSqlChart,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.charts).toBeInstanceOf(Array);
        expect(response.body.results.charts[0].action).toBe('update');
    });

    it('should download SQL charts as code with offset', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts?offset=0`,
        );
        expect(response.status).toBe(200);
        const { results } = response.body;
        expect(results).toBeDefined();
        expect(results.sqlCharts).toBeInstanceOf(Array);
    });

    it('should return missing IDs for non-existent SQL charts', async () => {
        const nonExistentSlug = 'non-existent-sql-chart-slug-12345';
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/code/sqlCharts?ids=${nonExistentSlug}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results.missingIds).toBeInstanceOf(Array);
        expect(response.body.results.missingIds).toContain(nonExistentSlug);
    });
});
