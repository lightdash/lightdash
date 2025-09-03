import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';

const apiUrl = '/api/v1';
const searchKeyword = 'revenue';

interface SearchResult {
    name: string;
    search_rank: number;
    charts?: { name: string }[];
}

test.describe('Search API - Enhanced Dashboard and Chart Search', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test.describe('Dashboard search with chart content', () => {
        test('Should find dashboards by searching for chart content', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status()).toBe(200);
            const body = await response.json();

            expect(body).toHaveProperty('results');
            const { dashboards, savedCharts } = body.results;

            expect(dashboards).toBeInstanceOf(Array);
            const dashboardNames = dashboards.map((d: SearchResult) => d.name);
            expect(dashboardNames).toContain('Jaffle dashboard');
            expect(dashboardNames).toContain('Dashboard with dashboard charts');

            expect(savedCharts).toBeInstanceOf(Array);
            const chartNames = savedCharts.map((c: SearchResult) => c.name);
            expect(chartNames).toContain(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
            expect(chartNames).toContain("What's our total revenue to date?");
        });

        test('Should include charts from both direct and tile relationships in dashboard results', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status()).toBe(200);

            const body = await response.json();
            const { dashboards } = body.results;

            const jaffleDashboard = dashboards.find(
                (d: SearchResult) => d.name === 'Jaffle dashboard',
            );
            expect(jaffleDashboard).toBeDefined();
            expect(jaffleDashboard.charts).toBeInstanceOf(Array);

            const jaffleChartNames = jaffleDashboard.charts?.map(
                (c: { name: string }) => c.name,
            );
            expect(jaffleChartNames).toContain(
                'How much revenue do we have per payment method?',
            );
            expect(jaffleChartNames).toContain(
                "What's our total revenue to date?",
            );

            const dashboardWithCharts = dashboards.find(
                (d: SearchResult) =>
                    d.name === 'Dashboard with dashboard charts',
            );
            expect(dashboardWithCharts).toBeDefined();
            expect(dashboardWithCharts.charts).toBeInstanceOf(Array);

            const directChartNames = dashboardWithCharts.charts?.map(
                (c: { name: string }) => c.name,
            );
            expect(directChartNames).toContain(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
        });

        test('Should rank dashboards by relevance including chart content', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status()).toBe(200);

            const body = await response.json();
            const { dashboards } = body.results;

            dashboards.forEach((dashboard: SearchResult) => {
                expect(dashboard.search_rank).toBeGreaterThan(0);
            });

            for (let i = 1; i < dashboards.length; i += 1) {
                expect(dashboards[i - 1].search_rank).toBeGreaterThanOrEqual(
                    dashboards[i].search_rank,
                );
            }
        });
    });

    test.describe('Chart metadata in search results', () => {
        test('Should handle SQL charts with null metadata gracefully', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/chart`,
            );
            expect(response.status()).toBe(200);
        });
    });

    test.describe('Search edge cases', () => {
        test('Should return empty results for non-matching searches', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/xyznonexistentterm`,
            );
            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body).toHaveProperty('results');

            const { dashboards, savedCharts, sqlCharts } = body.results;
            expect(dashboards).toBeInstanceOf(Array);
            expect(dashboards).toHaveLength(0);
            expect(savedCharts).toBeInstanceOf(Array);
            expect(savedCharts).toHaveLength(0);
            expect(sqlCharts).toBeInstanceOf(Array);
            expect(sqlCharts).toHaveLength(0);
        });

        test('Should handle special characters in search queries', async ({
            request,
        }) => {
            const response = await request.get(
                `${apiUrl}/projects/${
                    SEED_PROJECT.project_uuid
                }/search/${encodeURIComponent("revenue' OR '1'='1")}`,
            );
            expect(response.status()).toBe(200);
            const body = await response.json();
            expect(body).toHaveProperty('results');
        });
    });
});
