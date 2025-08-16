import { AnyType, SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';
const searchKeyword = 'revenue';

describe('Search API - Enhanced Dashboard and Chart Search', () => {
    beforeEach(() => {
        cy.login();
    });

    describe('Dashboard search with chart content', () => {
        it('Should find dashboards by searching for chart content', () => {
            // Search for "revenue" which should find dashboards containing charts about revenue
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('results');

                const { dashboards, savedCharts } = response.body.results;

                // Should find both dashboards that contain revenue-related charts
                expect(dashboards).to.be.an('array');
                const dashboardNames = dashboards.map((d: AnyType) => d.name);
                expect(dashboardNames).to.include('Jaffle dashboard');
                expect(dashboardNames).to.include(
                    'Dashboard with dashboard charts',
                );

                // Should also find individual charts
                expect(savedCharts).to.be.an('array');
                const chartNames = savedCharts.map((c: AnyType) => c.name);
                expect(chartNames).to.include(
                    '[Saved in dashboard] How much revenue do we have per payment method?',
                );
                expect(chartNames).to.include(
                    "What's our total revenue to date?",
                );
            });
        });

        it('Should include charts from both direct and tile relationships in dashboard results', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                const { dashboards } = response.body.results;

                // Find "Jaffle dashboard" - uses tile relationships
                const jaffleDashboard = dashboards.find(
                    (d: AnyType) => d.name === 'Jaffle dashboard',
                );
                expect(jaffleDashboard != null).to.equal(true);
                expect(jaffleDashboard.charts).to.be.an('array');

                // Should have charts including revenue-related ones
                const jaffleChartNames = jaffleDashboard.charts.map(
                    (c: AnyType) => c.name,
                );
                expect(jaffleChartNames).to.include(
                    'How much revenue do we have per payment method?',
                );
                expect(jaffleChartNames).to.include(
                    "What's our total revenue to date?",
                );

                // Find "Dashboard with dashboard charts" - uses direct relationships
                const dashboardWithCharts = dashboards.find(
                    (d: AnyType) =>
                        d.name === 'Dashboard with dashboard charts',
                );
                expect(dashboardWithCharts != null).to.equal(true);
                expect(dashboardWithCharts.charts).to.be.an('array');

                // Should have charts including saved dashboard charts
                const directChartNames = dashboardWithCharts.charts.map(
                    (c: AnyType) => c.name,
                );
                expect(directChartNames).to.include(
                    '[Saved in dashboard] How much revenue do we have per payment method?',
                );
            });
        });

        it('Should rank dashboards by relevance including chart content', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/${searchKeyword}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                const { dashboards } = response.body.results;

                // All dashboards with revenue-related content should have positive search ranks
                dashboards.forEach((dashboard: AnyType) => {
                    expect(dashboard.search_rank).to.be.greaterThan(0);
                });

                // Results should be ordered by search rank (descending)
                // eslint-disable-next-line no-plusplus
                for (let i = 1; i < dashboards.length; i++) {
                    expect(dashboards[i - 1].search_rank).to.be.at.least(
                        dashboards[i].search_rank,
                    );
                }
            });
        });
    });

    describe('Chart metadata in search results', () => {
        it('Should handle SQL charts with null metadata gracefully', () => {
            // Search for a term that might return SQL charts
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/chart`,
            }).then((response) => {
                expect(response.status).to.eq(200);
            });
        });
    });

    describe('Search edge cases', () => {
        it('Should return empty results for non-matching searches', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/xyznonexistentterm`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('results');

                const { dashboards, savedCharts, sqlCharts } =
                    response.body.results;
                expect(dashboards).to.be.an('array').and.have.lengthOf(0);
                expect(savedCharts).to.be.an('array').and.have.lengthOf(0);
                expect(sqlCharts).to.be.an('array').and.have.lengthOf(0);
            });
        });

        it('Should handle special characters in search queries', () => {
            // Test with special characters that could break SQL if not properly escaped
            cy.request({
                method: 'GET',
                url: `${apiUrl}/projects/${
                    SEED_PROJECT.project_uuid
                }/search/${encodeURIComponent("revenue' OR '1'='1")}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                // Should handle SQL injection attempts gracefully
                expect(response.body).to.have.property('results');
            });
        });
    });
});
