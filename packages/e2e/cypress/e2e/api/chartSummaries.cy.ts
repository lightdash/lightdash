import { SEED_PROJECT } from '@lightdash/common';

const chartSummariesEndpointPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/chart-summaries`;

describe('Lightdash chart summaries endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('List should include charts saved in dashboards', () => {
        cy.request(chartSummariesEndpointPath).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.map((chart) => chart.name)).to.include(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
        });
    });
    it('List should exclude charts saved in dashboards', () => {
        cy.request(
            `${chartSummariesEndpointPath}?excludeChartsSavedInDashboard=true`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results.map((chart) => chart.name)).to.not.include(
                '[Saved in dashboard] How much revenue do we have per payment method?',
            );
        });
    });
});
