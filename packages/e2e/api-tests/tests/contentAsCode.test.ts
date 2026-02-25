import {
    ChartAsCode,
    CustomBinDimension,
    DashboardAsCode,
    SEED_PROJECT,
    SqlChartAsCode,
} from '@lightdash/common';
import * as fs from 'fs';
// @ts-expect-error - js-yaml types not in e2e package.json devDependencies
import * as yaml from 'js-yaml';
import * as path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';

const projectUuid = SEED_PROJECT.project_uuid;

// Load YAML fixtures
const fixturesDir = path.resolve(__dirname, '../../cypress/support');

function loadYamlFixture<T>(filename: string): T {
    const filePath = path.join(fixturesDir, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.load(content) as T;
}

describe('Charts as Code API', () => {
    let admin: ApiClient;
    let chartAsCode: ChartAsCode;

    beforeAll(async () => {
        admin = await login();
        chartAsCode = loadYamlFixture<ChartAsCode>('chartAsCode.yml');
    });

    it('make sure the chart is loaded from YML', () => {
        expect(chartAsCode).toBeDefined();
    });

    it('should download charts as code', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/charts/code`,
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
            `/api/v1/projects/${projectUuid}/charts/code?ids=${chartAsCode.slug}`,
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
            `/api/v1/projects/${projectUuid}/charts/code?offset=5`,
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
            `/api/v1/projects/${projectUuid}/charts/${chartAsCode.slug}/code`,
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

    beforeAll(async () => {
        admin = await login();
        dashboardAsCode = loadYamlFixture<DashboardAsCode>(
            'dashboardAsCode.yml',
        );
    });

    it('make sure the dashboard is loaded from YML', () => {
        expect(dashboardAsCode).toBeDefined();
    });

    it('should download dashboards as code', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/dashboards/code`,
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
            `/api/v1/projects/${projectUuid}/dashboards/code?ids=${dashboardAsCode.slug}`,
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
            `/api/v1/projects/${projectUuid}/dashboards/code?offset=1`,
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
            `/api/v1/projects/${projectUuid}/dashboards/${dashboardAsCode.slug}/code`,
            updatedDashboardAsCode,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.dashboards).toBeInstanceOf(Array);
        expect(response.body.results.dashboards[0].action).toBe('update');
        const updatedDashboard = response.body.results.dashboards[0].data;
        expect(updatedDashboard.description).toBe(newDescription);
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
            `/api/v1/projects/${projectUuid}/sqlCharts/code`,
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
            `/api/v1/projects/${projectUuid}/sqlCharts/${createdSqlChartSlug}/code`,
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
            `/api/v1/projects/${projectUuid}/sqlCharts/${createdSqlChartSlug}/code`,
            newSqlChart,
        );

        // Now download by slug
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/sqlCharts/code?ids=${createdSqlChartSlug}`,
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
            `/api/v1/projects/${projectUuid}/sqlCharts/${createdSqlChartSlug}/code`,
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
            `/api/v1/projects/${projectUuid}/sqlCharts/${createdSqlChartSlug}/code`,
            updatedSqlChart,
        );
        expect(response.status).toBe(200);
        expect(response.body.results).toBeDefined();
        expect(response.body.results.charts).toBeInstanceOf(Array);
        expect(response.body.results.charts[0].action).toBe('update');
    });

    it('should download SQL charts as code with offset', async () => {
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/sqlCharts/code?offset=0`,
        );
        expect(response.status).toBe(200);
        const { results } = response.body;
        expect(results).toBeDefined();
        expect(results.sqlCharts).toBeInstanceOf(Array);
    });

    it('should return missing IDs for non-existent SQL charts', async () => {
        const nonExistentSlug = 'non-existent-sql-chart-slug-12345';
        const response = await admin.get<any>(
            `/api/v1/projects/${projectUuid}/sqlCharts/code?ids=${nonExistentSlug}`,
        );
        expect(response.status).toBe(200);
        expect(response.body.results.missingIds).toBeInstanceOf(Array);
        expect(response.body.results.missingIds).toContain(nonExistentSlug);
    });
});
