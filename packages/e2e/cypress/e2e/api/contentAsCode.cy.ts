import { CustomBinDimension, SEED_PROJECT } from '@lightdash/common';
import { chartAsCode } from '../../support/mocks';

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
            cy.wrap(response.body.results.charts)
                .its('length')
                .should('be.gt', 0);
            const chart = response.body.results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            cy.wrap(chart).should('exist');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds)
                .its('length')
                .should('eq', 0);
        });
    });

    it('should download charts as code by slug', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?ids=${chartAsCode.slug}`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.charts.length).should('eq', 1);
            const chart = response.body.results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            cy.wrap(chart).should('exist');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds)
                .its('length')
                .should('eq', 0);
        });
    });

    it('should download charts as code with offset', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?offset=5`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            const { results } = response.body;
            cy.wrap(results).should('exist');
            cy.wrap(results.charts).should('be.an', 'array');
            cy.wrap(results.length).should('be.gt', 0);
            cy.wrap(results.total - results.charts.length).should('eq', 5);
        });
    });

    it('should upload chart as code', () => {
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

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/${chartAsCode.slug}/code`,
            body: updatedChartAsCode,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.charts).should('be.an', 'array');
            cy.wrap(response.body.results.charts[0].action).should(
                'eq',
                'update',
            );
            const updatedChart = response.body.results.charts[0].data;
            cy.wrap(updatedChart.description).should('eq', newDescription);
            cy.wrap(
                updatedChart.metricQuery.customDimensions[0].binNumber,
            ).should('eq', newBinNumber);
        });
    });
});
