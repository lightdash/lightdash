/// <reference types="cypress" />

import { SEED_PROJECT } from '@lightdash/common';
import { join } from 'path';
import { chartMock } from '../../support/mocks';

describe('Content as Code CLI', () => {
    const lightdashDir = join(process.cwd(), 'lightdash');
    const chartsDir = join(lightdashDir, 'charts');

    beforeEach(() => {
        cy.login();
        // Clean up any existing lightdash directory
        cy.exec(`rm -rf ${lightdashDir}`);
    });

    afterEach(() => {
        // Clean up after tests
        cy.exec(`rm -rf ${lightdashDir}`);
    });

    it('should download and upload charts as code using CLI', () => {
        // Create a test chart first
        const testChart = {
            ...chartMock,
            name: 'CLI Test Chart',
            description: 'Test chart for CLI content as code',
            updatedAt: new Date().toISOString(),
            slug: 'cli-test-chart',
        };

        // Create the chart via API
        cy.request({
            method: 'POST',
            url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/${testChart.slug}/code`,
            body: testChart,
        }).then((response) => {
            cy.wrap(response).its('status').should('eq', 200);
        });

        // Download the chart using CLI
        cy.exec('lightdash download --charts cli-test-chart').then((result) => {
            cy.wrap(result.code).should('eq', 0);

            // Verify the chart file exists
            cy.readFile(join(chartsDir, 'cli-test-chart.yml')).then(
                (content) => {
                    const chartYaml = content as typeof testChart;
                    cy.wrap(chartYaml.name).should('eq', testChart.name);
                    cy.wrap(chartYaml.description).should(
                        'eq',
                        testChart.description,
                    );
                    cy.wrap(chartYaml.slug).should('eq', testChart.slug);
                },
            );
        });

        // Modify the downloaded chart
        cy.readFile(join(chartsDir, 'cli-test-chart.yml')).then((content) => {
            const modifiedChart = {
                ...content,
                name: 'Modified CLI Test Chart',
                description: 'Modified test chart description',
            };
            cy.writeFile(join(chartsDir, 'cli-test-chart.yml'), modifiedChart);
        });

        // Upload the modified chart using CLI
        cy.exec('lightdash upload --charts cli-test-chart').then((result) => {
            cy.wrap(result.code).should('eq', 0);
            cy.wrap(result.stdout).should('include', 'charts created');

            // Verify the changes via API
            cy.request({
                method: 'GET',
                url: `/api/v1/projects/${SEED_PROJECT.project_uuid}/charts/code?ids=cli-test-chart`,
            }).then((response) => {
                cy.wrap(response).its('status').should('eq', 200);
                cy.wrap(response.body.results.charts[0]).should('include', {
                    name: 'Modified CLI Test Chart',
                    description: 'Modified test chart description',
                });
            });
        });
    });
});
