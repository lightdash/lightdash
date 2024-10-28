import { SEED_PROJECT } from '@lightdash/common';

const chartSummariesEndpointPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/chart-summaries`;

describe('Lightdash chart summaries endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should list charts in spaces', () => {
        cy.request(chartSummariesEndpointPath).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(9);
        });
    });
    it('Should list charts in spaces and dashboards', () => {
        cy.request(
            `${chartSummariesEndpointPath}?includeChartSavedInDashboards=true`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(10);
        });
    });
});
