import { SEED_PROJECT } from '@lightdash/common';
import { contentAsCodeChartMock } from '../../support/mocks';

describe('Content as Code API', () => {
    beforeEach(() => {
        cy.login();
    });

    it('should download charts as code', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
        });
    });

    it('should upload chart as code', () => {
        const chartCode = {
            ...contentAsCodeChartMock,
            name: 'Test Chart Code',
            description: 'Test chart description for content as code',
            updatedAt: new Date().toISOString(),
            slug: 'test-chart-code',
        };

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/${chartCode.slug}/code`,
            body: chartCode,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.charts[0]).should(
                'have.property',
                'action',
            );
            cy.wrap(response.body.results.charts[0].action).should('be.oneOf', [
                'create',
                'update',
            ]);
        });
    });
});
