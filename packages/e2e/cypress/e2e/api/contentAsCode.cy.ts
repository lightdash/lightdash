import {
    ChartAsCode,
    CustomBinDimension,
    DashboardAsCode,
    SEED_PROJECT,
} from '@lightdash/common';
import * as yaml from 'js-yaml';

describe('Charts as Code API', () => {
    let chartAsCode: ChartAsCode;
    beforeEach(() => {
        cy.readFile('./cypress/support/chartAsCode.yml', 'utf8').then(
            (chartFile) => {
                chartAsCode = yaml.load(chartFile) as ChartAsCode;
            },
        );
        cy.login();
    });

    it('make sure the chart is loaded from YML', () => {
        cy.log('chartAsCode', chartAsCode);
        cy.wrap(chartAsCode).should('exist');
    });
    it('should download charts as code', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);

            const { results } = response.body;

            cy.wrap(results).should('exist');
            cy.wrap(results.charts).should('be.an', 'array');
            cy.wrap(results.charts).its('length').should('be.gt', 0);
            const chart = results.charts.find(
                (c: { slug: string }) => c.slug === chartAsCode.slug,
            );
            cy.wrap(chart).should('exist');

            // makes sure we donwloaded everything
            // This will not work if the project has more than 100 charts
            if (results.charts.length < 100)
                cy.wrap(results.total).should('eq', results.charts.length);
        });
    });

    it('should download charts as code by slug', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?ids=${chartAsCode.slug}`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
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
            cy.wrap(results.charts.length).should('be.gt', 0);
            cy.wrap(results.total - results.charts.length).should('eq', 5); // We skipped the first 5
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

describe('Dashboards as Code API', () => {
    let dashboardAsCode: DashboardAsCode;
    beforeEach(() => {
        cy.readFile('./cypress/support/dashboardAsCode.yml', 'utf8').then(
            (dashboardFile) => {
                dashboardAsCode = yaml.load(dashboardFile) as DashboardAsCode;
            },
        );
        cy.login();
    });
    it('make sure the dashboard is loaded from YML', () => {
        cy.log('dashboardAsCode', dashboardAsCode);
        cy.wrap(dashboardAsCode).should('exist');
    });
    it('should download dashboards as code', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards).should('be.an', 'array');
            cy.wrap(response.body.results.dashboards)
                .its('length')
                .should('be.gt', 0);
            const dashboard = response.body.results.dashboards.find(
                (c: { slug: string }) => c.slug === dashboardAsCode.slug,
            );
            cy.wrap(dashboard).should('exist');
        });
    });

    it('should download dashboards as code by slug', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code?ids=${dashboardAsCode.slug}`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards.length).should('eq', 1);
            const dashboard = response.body.results.dashboards.find(
                (c: { slug: string }) => c.slug === dashboardAsCode.slug,
            );
            cy.wrap(dashboard).should('exist');
            cy.wrap(response.body.results.missingIds).should('be.an', 'array');
            cy.wrap(response.body.results.missingIds)
                .its('length')
                .should('eq', 0);
        });
    });

    it('should download dashboards as code with offset', () => {
        cy.request({
            method: 'GET',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/code?offset=1`,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            const { results } = response.body;
            cy.wrap(results).should('exist');
            cy.wrap(results.dashboards.length).should('be.gt', 0);
            cy.wrap(results.total - results.dashboards.length).should('eq', 1);
        });
    });

    it('should upload dashboard as code', () => {
        const newDescription = `Updated description ${new Date().toISOString()}`;
        const updateddashboardAsCode = {
            ...dashboardAsCode,
            description: newDescription,
        };

        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardAsCode.slug}/code`,
            body: updateddashboardAsCode,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
            cy.wrap(response.body.results).should('exist');
            cy.wrap(response.body.results.dashboards).should('be.an', 'array');
            cy.wrap(response.body.results.dashboards[0].action).should(
                'eq',
                'update',
            );
            const updateddashboard = response.body.results.dashboards[0].data;
            cy.wrap(updateddashboard.description).should('eq', newDescription);
        });
    });
});
