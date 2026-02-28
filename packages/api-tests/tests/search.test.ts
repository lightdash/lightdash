import { AnyType, SEED_PROJECT } from '@lightdash/common';
import { Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';
const searchKeyword = 'revenue';

type SearchResults = {
    dashboards: Array<{
        name: string;
        charts: Array<{ name: string }>;
        search_rank: number;
    }>;
    savedCharts: Array<{ name: string }>;
    sqlCharts: Array<{ name: string }>;
};

describe('Search API - Enhanced Dashboard and Chart Search', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    describe('Dashboard search with chart content', () => {
        it('Should find dashboards by searching for chart content', async () => {
            const response = await admin.get<Body<SearchResults>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('results');

            const { dashboards, savedCharts } = response.body.results;

            expect(dashboards).toBeInstanceOf(Array);
            const dashboardNames = dashboards.map((d: AnyType) => d.name);
            expect(dashboardNames).toContain('Jaffle dashboard');
            expect(dashboardNames).toContain('Dashboard with dashboard charts');

            expect(savedCharts).toBeInstanceOf(Array);
            const chartNames = savedCharts.map((c: AnyType) => c.name);
            expect(chartNames).toContain(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
            expect(chartNames).toContain("What's our total revenue to date?");
        });

        it('Should include charts from both direct and tile relationships in dashboard results', async () => {
            const response = await admin.get<Body<SearchResults>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status).toBe(200);
            const { dashboards } = response.body.results;

            const jaffleDashboard = dashboards.find(
                (d: AnyType) => d.name === 'Jaffle dashboard',
            );
            expect(jaffleDashboard).toBeDefined();
            expect(jaffleDashboard!.charts).toBeInstanceOf(Array);

            const jaffleChartNames = jaffleDashboard!.charts.map(
                (c: AnyType) => c.name,
            );
            expect(jaffleChartNames).toContain(
                'How much revenue do we have per payment method?',
            );
            expect(jaffleChartNames).toContain(
                "What's our total revenue to date?",
            );

            const dashboardWithCharts = dashboards.find(
                (d: AnyType) => d.name === 'Dashboard with dashboard charts',
            );
            expect(dashboardWithCharts).toBeDefined();
            expect(dashboardWithCharts!.charts).toBeInstanceOf(Array);

            const directChartNames = dashboardWithCharts!.charts.map(
                (c: AnyType) => c.name,
            );
            expect(directChartNames).toContain(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
        });

        it('Should rank dashboards by relevance including chart content', async () => {
            const response = await admin.get<Body<SearchResults>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            );
            expect(response.status).toBe(200);
            const { dashboards } = response.body.results;

            dashboards.forEach((dashboard: AnyType) => {
                expect(dashboard.search_rank).toBeGreaterThan(0);
            });

            for (let i = 1; i < dashboards.length; i++) {
                expect(dashboards[i - 1].search_rank).toBeGreaterThanOrEqual(
                    dashboards[i].search_rank,
                );
            }
        });
    });

    describe('Chart metadata in search results', () => {
        it('Should handle SQL charts with null metadata gracefully', async () => {
            const response = await admin.get<Body<unknown>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/chart`,
            );
            expect(response.status).toBe(200);
        });
    });

    describe('Search edge cases', () => {
        it('Should return empty results for non-matching searches', async () => {
            const response = await admin.get<Body<SearchResults>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/xyznonexistentterm`,
            );
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('results');

            const { dashboards, savedCharts, sqlCharts } =
                response.body.results;
            expect(dashboards).toHaveLength(0);
            expect(savedCharts).toHaveLength(0);
            expect(sqlCharts).toHaveLength(0);
        });

        it('Should handle special characters in search queries', async () => {
            const response = await admin.get<Body<unknown>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${encodeURIComponent("revenue' OR '1'='1")}`,
            );
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('results');
        });
    });
});
